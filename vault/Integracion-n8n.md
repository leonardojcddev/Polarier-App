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
