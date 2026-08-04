# Decisiones

Registro de decisiones tomadas en el proyecto, con fecha y motivo. Lo más reciente arriba.

---

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
