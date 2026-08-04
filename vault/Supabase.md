# Supabase

Proyecto Supabase usado para **auth, base de datos y Storage**.

- Cliente: `src/lib/supabaseClient.ts` (flujo PKCE, `persistSession`).
- URL y anon key vía variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Ver [[Deploy-Easypanel]].
- La `anon key` es **pública** (va en el navegador). La seguridad real depende de las **RLS policies**.

## Tablas

| Tabla | Descripción | Columnas clave |
|-------|-------------|----------------|
| `chats` | Conversaciones | `id`, `user_id`, `title`, `created_at` |
| `chat_messages` | Mensajes de cada chat | `id`, `chat_id`, `user_id`, `role`, `content` |
| `profiles` | Perfil del usuario | `id`, `full_name`, `avatar_url` |
| `documents` | Archivos subidos/generados | `id`, `user_id`, `chat_id`, `file_name`, `file_path`, `mime_type`, `size_bytes`, `status`, `role` |

- En `documents`, `role` distingue archivos del usuario (`user`) de los del asistente (`assistant`). "Mis Documentos" muestra solo los `assistant`.

## Storage (buckets)

| Bucket | Uso | Notas |
|--------|-----|-------|
| `avatars` | Fotos de perfil | público, máx 2MB |
| `documents` | Archivos de chat | **privado** (URLs firmadas), máx 50MB, sin restricción de MIME |

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
