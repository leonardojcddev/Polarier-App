# Pendientes

Tareas y cosas por revisar. Marca `[x]` al completar.

## Deploy / operación

- [x] **Actualizar variables de n8n en Easypanel** (la app desplegada) con las URLs self-hosted + `VITE_N8N_MODE`, y hacer **Rebuild**. Ver [[Deploy-Easypanel]].
- [x] Para uso real: poner `VITE_N8N_MODE=prod` **y activar el workflow** en n8n (toggle *Active*), para no depender de "Listen for test event". Ver [[Integracion-n8n]].
- [x] Confirmar que el dominio de producción está registrado en Supabase Auth (Site URL + Redirect URLs). Ver [[Supabase]].

## n8n

- [x] Si el flujo debe **procesar el contenido de ZIP/RAR**: n8n no descomprime de forma nativa. Definir cómo (nodo específico o Code). El archivo llega bien a n8n; falta la lógica de descompresión. Ver [[Integracion-n8n]].
- [ ] Revisar que el nodo "Respond to Webhook" devuelve el texto/archivo en una clave que la app entiende (`respuesta`, `output`, etc.) o como Binary File.

## Código / limpieza

- [ ] Revisar `design-assets/` — recursos de diseño sueltos, no usados por el código. Decidir si se conservan como referencia o se archivan.
- [ ] (Opcional) Code-splitting: el bundle principal supera 500KB (aviso en el build). Considerar `import()` dinámico o `manualChunks`. En especial **jspdf** arrastra `html2canvas` (~200KB) y `dompurify` que **no usamos** (solo para `.html()`); cargar `informePdf.ts` con `import()` dinámico reduciría el bundle inicial.

## Módulo de Auditoría

