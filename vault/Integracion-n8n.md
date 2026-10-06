# Integración n8n

Los mensajes del chat se reenvían a un **webhook de n8n** que genera las respuestas (IA / procesamiento de archivos). Implementado en `src/services/chat.ts` (`sendToN8n`) y `src/lib/n8nMode.ts`.

## Instancia actual

n8n **self-hosted en Easypanel**:

- Host: `polarierauto-n8n.1tn4v0.easypanel.host`
- Webhook ID: `cf778e0b-9af0-4f65-99f5-fc50634f2a90`
- **Producción:** `https://polarierauto-n8n.1tn4v0.easypanel.host/webhook/<id>`
- **Test:** `https://polarierauto-n8n.1tn4v0.easypanel.host/webhook-test/<id>`

> Antes se usaba n8n cloud (`automate-cuba24.app.n8n.cloud`), que se migró. Ver [[Decisiones]].

## Modo prod vs test

Se controla con la variable **`VITE_N8N_MODE`** (`prod` | `test`), decidida en **build time** (`n8nMode.ts`). Ningún usuario puede cambiarlo desde la app. Para alternar: cambiar la variable en [[Deploy-Easypanel|Easypanel]] + Rebuild.

| Endpoint | Cuándo responde |
|----------|-----------------|
| `/webhook/...` (prod) | Solo si el **workflow está activado** (toggle *Active* en n8n). Responde 24/7. |
| `/webhook-test/...` (test) | Solo tras pulsar **"Listen for test event"**, y **caduca tras 1 llamada**. Solo para pruebas manuales. |

> Si ves un **404 "webhook not registered"**: en prod = el workflow no está activo; en test = no está en escucha. No es un bug de la app.

## Formato del payload que envía la app

```json
{
  "chat_id": "...", "user_id": "...",
  "user_name": "...", "user_email": "...",
  "message": "...", "role": "user",
  "timestamp": "ISO",
  "file": { "id","file_name","file_path","mime_type","size_bytes" }
}
```

- **La app NO manda el archivo binario.** Sube el archivo a Supabase Storage y envía sus **metadatos** en `file`. El workflow de n8n descarga el archivo desde Supabase usando `file_path` (nodo HTTP Request → `.../storage/v1/object/documents/{{ file_path }}`).

## Formato de respuesta que espera la app

`sendToN8n` interpreta la respuesta según el `content-type`:

- **Binario** (`application/pdf`, `application/vnd...`, `octet-stream`, `image/*`, `audio/*`) → sube a Storage y muestra enlace/reproductor.
- **JSON** → busca texto en claves prioritarias: `respuesta`, `response`, `message`, `text`, `content`, `output`, `result`, `answer`, `reply`. También detecta URLs de audio/imagen.
- **Texto que es una URL** → descarga ese archivo y lo muestra.

> **Robustez:** si el webhook responde `200` con cuerpo vacío o JSON inválido, la app ya NO revienta en silencio (se leía `res.json()` sin comprobar body). Corregido. Ver [[Decisiones]].

## Nodo "Respond to Webhook" en n8n

Para que la app reciba la respuesta, el **nodo Webhook de entrada** debe tener `Respond = "Using Respond to Webhook node"`. Si está en "Immediately", n8n responde vacío y la app no muestra nada.

- Para devolver archivos: `Respond With = Binary File`.
- n8n **no descomprime ZIP/RAR de forma nativa** — si se sube un comprimido, el workflow debe descomprimirlo/procesarlo explícitamente. Ver [[Pendientes]].

## Flujo "Enviar informe email" (correo del módulo de auditoría)

Envío del informe de auditoría por correo con el PDF adjunto. **Instancia distinta a la del chat**: n8n cloud `automate-cuba24.app.n8n.cloud`.

- Workflow id: `Komb1YycRFKXTvkX` · Webhook path: `19a7f802-ebd2-43da-9bba-457403f2e4ca`.
- **Prod:** `https://automate-cuba24.app.n8n.cloud/webhook/19a7f802-...` · **Test:** `.../webhook-test/19a7f802-...`
- Config en la app: `VITE_N8N_EMAIL_WEBHOOK_URL(_TEST)` (respeta `VITE_N8N_MODE`). Servicio: `src/services/informeCorreo.ts`.

