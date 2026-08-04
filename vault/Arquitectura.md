# Arquitectura

App de chat en **React + TypeScript + Vite**. UI con shadcn/ui + Tailwind. Ver stack completo en [[Stack-y-Convenciones]].

## Flujo de routing y auth

Todo se define en `src/App.tsx`. Las rutas se envuelven en:

- **`ProtectedRoute`** → redirige a `/login` si no hay sesión.
- **`PublicRoute`** → redirige a `/lobby` si ya hay sesión.

El estado de auth es global vía `src/context/AuthContext.tsx` (`useAuth()`). El flujo de recuperación de contraseña se detecta por parámetros de URL y redirige a `/reset-password`.

### Rutas

| Ruta | Página | Acceso |
|------|--------|--------|
| `/` | Index | pública |
| `/login`, `/register` | Login, Register | pública (redirige si logueado) |
| `/forgot-password`, `/reset-password` | recuperación | pública |
| `/auth/callback` | AuthCallback | OAuth |
| `/lobby` | Lobby | protegida (layout propio) |
| `/chat`, `/chat/:chatId` | Chat | protegida (AppLayout) |
| `/documents` | Documents | protegida (AppLayout) |
| `/history` | History | protegida (AppLayout) |
| `/settings` | SettingsPage | protegida (AppLayout) |

## Layout

Las páginas bajo `/chat`, `/documents`, `/history`, `/settings` se renderizan dentro de **`AppLayout`** (sidebar + área principal con `<Outlet />`). `/lobby` está protegida pero usa su propio layout.

## Capas de código

- `src/pages/` — Vistas (una por ruta).
- `src/components/` — Componentes propios. `src/components/ui/` es shadcn/ui (no editar a mano).
- `src/services/` — Lógica de backend:
  - `auth.ts` — Login/registro/OAuth/logout.
  - `chat.ts` — CRUD de chats y mensajes, perfil, y la integración con n8n (`sendToN8n`). Ver [[Integracion-n8n]].
  - `storage.ts` — Subida/descarga/borrado de archivos. Ver [[Supabase]].
- `src/context/` — `AuthContext`, `ThemeContext`.
- `src/lib/` — `supabaseClient.ts`, `n8nMode.ts`.

## Flujo del chat

1. El usuario manda un mensaje → se guarda en la tabla `chat_messages`.
2. Se reenvía al webhook de n8n con `sendToN8n`. Ver [[Integracion-n8n]].
3. La respuesta se procesa con `extractTextContent` (busca claves como `respuesta`, `response`, `output`, `message`…).
4. Si la respuesta es un archivo (PDF/XLSX/DOCX/imagen/audio), se guarda en Storage y se muestra como enlace/reproductor.

## Android (Capacitor)

El proyecto se envuelve con Capacitor para generar una app Android.
- Proyecto nativo en `android/` (generado, no editar salvo configs nativas).
- Config en `capacitor.config.ts` — appId `com.polarier.auto`.
- Iconos se generan desde `assets/` con `@capacitor/assets` — **no borrar `assets/`**.
