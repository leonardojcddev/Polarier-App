# 🧠 Memoria del Proyecto — Polarier

Vault de Obsidian con todo lo necesario recordar sobre **Polarier** (repo: `Polarier-App`). Abre esta carpeta desde Obsidian con *"Open folder as vault"*.

> Esta memoria vive dentro del repositorio (`/vault`), así que se versiona en git y viaja con el código. **No pongas secretos aquí** (claves, tokens): usa referencias, no valores reales.

## Índice

- [[Arquitectura]] — Cómo está montada la app (routing, auth, layout).
- [[Stack-y-Convenciones]] — Tecnologías, comandos, reglas del proyecto.
- [[Supabase]] — Tablas, buckets de Storage, RLS.
- [[Integracion-n8n]] — Webhooks, modos prod/test, formato de respuestas.
- [[Modulo-Auditoria]] — Formularios de control de almacén hotelero (multi-hotel).
- [[Routine-Informe-Mensual]] — Informe mensual: capa de datos plana para la IA, cola y routine de Claude en la nube.
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
- **Informe mensual (rehecho el 2026-09-03):** los números los hace SQL y el texto la IA. Un trigger aplana los ~90 partes del mes a `audit_daily` (plana, con los UUID de catálogo ya resueltos a nombres) y dos vistas (`audit_mes`, `audit_mes_dias`) dejan el mes en ~3 KB. Encima, una **routine de Claude en la nube** lee esas vistas y escribe el análisis en `monthly_reports.resumen`. Se dispara por cron diario o desde el botón «Generar informe» de `AuditMonth`, que encola la petición (`solicitado_at`) y despierta a la routine a través de la Edge Function `disparar-informe-mensual`. Diseño y prompt en [[Routine-Informe-Mensual]]. **Todavía sin PDF.** Hay una fila de PRUEBA de agosto 2026 en `monthly_reports`.

**Pendiente inmediato:** aplicar la migración `006_auditoria_datos_ia.sql` en Supabase, crear la routine en claude.ai con su trigger de API, y desplegar la Edge Function con el token. Los pasos exactos están en [[Pendientes]].

## Cómo mantener esta memoria

Cuando algo importante cambie (una decisión, un nuevo servicio, un pendiente resuelto), actualiza la nota correspondiente. Usa enlaces `[[Nombre-Nota]]` para conectar ideas. Registra las decisiones importantes en [[Decisiones]] con fecha.