- [x] **Generación del PDF del informe en el cliente** (jsPDF + autotable, formato Polarier). Vista previa en pantalla + descarga directa (`src/lib/informePdf.ts`, `InformePreview.tsx`). Disponible desde el histórico y desde el formulario abierto. **No depende de n8n.**
- [x] **Envío del informe por correo (lado app)** — UI (`EnviarCorreoModal.tsx`) + servicio `src/services/informeCorreo.ts`: genera el PDF en base64 y hace POST al webhook n8n de correo (`VITE_N8N_EMAIL_WEBHOOK_URL`, instancia `automate-cuba24.app.n8n.cloud`). Ver [[Modulo-Auditoria]] y [[Integracion-n8n]].
- [x] **Flujo n8n de correo** — montado: workflow `Enviar informe email` (`Komb1YycRFKXTvkX`) en `automate-cuba24.app.n8n.cloud`. Webhook → Convert to File (base64→PDF) → Gmail (adjunto PDF, cuerpo HTML con datos del informe + firma) → Responder. Remitente: cuenta **Gmail de Quantic** (elegido manualmente), `senderName` "Quantic - Informes". Ver [[Integracion-n8n]].
- [ ] **Spam:** con `@gmail.com` normal no se puede autenticar dominio (SPF/DKIM/DMARC solo con dominio propio). Se evaluó enviar desde dominio propio de Hostinger vía SMTP + DNS, pero se **descartó por ahora**: se queda con Gmail. Paliativo: destinatarios marcan "No es spam" + añaden el remitente a Contactos → Gmail aprende. Si el spam molesta en producción, retomar el envío desde dominio propio (Workspace/Hostinger) con DKIM/DMARC.
- [ ] **Activar el workflow de correo** (toggle *Active* en n8n) para que funcione en prod. En modo test hay que ponerlo a *Listen for test event* antes de cada prueba.
- [ ] Probar el envío end-to-end desde la app y confirmar que el correo llega con el PDF adjunto.
- [ ] En **Easypanel**: añadir `VITE_N8N_EMAIL_WEBHOOK_URL` (+ `_TEST`) como Build Args y **Rebuild** para que el correo funcione en producción. Ver [[Deploy-Easypanel]].
- [ ] (Opcional) Generación de PDF también en n8n + pythonrunner si se requiere un formato corporativo más elaborado o guardado en Storage (`form_submissions.informe_url`). Hoy no es necesario: el PDF se genera en cliente.
- [ ] **Envío por WhatsApp** (Evolution API, número fijo) del informe generado.
- [x] Producción reproduce la estructura completa del Excel (cabecera, Hora Inicio/Fin, Manchas por color, Total P+M+R calculado). Ver [[Referencias-Formularios]].
- [ ] Ejecutar en Supabase `002_forms_produccion_cuadrador.sql` (config completa de producción y cuadrador — el script hace upsert, se puede re-ejecutar).
- [x] **Migración `007_dotacion_lenceria.sql` aplicada en Supabase** (2026-09-17, registrada como `dotacion_lenceria`): 16 ubicaciones con Piso 10/11, 76 celdas, 2.877 prendas (SP 515 · SK 125 · F 327 · TB 355 · TM 352 · TA 347 · TF 71 · TP 785), RLS con sus 4 políticas y las vistas devolviendo `dotacion_hotel`. El linter de seguridad solo señala `has_hotel_role` como SECURITY DEFINER ejecutable, igual que ya señalaba `has_hotel_access`: es un booleano sobre los roles del propio usuario, sin datos que filtrar. Ver [[Modulo-Auditoria]].
- [x] **Prompt de la routine actualizado** (2026-09-17, por API desde Claude Code). Ver [[Routine-Informe-Mensual]].
- [ ] Decidir el cron de la routine: está en `1 0 1 * *` (mensual), no en el diario `23 7 * * *` del diseño. Si se quiere la red de seguridad diaria para la cola, volver a ponerlo.
- [x] **Migración `008_admin_ve_todos_los_partes.sql` aplicada** (2026-09-23, registrada como `admin_ve_todos_los_partes`). Comprobada contra producción simulando usuarios: el admin ve 4/4 partes, `audit_daily` y detalle, y los perfiles «Auditor, Leonardo» (solo quien tiene rol en el hotel); el auditor sigue viendo 0 partes y solo su perfil. El linter de seguridad añade `puede_ver_perfil` a la misma lista de SECURITY DEFINER ejecutables donde ya estaban `has_hotel_access` y `has_hotel_role`: para `anon` devuelve falso siempre, no filtra nada.
- [x] **`leodev0211@gmail.com` es administrador** del Gran Muthu Habana (2026-09-23). Es además el dueño de los 4 partes existentes.
- [x] **Frontend desplegado** (2026-09-23): PR #6 mergeado y rebuild hecho en Easypanel (servicio `polarierauto/polarierapp`, 41 s, commit «Merge pull request #6 … admin-ve-partes-del-equipo»). El login de `app.automate-polarier.tech` carga bien tras el despliegue. **Ojo:** el rebuild de este servicio **no** se dispara solo al mergear; hay que pulsar **Deploy** a mano en el panel.
- [ ] Para ver de verdad «los partes de otro», el auditor (`blandonbg97@gmail.com`) tiene que rellenar alguno: hoy los 4 que hay son del propio administrador.
- [ ] Decidir si el rol `supervisor` debe ver también el trabajo de los auditores (hoy solo lo ve `admin`). Ver [[Decisiones]].
- [ ] UI para editar la dotación (hoy solo por SQL; la RLS ya deja escribir a `supervisor`/`admin`).
- [ ] Cambiar el auditor de prueba (`leodev0211@gmail.com`) por el usuario real del hotel.
- [ ] Cuando haya más de un hotel: UI de selección de hotel activo y polos turísticos.

## Informe mensual / Routine

Ver [[Routine-Informe-Mensual]] para el diseño completo y el prompt.

