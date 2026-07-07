# Despliegue en Easypanel (Hostinger VPS)

Guía para subir **Polarier-Auto** a GitHub y desplegarlo en Easypanel usando el `Dockerfile` incluido.

---

## ⚠️ IMPORTANTE: variables de entorno en Vite

Este es un proyecto **Vite (frontend estático)**. Las variables `VITE_*` **NO se leen en tiempo de ejecución**: se **incrustan durante el `npm run build`**. Por eso en Easypanel deben configurarse como **Build Args / Environment** que estén disponibles al construir la imagen, no solo al ejecutar el contenedor.

En Easypanel, al usar un servicio tipo **App** con build por Dockerfile, las variables definidas en la pestaña **Environment** se pasan también como build args a través de los `ARG` declarados en el `Dockerfile`. Con eso es suficiente.

> Nota de seguridad: la `VITE_SUPABASE_ANON_KEY` es una clave **pública/anon** (pensada para el navegador). No es secreta, pero la seguridad real depende de tener bien configuradas las **RLS policies** en Supabase.

---

## 1. Variables de entorno (pegar en la interfaz de Easypanel)

En Easypanel → tu servicio → pestaña **Environment**, añade estas tres variables:

```
VITE_SUPABASE_URL=https://zongaaygriklqsxzxfgl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvbmdhYXlncmlrbHFzeHp4ZmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjU3NDIsImV4cCI6MjA5MDY0MTc0Mn0.d339dukdzDTULoEB3grjXC5NqrbCWEceNzGxSrOaa0A
VITE_N8N_WEBHOOK_URL=https://automate-cuba24.app.n8n.cloud/webhook/cf778e0b-9af0-4f65-99f5-fc50634f2a90
```

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima (pública) de Supabase |
| `VITE_N8N_WEBHOOK_URL` | Endpoint del webhook n8n para respuestas de IA |

---

## 2. Subir a GitHub

Desde la raíz del proyecto:

```bash
git add .
git commit -m "Preparar proyecto para deploy en Easypanel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/polarier-auto.git   # solo la primera vez
git push -u origin main
```

El `.gitignore` ya excluye `.env`, `node_modules/`, `dist/` y artefactos de Android/Playwright, así que no se subirá nada sensible. El `.env.example` sí se sube como plantilla (sin valores reales).

---

## 3. Crear el servicio en Easypanel

1. Entra en tu panel de Easypanel (Hostinger VPS).
2. **Create → App**.
3. En **Source**, elige **GitHub** y conecta el repositorio `polarier-auto` (rama `main`).
   - Si el repo es privado, autoriza la GitHub App de Easypanel primero.
4. En **Build**, selecciona **Dockerfile** (Easypanel detecta el `Dockerfile` en la raíz automáticamente).
5. En **Environment**, pega las tres variables `VITE_*` del paso 1.
6. En **Ports / Proxy**, expón el puerto **80** (el contenedor Nginx sirve en el 80).
7. **Deploy**.

Cada `git push` a `main` dispara un redeploy automático (si activaste auto-deploy).

---

## 4. Dominio y HTTPS

1. En el servicio → **Domains**, añade tu dominio (ej. `app.automate-polarier.tech`).
2. Apunta el registro **A** de ese dominio a la IP de la VPS en tu proveedor DNS.
3. Easypanel emite automáticamente el certificado **Let's Encrypt** (HTTPS) una vez el DNS propaga.

> El `capacitor.config.ts` usa `https://app.automate-polarier.tech` como `server.url` para la app Android. Si cambias el dominio, actualiza también ahí.

---

## 5. Post-deploy — configurar Supabase

En **Supabase → Authentication → URL Configuration**, añade tu dominio de producción:

- **Site URL**: `https://tu-dominio.com`
- **Redirect URLs**: `https://tu-dominio.com/**` (necesario para OAuth de Google y el flujo de recuperación de contraseña).

Sin esto, el login con Google y el reset de contraseña fallarán en producción.

---

## Cómo funciona el Dockerfile

- **Stage 1 (`node:20-alpine`)**: instala dependencias con `npm ci`, recibe las `VITE_*` como `ARG` y ejecuta `npm run build` → genera `dist/`.
- **Stage 2 (`nginx:alpine`)**: sirve `dist/` con Nginx. El `nginx.conf` hace *fallback* a `index.html` para que funcionen las rutas de React Router (SPA) y cachea los assets con hash.

Imagen final: solo Nginx + estáticos (ligera, sin Node en runtime).
