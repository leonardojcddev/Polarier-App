# 🧠 Memoria del Proyecto — Polarier

Vault de Obsidian con todo lo necesario recordar sobre **Polarier** (repo: `Polarier-App`). Abre esta carpeta desde Obsidian con *"Open folder as vault"*.

> Esta memoria vive dentro del repositorio (`/vault`), así que se versiona en git y viaja con el código. **No pongas secretos aquí** (claves, tokens): usa referencias, no valores reales.

## Índice

- [[Arquitectura]] — Cómo está montada la app (routing, auth, layout).
- [[Stack-y-Convenciones]] — Tecnologías, comandos, reglas del proyecto.
- [[Supabase]] — Tablas, buckets de Storage, RLS.
- [[Integracion-n8n]] — Webhooks, modos prod/test, formato de respuestas.
- [[Modulo-Auditoria]] — Formularios de control de almacén hotelero (multi-hotel).
- [[Referencias-Formularios]] — Mapeo Excel original ↔ módulo de la app.
- [[Deploy-Easypanel]] — Cómo desplegar en la VPS de Hostinger.
- [[Decisiones]] — Registro de decisiones tomadas y su porqué.
- [[Pendientes]] — Tareas y cosas por revisar.

## Estado actual (2026-08)

La aplicación está **desplegada y conectada**:
- Frontend en Easypanel (Docker + Nginx).
- n8n self-hosted en Easypanel (`polarierauto-n8n.1tn4v0.easypanel.host`).
- Supabase para auth, BD y Storage.

## Cómo mantener esta memoria

Cuando algo importante cambie (una decisión, un nuevo servicio, un pendiente resuelto), actualiza la nota correspondiente. Usa enlaces `[[Nombre-Nota]]` para conectar ideas. Registra las decisiones importantes en [[Decisiones]] con fecha.