- [x] Tablas `monthly_reports` (004) y bucket `informes-mensuales` (005) aplicadas en Supabase.
- [x] Apartado por meses en la app: `AuditHistory` (lista de meses) → `AuditMonth` (detalle + bloque de informe mensual). Servicios en `audit.ts`.
- [x] **Capa de datos para la IA**: `006_auditoria_datos_ia.sql` (tablas `audit_daily` / `audit_daily_detalle`, trigger de aplanado, vistas `audit_mes` / `audit_mes_dias`, columna `solicitado_at`). Validada contra la BD en una transacción revertida.
- [x] Botón «Generar informe» + polling en `AuditMonth`, y `solicitarInformeMensual()` en `audit.ts`.
- [x] Edge Function `disparar-informe-mensual` escrita.

- [ ] **Migración `009_borradores_no_son_desviacion.sql` por aplicar.** Añade el valor `borrador` a `audit_mes_dias.clasificacion` para que la vista deje de contar un parte sin cerrar como caída de producción, igual que ya hace el dashboard. Escrita sobre la versión de la vista que dejó la 007 (con dotación); la consulta está validada contra la BD en solo lectura, sin crear ni borrar nada.
- [ ] **Sincronizar el prompt de la routine con la 009** (por API, como las veces anteriores): la lista de valores de `clasificacion` ya está actualizada en [[Routine-Informe-Mensual]], pero el prompt que vive en la routine de la nube todavía no incluye `borrador`. Si se aplica la migración sin tocar el prompt, la IA verá una etiqueta que no sabe interpretar.

**Para poner en marcha (pasos manuales, en este orden):**

- [x] **Migración `006_auditoria_datos_ia.sql` aplicada** (2026-09-03), con backfill y trigger verificados.
- [x] Routine creada por API: `Polarier — Informe mensual de auditoría`, id `trig_01TC5ozP9WKPMJiqiGuSz7i3`, cron `23 7 * * *`, modelo Sonnet, conector MCP de Supabase, prompt puesto. **Está deshabilitada** para que no dispare antes de tiempo.
- [x] Conector de Supabase comprobado con una pasada en vacío (2026-09-03): la routine lee la cola con `mcp__Supabase__execute_sql` sin problemas de permisos. Las herramientas de un conector adjunto **no** pasan por la lista `allowed_tools` de la routine.
- [x] Trigger de API añadido y token generado (`sk-ant-oat01-gmJLTP9s…`), y routine **habilitada** (2026-09-03). Primera pasada automática: 2026-09-04 07:23 UTC.
- [x] Edge Function `disparar-informe-mensual` **desplegada** (2026-09-03, versión 1, `verify_jwt: true`) y secretos puestos.
- [x] **Mitad servidor del circuito probada** (2026-09-03, sesión `cse_01YUoAPn4SAteVGN4p71r8Vw`): encolado → routine → informe escrito. Ver detalle en [[Routine-Informe-Mensual]].
- [x] Rama `auditoria/informe-mensual-ia` y **PR #2** hacia `main` (2026-09-03). Lleva el informe mensual + los tres commits de auditoría/chat/agente que nunca llegaron a `main`; **deja fuera la firma del APK**, que sigue en `android/firma-apk-release`.
- [ ] **Mergear el PR #2** y comprobar que Easypanel redespliega. Hasta entonces la VPS no tiene el botón: solo estaba en la copia de trabajo local.
- [ ] **Falta la mitad cliente**: pulsar «Generar informe» en `/auditoria/historico/2026-08` estando logueado, para ejercitar `solicitarInformeMensual()` → `functions.invoke` → `/fire` con un JWT real. Es el único eslabón sin probar.
- [x] La fila de PRUEBA de agosto 2026 ya no es de prueba: la routine la regeneró con un informe real. Copia del contenido viejo en el scratchpad de la sesión.

**Después:**