**Nodos:** `Recibir Informe` (Webhook POST, responseNode) → `PDF desde Base64` (Convert to File `toBinary`, `sourceProperty: body.adjunto.base64`, `dataIsBase64`) → `Enviar Correo` (Gmail send, credencial **Alejandro** `HBi7yP5CZn4l71AS`, adjunto binario `data`, `replyTo = body.remitente`) → `Responder OK` (responde `{ ok: true }`).

**Payload que envía la app** (bajo `body`): `{ para, asunto, mensaje, remitente, remitente_nombre, informe:{titulo,hotel,polo,fecha,...}, adjunto:{ filename, mime_type, base64 } }`.

**Remitente:** técnicamente el correo lo despacha la cuenta Gmail de n8n (Alejandro) — Supabase Auth **no** da acceso SMTP del usuario, así que no se puede enviar "desde" su dirección (fallaría SPF/DKIM/DMARC). Para acercarlo: `senderName` = **nombre del usuario logueado** (`remitente_nombre`) y `replyTo` = **su email** (`remitente`). Así se ve a su nombre y las respuestas le llegan. Enviar realmente desde la cuenta del usuario exigiría OAuth `gmail.send` por usuario (módulo aparte, no hecho). Ver [[Pendientes]].

Pendiente: **activar** el workflow (toggle *Active*) para prod; en test hay que ponerlo a *Listen for test event*. Ver [[Pendientes]].

## MCP de n8n

Existe un conector MCP de n8n disponible en las sesiones de Claude (requiere autorización). Permite inspeccionar/editar workflows programáticamente. El workflow debe tener **"Available in MCP"** activado para poder leerlo/editarlo.

---

## Infraestructura: versiones fijadas y el pythonrunner (2026-10-05)

Las imágenes de Easypanel dejaron de ir a `latest`: n8n está fijado en **`n8nio/n8n:2.33.4`** y n8n-runner en **`n8nio/runners:2.33.4`**. Verificado sin regresiones (4 workflows activos intactos, cero errores nuevos, el task runner ejecuta todas las APIs de los nodos Code sin timeouts). Línea base completa en `C:\Trabajo\Hostinger Manager\n8n-baseline-2026-10-05.md`.

El dominio público del pythonrunner (`polarierauto-pythonrunner.1tn4v0.easypanel.host`) **se retiró**: exponía `POST /run` a internet sin autenticación. Ningún workflow ni la app lo usaban. El acceso interno `http://polarierauto_pythonrunner:8000` sigue vivo (verificado: `/health` → 200 `{"status":"ok"}`).

### El contenedor de n8n NO tiene Python

Comprobado con sonda el 2026-10-05: el contenedor n8n 2.33.4 es **Alpine 3.24 (Docker Hardened Image)** y **no tiene `python3` ni `python`**. El volumen del host está montado en `/data/Polarier` (subcarpetas `Carla`, `Leslie`, `Leslie Global 2025`, `python-runner`).

**Consecuencia:** cualquier script de Python se ejecuta llamando al pythonrunner por HTTP, nunca con un nodo `Execute Command`:

```
POST http://polarierauto_pythonrunner:8000/run
{ "script": "<subcarpeta>/<script>.py", "args": [] }
```

La respuesta trae `stdout` y `stderr`, el mismo contrato que devolvía `Execute Command`, así que los nodos que parsean `$json.stdout` siguen funcionando sin cambios. Así lo hacen ya `HTTP Request1` y `HTTP Request2` para `Leslie/Modelo1.py`.

### Deuda: la rama Carla sigue siendo código de Windows

En `Polarier Auto App` hay 7 nodos heredados de cuando n8n corría en Windows, en la rama que se dispara cuando el fichero subido contiene `MU` (`Switch3` salida 0 → `Read/Write Files from Disk` → `Switch5` → los 6 de renombrado → el nodo de ejecución):

