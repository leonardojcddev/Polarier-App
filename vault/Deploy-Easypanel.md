# Deploy en Easypanel (Hostinger VPS)

> La guía paso a paso completa está en `DEPLOY.md` (raíz del repo). Esta nota es el resumen para recordar.

Repo GitHub: **https://github.com/leonardojcddev/Polarier-App** (rama `main`).

## Cómo funciona

Frontend **Vite** servido como estáticos. El `Dockerfile` (multi-stage) compila con Node 20 y sirve con **Nginx** (`nginx.conf` hace fallback a `index.html` para React Router).

⚠️ **Las variables `VITE_*` se incrustan en BUILD time**, no en runtime. Por eso:
- En Easypanel van en **Environment** (se pasan como build args vía los `ARG` del Dockerfile).
- Cambiar cualquier variable requiere **Rebuild** (~1 min). No basta con reiniciar el contenedor.

## Variables de entorno

| Variable | Qué es |
|----------|--------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. Ver [[Supabase]]. |
| `VITE_SUPABASE_ANON_KEY` | Anon key (pública). |
| `VITE_N8N_WEBHOOK_URL` | Webhook n8n de producción. Ver [[Integracion-n8n]]. |
| `VITE_N8N_WEBHOOK_URL_TEST` | Webhook n8n de test. |
| `VITE_N8N_MODE` | `prod` o `test` — elige qué webhook usa la app. |

> Los valores reales están en el `.env` local (ignorado en git) y en `DEPLOY.md`. **No se guardan en este vault.**

## Pasos

1. `git push` a `main`.
2. Easypanel → **Create App → GitHub** → repo `Polarier-App`, rama `main`.
3. Build: **Dockerfile** (autodetectado).
4. **Environment**: pegar las 5 variables.
5. **Ports**: exponer el **80** (Nginx).
6. Deploy. Cada push a `main` puede disparar redeploy automático.

## Dominio y HTTPS

- En **Domains**, añadir el dominio y apuntar su registro **A** a la IP de la VPS.
- Easypanel emite el certificado Let's Encrypt automáticamente.
- El dominio de la app también se referencia en `capacitor.config.ts` (`server.url`) para Android.

## Post-deploy

- Registrar el dominio en Supabase Auth (Site URL + Redirect URLs). Ver [[Supabase]].
- Si se migra n8n, actualizar las variables `VITE_N8N_*` y Rebuild.