- [x] **PDF y correo del informe mensual** (2026-09-03): con el informe hecho salen «Descargar» y «Enviar por correo» en vez de «Regenerar». Reutiliza el PDF y el correo del informe diario vía `src/lib/informeMensual.ts`. Ver [[Routine-Informe-Mensual]].
- [ ] Decidir si se retiran `monthly_reports.pdf_url`, el bucket `informes-mensuales` (migración 005) y el botón «Abrir PDF»: el PDF se genera en cliente, así que ya no hacen falta. De momento se quedan, sin uso.
- [ ] Añadir hoteles: la routine ya itera todos los hoteles activos; falta la UI de selección de hotel activo (ver también Módulo de Auditoría).
- [x] `getSubmissionHistory` tenía `limit = 60` y `AuditHistory` se quedaba en ~20 días. Subido a 500 en la llamada (2026-09-23), que es lo que ya pedía el dashboard.
- [ ] `AuditMonth` muestra el total de cada parte leyendo `totales.general`, que **no existe en el cuadrador**: esos partes nunca muestran total. `audit_daily.valor` ya lo resuelve bien; sería cuestión de leer de ahí.

## n8n — rama Carla y enrutado de polos (2026-10-05)

- [~] **Rama Carla: DESCARTADA por decision de Leo (2026-10-05).** Se queda rota en produccion, de forma consciente. El diagnostico completo y lo que haria falta para retomarla estan en [[Integracion-n8n]]. Falla en silencio: quien suba un fichero con `MU` recibe el mensaje de `error3` y no se procesa nada.
- [ ] **Publicar el borrador `53dec2de-7a48-4c13-8bed-db505eeccd86`**, que corrige solo `Switch4`/`Switch5`. Diff reverificado el 2026-10-06: las unicas diferencias frente a produccion (`e2fa038a-20c8-46d8-a65f-d470a834c029`) son cuatro valores de comparacion; mismos 142 nodos, mismas conexiones y `Execute Command` identico. Ojo: el cambio de `Switch4` si tiene efecto real (rama Leslie, operativa), pero el de `Switch5` es inerte hasta que se arregle la rama Carla. Prueba antes de publicar: subir un `HACP...` y un `CCCP...` y comprobar que llegan a `Delete rows or columns from sheet3` y `sheet5`, las dos salidas que nunca se habian ejecutado.
- [x] **`Switch4` y `Switch5` corregidos como borrador** (2026-10-05, borrador `f15de71c-8dfa-4705-8fbb-82618bb85f22`, sin publicar). Estaban en modo primera-coincidencia con `contains 'C'`, lo que descartaba en silencio los datos de Habana y metia los de Cayo Coco en la hoja de Cayo Cruz. Ver [[Integracion-n8n]].
- [ ] **Revisar con el mismo criterio los demas switch** (`Switch`, `Switch1`, `Switch3`, `Switch6`): que ningun valor de regla sea subcadena de otro, dado que operan en primera-coincidencia.
- [ ] **`Switch6` le falta la regla de Holguin** (5 salidas en vez de 6); hoy Holguin va por `If4` → `Edit Fields5`. Decidir si se unifica con `Switch1`.
- [ ] **Los 12 nodos `Delete rows or columns from sheet*`** usan `numberToDelete` con valores que desbordan INT32 (999999999999 y mas). Tres de ellos ya fallaron con 400 de la API de Sheets.
- [ ] **`Update file1` da 404**: el fichero de Drive `1gT30p99...` ("GLOBAL-CP26") no existe o no es accesible.
- [ ] **Migrar 5 nodos Code a `$input`**: `Code in JavaScript`, `2`, `3`, `6` y `7` usan la global legacy `items`. Funciona en 2.33.4, pero hay que hacerlo antes de cualquier salto a n8n 3.x.
- [ ] **Quitar la service_role key de Supabase hardcodeada** en el header `apikey` del nodo `HTTP Request` de `Polarier Auto App`. Salta RLS.

## Ideas / futuro

- (añadir aquí ideas que surjan)