- Los 6 nodos `HAMUS*`, `VAMUS*`, `CAMUS*`, `CCMUS*`, `CXMUS*`, `HOMUS*` ejecutan un **`ren` de Windows** y referencian `$('Google Drive Trigger1')`, **un nodo que ya no existe** en el workflow. Su propósito es renombrar el fichero subido a `<PROV>MUS<semana>.xlsx` para que `actualizar_general.py` lo detecte por prefijo de provincia (`HA`, `VA`, `CA`, `CC`, `CX`, `HO`) y por el marcador de semana `S[1-5]` — de ahí que `HAMUS2.xlsx` funcione: es `HA` + `MU` + `S2`.
- El nodo de ejecución apunta a `C:\Trabajo\N8N\Polarier\Carla\actualizar_general.py`. Se preparó su sustitución por una llamada al pythonrunner, pero **se descartó por decisión de Leo el 2026-10-05**: la rama Carla se queda como está. El diagnóstico queda documentado por si se retoma. El script sí existe en `/data/Polarier/Carla/actualizar_general.py`, no toma argumentos y auto-detecta en su propia carpeta el fichero general (el que contiene `GENERAL` en el nombre) más los provinciales.

Como los renombrados se ejecutan **antes**, arreglar solo el nodo de ejecución **no restaura la rama**. Falta decidir de dónde sale el nombre original del fichero ahora que el trigger es el webhook y no Drive.

### Otros hallazgos pendientes de decisión

- **`Switch4` salida 4 ("Cayo Cruz") compara `contains 'C'`**, que casa con cualquier nombre que lleve una C (Caibarien, Cayo Coco…). `Switch4` alimenta los nodos `Delete rows or columns from sheet*`, que son justo los que fallaron el 24-sep, uno de ellos con *"Cannot delete a row that doesn't exist"*. Sospechoso de enrutar al Sheet equivocado. Mismo patrón en `Switch5` (`'C'` para Caibarién y `'C'` para Cayo Coco).
- **`Switch6` solo define 5 salidas** y le falta la regla de Holguín, que va por una rama aparte (`If4` salida 0 → `Edit Fields5` → `Holguin2`). `Switch1`, con las mismas reglas, sí tiene las 6.
- **`Read/Write Files from Disk` escribe `/data/Polarier/Carla/{{ $binary.data.filename }}`** con `filename` en minúscula, mientras `Switch5` lee `$binary.data.fileName`. En n8n la propiedad es `fileName`, así que esa expresión probablemente resuelva a `undefined`.
- Un valor almacenado con `=` delante en una condición (`'=CXCP'` en `Switch2`, `'=Cruz'` en `Switch1` y `Switch6`) **es una expresión de n8n y evalúa al literal sin el `=`**, así que es inofensivo. Está comprobado empíricamente: Cayo Cruz enruta y se procesa bien en las ejecuciones 402 y 412, pasando por `Switch1` salida 3, cuyo valor es `'=Cruz'`.

### Los Switch de polos están en modo "primera coincidencia"

`Switch4` y `Switch5` (y en general los `switch` de este workflow) tienen `options: {}`, sin `allMatchingOutputs`, así que **gana la primera regla que casa**. Consecuencia práctica: una regla con un `contains` corto en posición temprana **deja inalcanzables** todas las salidas posteriores que compartan esa subcadena. No duplica rutas, las anula.

Corregido como borrador el 2026-10-05 (sin publicar):

| Nodo | Salida | Antes | Ahora | Efecto del bug |
|---|---|---|---|---|
| `Switch4` | 3 Habana | `contains 'La Habana'` | `contains 'Habana'` | El fichero y el Doc se llaman *Modelo 1 Habana*, así que nunca casaba: **los datos de Habana se descartaban en silencio** |
| `Switch4` | 4 Cayo Cruz | `contains 'C'` | `contains 'Cayo Cruz'` | Capturaba también Cayo Coco (la ruta `/data/Polarier/Leslie/` no tiene `C` mayúscula, el polo sí): **los datos de Cayo Coco se escribían en la hoja de Cayo Cruz** y la salida 5 era inalcanzable |
| `Switch5` | 2 Caibarién | `contains 'C'` | `contains 'CA'` | Capturaba los **tres** polos con C: Caibarién, Cayo Coco y Cayo Cruz acababan todos en `CAMUS*` |
| `Switch5` | 3 Cayo Coco | `contains 'C'` | `contains 'CC'` | Inalcanzable |

En `Switch5` el identificador es el **código de provincia de dos letras** (`HA`, `VA`, `CA`, `CC`, `CX`, `HO`), el mismo `MAPA_PROVINCIAS` que usa `actualizar_general.py` leyendo el prefijo. En `Switch4` es el nombre del polo dentro de la ruta `/data/Polarier/Leslie/Modelo 1 <POLO>.xlsx`.

