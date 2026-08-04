# Stack y Convenciones

## Stack

- **Frontend:** React 18 + TypeScript + Vite 5
- **UI:** shadcn/ui (Radix) + Tailwind CSS
- **Estado servidor:** @tanstack/react-query
- **Routing:** react-router-dom 6
- **Formularios:** react-hook-form + zod
- **Backend:** Supabase (auth + Postgres + Storage). Ver [[Supabase]].
- **IA / automatización:** n8n vía webhook. Ver [[Integracion-n8n]].
- **Móvil:** Capacitor (Android).

## Comandos

> El gestor de paquetes del proyecto es **bun** (lockfile `bun.lock`). Nota: el [[Deploy-Easypanel|Dockerfile]] usa `npm ci` con `package-lock.json`, así que ambos lockfiles conviven.

- `bun dev` — Dev server en el puerto 8080.
- `bun run build` — Build de producción.
- `bun run lint` — ESLint.
- `bun run test` — Tests (vitest).
- `bunx vitest run src/ruta/archivo.test.ts` — Un solo test.

### Android
- `npm run android:sync` — Build web + sync a Android.
- `npm run android:open` — Abre en Android Studio.
- `npm run android:run` — Build + sync + ejecuta en dispositivo.

## Convenciones

- Alias de rutas: `@/` → `src/`.
- Componentes UI en `src/components/ui/` son shadcn/ui — **no editar a mano**.
- Componentes propios en `src/components/`.
- **Todo el texto de cara al usuario está en español.**
- TypeScript con `strictNullChecks: false` y `noImplicitAny: false`.

## Carpetas del raíz (qué es cada cosa)

- `src/` — Código de la app.
- `android/` — Proyecto Capacitor generado.
- `assets/` — Iconos fuente para Capacitor (**no borrar**).
- `design-assets/` — Recursos de diseño sueltos (logos, mockups). No los usa el código; renombrada desde "imagenes nuevas". Ver [[Decisiones]].
- `public/` — Estáticos servidos tal cual.
- `dist/` — Build output (ignorado en git, se regenera).
- `vault/` — Esta memoria de Obsidian (ignorada en el build Docker).
