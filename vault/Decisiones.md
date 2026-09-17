# Decisiones

Registro de decisiones tomadas en el proyecto, con fecha y motivo. Lo más reciente arriba.

---

## 2026-09-17 — Dotación fija de lencería como dato maestro

- **Contexto:** la lencería de un hotel es una cantidad fija que solo circula entre
  ubicaciones (pisos, offices, almacenes, lavandería) y al cierre del mes tiene que
  volver a sumar lo mismo. El auditor tecleaba esa matriz cada día desde cero, y el
  dashboard deducía la «dotación» del conteo más alto del mes (o de un campo manual),
  o sea, de un dato que el propio auditor podía haber contado mal.
- **Decisión: la dotación es una tabla (`dotacion_lenceria`), no una deducción.** Una
  fila por hotel + ubicación + prenda. Se cargó la hoja «CONTROL DE ALMACÉN» del Muthu
  (2.877 prendas), con una comprobación en la propia migración que aborta si la suma no
  cuadra con la hoja. Las ubicaciones Piso 10 y Piso 11, que la hoja trae y el catálogo
  no tenía, se añaden y el catálogo se reordena al orden de la hoja.
- **Decisión: el parte de lencería arranca precargado con la dotación** y el auditor
  solo ajusta lo que se movió. La matriz muestra la comparación (por fila, por prenda y
  en total) y un botón para volver a la dotación. Es lo que pidió el usuario: «eso evita
  llenar a mano».
- **Decisión: prioridad del objetivo en el dashboard: manual > tabla > conteo.** El
  campo manual se conserva por si un mes hay que forzar otra cifra; sin tabla, el
  comportamiento anterior sigue intacto (deducir del conteo más alto).
- **Decisión: la comparación conteo ↔ dotación llega a todo lo que emite el módulo.**
  Informe diario (cabecera, columna «Dif.», filas «Dotación» y «Diferencia»), dashboard
  (aviso `inventario_desviado`, «media» si faltan más del 2 %) e informe mensual
  (vistas `audit_mes.dotacion_hotel`, `audit_mes_dias.diferencia_dotacion` y
  `audit_mes_dotacion` por ubicación × prenda; el prompt de la routine pide comparar y
  guardar `inventarioContado` / `diferenciaDotacion` en `metricas`).
- **Decisión: sin UI de edición por ahora.** La dotación cambia rara vez; se edita por
  SQL. La RLS ya deja escribir a `supervisor`/`admin` (`has_hotel_role()`), así que
  cuando haga falta pantalla no habrá que tocar permisos.
- **Decisión: la app no depende de que la tabla exista.** Las tres pantallas que leen
  la dotación tragan el error y siguen sin ella, para que el despliegue no se rompa si
  la migración 007 todavía no se ha aplicado.
- **Aplicación:** la migración se validó primero en una transacción revertida y se
  aplicó el mismo día a petición del usuario (por convención las migraciones se
  aplican con su visto bueno). El prompt de la routine se actualizó a continuación por API
  (`RemoteTrigger`), sin pasar por la web. Ver [[Routine-Informe-Mensual]].

## 2026-09-03 — Informe mensual: capa de datos plana + routine en la nube

- **Contexto:** con 3 partes diarios por hotel, un mes son ~90 filas de `form_submissions`
  con tres formas distintas de `totales` y UUID como claves en lencería. El diseño
  anterior (rutina de Claude Desktop leyendo esas 90 filas crudas) era caro, frágil y
  obligaba a que la IA hiciera aritmética en vez de análisis.
- **Decisión: separar los números del texto.** Los agregados los hace SQL
  (`audit_daily` + `audit_daily_detalle`, mantenidas por trigger; vistas `audit_mes` y
  `audit_mes_dias`); la IA solo redacta. El prompt pasa de ~90 blobs JSON a ~3 KB.
- **Decisión: routine de Claude en la nube, no agente de n8n.** El motivo por el que se
  descartó n8n en agosto de 2026 sigue en pie: la IA en n8n consumiría la API de pago, y
  el requisito es usar el plan. Pasar de Claude Desktop a una **routine de claude.ai**
  quita la única pega real que tenía (depender de que el PC esté encendido).
- **Decisión: el botón de la app dispara la routine de verdad**, vía el trigger de API
  (`POST /v1/claude_code/routines/{id}/fire`). El cron mínimo de una routine es 1 hora,
  así que el cron nunca podría ser el mecanismo inmediato: queda como red de seguridad
  diaria que además vacía la cola si un disparo falló.
- **Decisión: el token del trigger vive en una Edge Function, no en el frontend.** La app
  es una SPA de Vite: cualquier `VITE_*` acaba escrito en el bundle público, y con ese
  token cualquiera podría lanzar la routine, que corre con el conector MCP de Supabase y
  permisos de escritura. `disparar-informe-mensual` guarda el secreto y valida el JWT.
  Es la primera Edge Function del proyecto.
- **Decisión: la cola manda, el payload solo avisa.** El `text` del `/fire` llega a la
  routine envuelto en `<routine-fire-payload>`, marcado como dato no fiable. Se aprovecha:
  el payload solo dice "mira la cola", y qué generar sale siempre de
  `monthly_reports.solicitado_at`, escrito por un usuario autenticado bajo RLS. Un token
  filtrado no consigue que la routine redacte sobre datos ajenos.