Tras el cambio, ningún valor es subcadena de otro en ninguno de los dos nodos, así que el orden de las reglas deja de importar.

**Esto NO explica los errores del 24-sep** de los `Delete rows or columns from sheet*`: 4 de los 7 tenían el enrutado correcto y se deben al desbordamiento de INT32 en `numberToDelete`, y otros 2 son el 404 de Drive de `Update file1`. Solo la ejecución 409 cae en la salida cuya regla estaba rota, y no hay datos retenidos para distinguir si fue un item de Cayo Coco mal enrutado o un Cayo Cruz legítimo contra una hoja vacía. Lo que sí corrobora el defecto: `sheet3` (Habana) y `sheet5` (Cayo Coco), las dos salidas inalcanzables, **no aparecen en ningún error**, consistente con no haberse ejecutado nunca.

**Why:** el fallo era silencioso, que es peor que un error. Dos polos llevaban tiempo perdiendo o mezclando datos sin que nada lo delatara.

**How to apply:** al tocar cualquier `switch` de polos en este workflow, comprobar que ningún valor sea subcadena de otro, o activar `allMatchingOutputs` solo si de verdad se quiere multidifusión. El patrón `contains 'C'` aparece también en el histórico de `Switch2` y conviene revisar los demás (`Switch`, `Switch1`, `Switch3`, `Switch6`) con el mismo criterio.


### Decisión: la rama Carla se queda rota (2026-10-05)

Leo decidió **no arreglar la rama Carla**. La corrección estaba preparada y verificada, y se revirtió del borrador para que este solo difiera de producción en las reglas de `Switch4`/`Switch5`.

**Estado operativo: la rama Carla está rota en producción y seguirá estándolo.** Es una decisión consciente. Falla en silencio (`onError: continueErrorOutput` hacia `error3`), así que la ejecución se marca `success` aunque no haga nada: quien suba un fichero con `MU` en el nombre recibirá el mensaje de `error3` y no se procesará nada.

**Si se retoma**, hacen falta las dos piezas a la vez:

1. Sustituir el nodo de ejecución por `POST http://polarierauto_pythonrunner:8000/run` con `{"script":"Carla/actualizar_general.py","args":[]}` — el runner devuelve `stdout`, que es lo que parsea `Read/Write Files from Disk1`, así que el contrato aguas abajo no cambia.
2. Reescribir los 6 renombrados con `mv` sobre `/data/Polarier/Carla` generando `<PROV>MUS<semana>.xlsx`, decidiendo antes de qué expresión sale el nombre original del fichero (y resolviendo el `filename` vs `fileName`).

**Why:** arreglar solo la pieza 1 no restaura nada, porque los renombrados se ejecutan antes y fallan.

### Matiz: la corrección de `Switch5` se mantiene, pero hoy es inerte (2026-10-06)

Leo confirmó explícitamente que la corrección de `Switch5` (Caibarién `'CA'`, Cayo Coco `'CC'`) **se queda en el borrador**, aunque `Switch5` pertenezca a la rama Carla, que se dejó sin arreglar.

Conviene saber qué cambia y qué no:

- **`Switch4` está en la rama Leslie, que sí está operativa.** Ahí la corrección tiene efecto real: se dejan de perder los datos de Habana y de escribir los de Cayo Coco en la hoja de Cayo Cruz.
- **`Switch5` enruta hacia los 6 nodos de renombrado, que siguen rotos.** Antes los tres polos con C acababan todos en `CAMUS*`, que falla; ahora cada uno llega a su nodo propio, que **también falla**. Mientras la rama Carla no se arregle, **el cambio no altera el comportamiento observable**.

Su valor es preparatorio: deja el enrutado correcto para cuando se retome la rama, y evita que el fichero general `COMU ABRIL GENERAL.xlsx` sea capturado por la regla `'C'` y renombrado como si fuera de Caibarién.

**Borrador final: `53dec2de-7a48-4c13-8bed-db505eeccd86`**, sin publicar. Diff reverificado contra producción (`e2fa038a-20c8-46d8-a65f-d470a834c029`): mismos 142 nodos, mismas conexiones, y como únicas diferencias los cuatro valores de comparación de `Switch4` y `Switch5`. `Execute Command` idéntico al de producción.
