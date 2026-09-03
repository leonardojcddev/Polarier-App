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
- [ ] Cambiar el auditor de prueba (`leodev0211@gmail.com`) por el usuario real del hotel.
- [ ] Cuando haya más de un hotel: UI de selección de hotel activo y polos turísticos.

## Informe mensual / Routine

Ver [[Routine-Informe-Mensual]] para el diseño completo y el prompt.

- [x] Tablas `monthly_reports` (004) y bucket `informes-mensuales` (005) aplicadas en Supabase.
- [x] Apartado por meses en la app: `AuditHistory` (lista de meses) → `AuditMonth` (detalle + bloque de informe mensual). Servicios en `audit.ts`.
- [x] **Capa de datos para la IA**: `006_auditoria_datos_ia.sql` (tablas `audit_daily` / `audit_daily_detalle`, trigger de aplanado, vistas `audit_mes` / `audit_mes_dias`, columna `solicitado_at`). Validada contra la BD en una transacción revertida.
- [x] Botón «Generar informe» + polling en `AuditMonth`, y `solicitarInformeMensual()` en `audit.ts`.
- [x] Edge Function `disparar-informe-mensual` escrita.

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
- [ ] `getSubmissionHistory` tiene `limit = 60`: con 3 partes diarios, `AuditHistory` solo ve ~20 días de histórico, así que la lista de meses se queda corta. Independiente del informe, pero conviene arreglarlo.
- [ ] `AuditMonth` muestra el total de cada parte leyendo `totales.general`, que **no existe en el cuadrador**: esos partes nunca muestran total. `audit_daily.valor` ya lo resuelve bien; sería cuestión de leer de ahí.

## Ideas / futuro

- (añadir aquí ideas que surjan)
