---
name: lanzar
description: Lanza la aplicación Polarier-Auto (servidor de desarrollo Vite) para verla en el navegador
allowed-tools: "Bash Read"
---

# Lanzar la App

Arranca el servidor de desarrollo de Polarier-Auto para que el usuario la vea en el navegador.

## Pasos

1. **Comprueba si ya está corriendo** en el puerto 8080 antes de arrancar otro:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null
   ```

   Si responde `200`, el servidor ya está activo — no arranques otro; solo indica la URL.

2. **Arranca el servidor** en segundo plano (deja que el usuario siga interactuando):

   ```bash
   bun dev
   ```

   Lánzalo con `run_in_background: true`. El servidor no termina solo (es un proceso de larga duración).

3. **Espera a que esté listo** leyendo el archivo de salida del proceso en background hasta que
   aparezca la URL local o un error. Vite tarda ~0.5 s; su salida trae códigos de color ANSI,
   así que busca de forma laxa (`localhost`, `ready`, `error`, `EADDRINUSE`):

   ```bash
   log="<ruta-del-output-del-background>"; \
   for i in $(seq 1 20); do \
     grep -qiE "localhost|ready|error|EADDRINUSE" "$log" 2>/dev/null && break; \
     sleep 0.5; \
   done; cat "$log"
   ```

4. **Indica la URL al usuario:** http://localhost:8080

## Notas

- Gestor de paquetes: **bun** (no npm). El comando es `bun dev`.
- Puerto fijo: **8080** (definido en `vite.config.ts`).
- Es una app web (React + Vite); "lanzar" = servidor de desarrollo, no build ni APK.
- Deja el servidor corriendo en segundo plano; no lo detengas al terminar.
- Si el puerto está ocupado por otra cosa (`EADDRINUSE`), avísalo en vez de reintentar en bucle.
