# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias (usa package-lock.json si existe)
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar el resto del código
COPY . .

# Variables VITE_* se incrustan en tiempo de BUILD.
# Easypanel debe pasarlas como Build Args (ver DEPLOY.md).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_N8N_WEBHOOK_URL
ARG VITE_N8N_WEBHOOK_URL_TEST
ARG VITE_N8N_MODE

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_N8N_WEBHOOK_URL=$VITE_N8N_WEBHOOK_URL
ENV VITE_N8N_WEBHOOK_URL_TEST=$VITE_N8N_WEBHOOK_URL_TEST
ENV VITE_N8N_MODE=$VITE_N8N_MODE

RUN npm run build

# ---- Runtime stage ----
FROM nginx:alpine AS runtime

# Configuración SPA (fallback a index.html en rutas de React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
