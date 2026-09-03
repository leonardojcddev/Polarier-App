# Supabase

Proyecto Supabase usado para **auth, base de datos y Storage**.

- Cliente: `src/lib/supabaseClient.ts` (flujo PKCE, `persistSession`).
- URL y anon key vía variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Ver [[Deploy-Easypanel]].
- La `anon key` es **pública** (va en el navegador). La seguridad real depende de las **RLS policies**.

## Tablas

| Tabla | Descripción | Columnas clave |
|-------|-------------|----------------|
| `polos_turisticos` | Polos (nivel superior de hoteles) | `id`, `nombre` |
| `chats` | Conversaciones | `id`, `user_id`, `title`, `created_at` |
| `chat_messages` | Mensajes de cada chat | `id`, `chat_id`, `user_id`, `role`, `content` |
| `profiles` | Perfil del usuario | `id`, `full_name`, `avatar_url` |
| `documents` | Archivos subidos/generados | `id`, `user_id`, `chat_id`, `file_name`, `file_path`, `mime_type`, `size_bytes`, `status`, `role` |

- En `documents`, `role` distingue archivos del usuario (`user`) de los del asistente (`assistant`). "Mis Documentos" muestra solo los `assistant`.

### Módulo de auditoría

Las tablas del módulo están detalladas en [[Modulo-Auditoria]]. Aquí solo lo que
afecta a informes:

| Tabla | Descripción | Columnas clave |
|-------|-------------|----------------|
| `monthly_reports` | Un informe por hotel + usuario + año + mes | `estado` (`pendiente`\|`generando`\|`listo`\|`error`), `resumen` jsonb, `metricas` jsonb, `pdf_url`, `generado_at`, **`solicitado_at`** |
| `audit_daily` | Capa plana: 1 fila por parte, métricas normalizadas y nombres resueltos | `submission_id` (PK), `hotel_id`, `fecha`, `periodo`, `tipo`, `valor`, `kg`, `inventario`, `metricas` |
| `audit_daily_detalle` | Formato largo: prenda / ubicación / métrica / valor | `submission_id`, `prenda`, `ubicacion`, `metrica`, `valor` |

Vistas (con `security_invoker = true`, imprescindible: una vista normal corre con
los permisos de su dueño y **se salta la RLS**):

| Vista | Grano |
|---|---|
| `audit_mes` | 1 fila por hotel + periodo + tipo de formulario |
| `audit_mes_dias` | serie diaria con `mediana_mes`, `ratio_vs_mediana` y `clasificacion` |

`audit_daily` y `audit_daily_detalle` **no se escriben nunca a mano**: las mantiene
el trigger `trg_audit_daily` sobre `form_submissions`, vía
`refrescar_audit_datos(submission_id)` (`security definer`, idempotente). Migración
`006_auditoria_datos_ia.sql`. Ver [[Routine-Informe-Mensual]].

`solicitado_at` es la **cola** de generación del informe mensual: la escribe el
botón de la app y la vacía la routine de Claude.

## Edge Functions

| Función | Uso |
|---|---|
| `disparar-informe-mensual` | Relé para lanzar la routine de Claude. Guarda `ROUTINE_ID` y `ROUTINE_TOKEN` como secretos, valida el JWT del auditor y hace el `POST /fire`. El token no puede ir en el frontend: la app es una SPA de Vite y cualquier `VITE_*` queda escrito en el bundle público |

```bash
supabase secrets set ROUTINE_ID=trig_xxxxx ROUTINE_TOKEN=sk-ant-oat01-xxxxx
supabase functions deploy disparar-informe-mensual
```

## Storage (buckets)

| Bucket | Uso | Notas |
|--------|-----|-------|
| `avatars` | Fotos de perfil | público, máx 2MB |
| `documents` | Archivos de chat | **privado** (URLs firmadas), máx 50MB, sin restricción de MIME |
| `informes-mensuales` | PDF del informe mensual | **privado**, ruta `{hotel_id}/{anio}-{mes}.pdf`. Creado en la migración 005; todavía sin usar (`pdf_url` va a `null`) |

- Los archivos privados se sirven con `createSignedUrl`.
- El límite de subida es **50MB** (subido desde 20MB para soportar ZIP/RAR). Ver [[Decisiones]].

## Borrado de datos (importante)

Implementado en `chat.ts` y `storage.ts`:

- **`deleteChat`** → borra en cascada: documentos del chat (archivos de Storage **+** filas) → mensajes → el chat. El borrado de Storage es **explícito**, porque el `ON DELETE CASCADE` de la BD nunca elimina archivos de Storage.
- **`deleteDocument`** / **`deleteDocumentsByChat`** → borran archivo del bucket + fila.
- Botón de eliminar por documento en "Mis Documentos".

> ⚠️ Antes, `deleteChat` solo borraba la fila del chat, dejando mensajes y archivos huérfanos → el proyecto se llenaba. Corregido. Ver [[Decisiones]].

## RLS

El borrado requiere policies `DELETE` para `auth.uid() = user_id` en `chats`, `chat_messages` y `documents`. Verificado que funciona en producción.

## Post-deploy: configuración de auth

En **Authentication → URL Configuration** hay que registrar el dominio de producción:
- **Site URL**: `https://tu-dominio`
- **Redirect URLs**: `https://tu-dominio/**` (necesario para OAuth de Google y reset de contraseña).
