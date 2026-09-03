# 🧠 Memoria del Proyecto — Polarier

Vault de Obsidian con todo lo necesario recordar sobre **Polarier** (repo: `Polarier-App`). Abre esta carpeta desde Obsidian con *"Open folder as vault"*.

> Esta memoria vive dentro del repositorio (`/vault`), así que se versiona en git y viaja con el código. **No pongas secretos aquí** (claves, tokens): usa referencias, no valores reales.

## Índice

- [[Arquitectura]] — Cómo está montada la app (routing, auth, layout).
- [[Stack-y-Convenciones]] — Tecnologías, comandos, reglas del proyecto.
- [[Supabase]] — Tablas, buckets de Storage, RLS.
- [[Integracion-n8n]] — Webhooks, modos prod/test, formato de respuestas.
- [[Modulo-Auditoria]] — Formularios de control de almacén hotelero (multi-hotel).
- [[Routine-Informe-Mensual]] — Informe mensual: tablas, apartado por meses y la routine de Claude Desktop.
- [[Referencias-Formularios]] — Mapeo Excel original ↔ módulo de la app.
- [[Deploy-Easypanel]] — Cómo desplegar en la VPS de Hostinger.
- [[Decisiones]] — Registro de decisiones tomadas y su porqué.
- [[Pendientes]] — Tareas y cosas por revisar.

## Estado actual (2026-09-01)

La aplicación está **desplegada y conectada**:
- Frontend en Easypanel (Docker + Nginx).
- n8n self-hosted en Easypanel (`polarierauto-n8n.1tn4v0.easypanel.host`).
- Supabase para auth, BD y Storage (proyecto `Polarier`, id `zongaaygriklqsxzxfgl`).

**En qué punto vamos (módulo de auditoría):**
- Formularios de control operativos: lencería, producción, cuadrador Lavatín (reestructurado a líneas por prenda con Producción prenda/kg automáticas).
- Lencería: ubicaciones editables (añadir/quitar filas manuales) + catálogo fijo. El 2026-09-01 se añadieron al catálogo del Muthu: **Innova, Puesto médico, Ama de llaves**.
- **Dashboard de control:** es la **pantalla de inicio del auditor** (`/auditoria`), con el avance del mes por hotel: acumulado frente a la dotación del hotel (sale del conteo de lencería), producción diaria con los días flojos resaltados y avisos explicados. Detalle en [[Modulo-Auditoria]].
- **Informe mensual:** apartado por meses en la app (`AuditHistory` → `AuditMonth`), tablas `monthly_reports` + bucket `informes-mensuales` aplicadas. La generación la hará una **routine de Claude Desktop** el día 1 (usa el plan de Claude, no la API), vía MCP de Supabase; escribe el análisis en `monthly_reports.resumen` (markdown). Prompt y cron en [[Routine-Informe-Mensual]]. **Fase 1 sin PDF** (diferido a un workflow n8n). Hay una fila de PRUEBA de agosto 2026 en `monthly_reports` para validar la vista.
- Último commit en `main`: `0899ffa`. Sin commitear: cambios de Android/APK y `settings.local.json` (aparte a propósito).

**Pendiente inmediato:** programar la routine en Claude Desktop (schedule día 1 + prompt del vault); borrar la fila de prueba cuando ya no haga falta; Fase 2 = PDF vía n8n.

## Cómo mantener esta memoria

Cuando algo importante cambie (una decisión, un nuevo servicio, un pendiente resuelto), actualiza la nota correspondiente. Usa enlaces `[[Nombre-Nota]]` para conectar ideas. Registra las decisiones importantes en [[Decisiones]] con fecha.
