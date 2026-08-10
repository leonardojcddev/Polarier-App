# Decisiones

Registro de decisiones tomadas en el proyecto, con fecha y motivo. Lo más reciente arriba.

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