- **Deuda asumida:** los umbrales de desviación (0.5 / 0.75 / 1.5 sobre la mediana) están
  ahora en **dos sitios**: `detectarAlertas()` en `src/lib/dashboard.ts` (para el
  dashboard) y la vista `audit_mes_dias` (para el informe). Hay un comentario cruzado en
  ambos. Unificarlos exigiría que `dashboard.ts` leyera de la vista, que es otro trabajo.
- Detalle completo y prompt en [[Routine-Informe-Mensual]].

---

## 2026-08 — Módulo de Auditoría (Fase 1)

- **Fecha:** 2026-08 (fase 1 del sistema de control de almacén hotelero).
- **Funcionalidad añadida:** módulo de auditoría con formularios diarios nativos (Lencería, Producción, Cuadrador Lavatín), rol de auditor con navegación propia (sin chat), histórico con acceso al formulario (editable hoy / solo lectura días pasados) y enganche de descarga PDF. Ver [[Modulo-Auditoria]] y [[Referencias-Formularios]].
- **Archivos creados:**
  - SQL: `supabase/migrations/001_audit_module.sql`, `002_forms_produccion_cuadrador.sql`
  - Servicios: `src/services/audit.ts`, `src/services/hotels.ts`
  - Contexto: `src/context/RoleContext.tsx`
  - Componentes: `src/components/audit/AuditLayout.tsx`, `LenceriaMatrix.tsx`, `LineasTable.tsx`
  - Páginas: `src/pages/audit/AuditHome.tsx`, `AuditForm.tsx`, `AuditHistory.tsx`
  - `src/App.tsx` (RoleProvider + rutas + guards), `src/index.css` (utilidad `.no-spinner`)
- **Decisiones técnicas:**
  - **Multi-hotel desde el inicio**: jerarquía `polos_turisticos → hoteles → roles/formularios`. `polo_id` nullable para no bloquear el presente. No se hardcodea el hotel.
  - **`data`/`config` como JSONB** + tabla `form_definitions`: permite añadir o cambiar formularios sin migraciones de esquema. Prioriza escalabilidad/mantenibilidad.
  - **RLS estricta**: cada auditor solo ve sus submissions, en su hotel (`has_hotel_access()`).
  - **PDF/WhatsApp diferidos**: solo se dejó el enganche (`informe_url`, `informe_estado`, `enviado_at`). La generación irá en n8n + pythonrunner (respeta la arquitectura aprobada).
  - Formularios producción/cuadrador con **líneas dinámicas** (añadir/quitar vale) en vez de filas fijas del Excel.
- **Futuras mejoras:**
  - Generación real del PDF (formato Polarier) y envío WhatsApp/email vía n8n.
  - Validar si producción necesita el **desglose de manchas por color** (se agrupó en una columna). Ver [[Referencias-Formularios]].
  - Polos turísticos (UI) y selector de hotel activo cuando haya más de uno.

## 2026-08 — Preparación para deploy y correcciones

### Reorganización: memoria en Obsidian + limpieza
- **Qué:** Creado este vault `/vault` como memoria del proyecto. Carpeta `imagenes nuevas/` renombrada a `design-assets/` (`git mv`, historial preservado).
- **Por qué:** Documentación viva versionada junto al código; nombre de carpeta sin espacios, más portable.

### Soporte de ZIP/RAR + límite a 50MB
- **Qué:** Permitir subir `.zip` y `.rar`. Límite de documentos de 20MB → 50MB.
- **Por qué:** Necesidad del flujo. Validación en **tres capas** (ChatInput, Lobby, storage.ts), por MIME **y por extensión**, porque el navegador reporta el MIME de estos formatos de forma inconsistente (a veces vacío). Había validaciones duplicadas en la UI que rechazaban el archivo antes de storage.ts. Ver [[Supabase]].

### Borrado real en Supabase (BD + Storage)
- **Qué:** `deleteChat` ahora borra en cascada documentos+archivos+mensajes. Nuevo botón de eliminar en "Mis Documentos".
- **Por qué:** Antes solo borraba la fila del chat → mensajes y archivos quedaban huérfanos y llenaban el proyecto. Ver [[Supabase]].

### Robustez ante respuesta vacía de n8n
- **Qué:** `sendToN8n` lee el body como texto antes de parsear JSON.
- **Por qué:** Un `200` con cuerpo vacío hacía reventar `res.json()` → caía al catch → la app no mostraba nada **en silencio**. Ver [[Integracion-n8n]].

### Migración de n8n a self-hosted
- **Qué:** URLs de n8n cloud (`automate-cuba24.app.n8n.cloud`) → instancia propia en Easypanel (`polarierauto-n8n.1tn4v0.easypanel.host`).
- **Por qué:** El host viejo dejó de existir (404). Ver [[Integracion-n8n]].

### Control de entorno n8n por variable
- **Qué:** `VITE_N8N_MODE=prod|test` decide el webhook en build time.
- **Por qué:** Que el modo lo controle solo el admin desde Easypanel, no cualquier usuario desde la app. Se descartó un toggle en la UI (cosmético, manipulable vía localStorage). Ver [[Integracion-n8n]].

### Deploy vía Docker + Nginx
- **Qué:** Dockerfile multi-stage (Node build → Nginx static), en vez de `serve`.
- **Por qué:** Imagen ligera y robusta para SPA en producción. Ver [[Deploy-Easypanel]].
