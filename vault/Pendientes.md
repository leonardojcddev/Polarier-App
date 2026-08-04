# Pendientes

Tareas y cosas por revisar. Marca `[x]` al completar.

## Deploy / operación

- [x] **Actualizar variables de n8n en Easypanel** (la app desplegada) con las URLs self-hosted + `VITE_N8N_MODE`, y hacer **Rebuild**. Ver [[Deploy-Easypanel]].
- [x] Para uso real: poner `VITE_N8N_MODE=prod` **y activar el workflow** en n8n (toggle *Active*), para no depender de "Listen for test event". Ver [[Integracion-n8n]].
- [x] Confirmar que el dominio de producción está registrado en Supabase Auth (Site URL + Redirect URLs). Ver [[Supabase]].

## n8n

- [x] Si el flujo debe **procesar el contenido de ZIP/RAR**: n8n no descomprime de forma nativa. Definir cómo (nodo específico o Code). El archivo llega bien a n8n; falta la lógica de descompresión. Ver [[Integracion-n8n]].
- [ ] Revisar que el nodo "Respond to Webhook" devuelve el texto/archivo en una clave que la app entiende (`respuesta`, `output`, etc.) o como Binary File.

## Código / limpieza

- [ ] Revisar `design-assets/` — recursos de diseño sueltos, no usados por el código. Decidir si se conservan como referencia o se archivan.
- [ ] (Opcional) Code-splitting: el bundle principal supera 500KB (aviso en el build). Considerar `import()` dinámico o `manualChunks`.

## Ideas / futuro

- (añadir aquí ideas que surjan)
