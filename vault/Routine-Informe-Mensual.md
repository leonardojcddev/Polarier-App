# Routine: Informe de comportamiento mensual

Documento de referencia para montar la **routine en Claude Desktop** (cuenta cloud)
que, el **día 1 de cada mes**, genera el informe del **mes anterior completo** por
hotel, a partir de los partes diarios de auditoría.

> Esta routine NO vive en el repositorio de la app: se configura en Claude Desktop.
> Aquí queda la especificación exacta de qué debe hacer y cómo garantiza el periodo.

## Arquitectura (Fase 1 — sin PDF)

```
Routine Claude Desktop (día 1)
  ├─ 1. MCP Supabase  → lee form_submissions del MES ANTERIOR, TODOS los hoteles
  ├─ 2. Claude        → redacta análisis + valoraciones (markdown) por hotel
  └─ 3. MCP Supabase  → upsert en monthly_reports (resumen jsonb + estado 'listo')
```

- **Acceso a datos:** conector **MCP de Supabase** (lee tablas, escribe `monthly_reports`).
  Todo el flujo va por aquí; en Fase 1 NO interviene n8n.
- **Contenido:** Claude redacta en **markdown**; se guarda en `monthly_reports.resumen`
  como `{ analisis: string, valoraciones: string[], metricas: {...} }`.
- **App:** la vista de detalle del mes muestra el informe cuando `estado = 'listo'`
  (`src/pages/audit/AuditMonth.tsx` lee `resumen.analisis` y `resumen.valoraciones`).
- **PDF (Fase 2, diferido):** se añadirá un workflow n8n que convierta el markdown a PDF
  y lo suba al bucket `informes-mensuales`, rellenando `pdf_url`. La decisión (2026-08-20)
  fue posponerlo porque n8n no tiene HTML→PDF nativo y no bloquea el circuito principal.
  Ver §Workflow n8n (pendiente).

### Por qué Claude Desktop y no un backend (decisión 2026-08-20)

Se evaluaron Supabase Edge Function + pg_cron y n8n con nodo de IA. Ambos son más
robustos como servidor (corren siempre, sin depender de un PC), **pero la parte de IA
tendría que usar la API de Anthropic, que se paga por uso**. El requisito es usar el
**plan de Claude** (suscripción), y un plan solo lo puede consumir un cliente de Claude
interactivo (Desktop / Code), nunca un backend. Por eso la redacción vive en una
**routine programada de Claude Desktop** (schedule día 1): usa el plan, no la API.

Contrapartida asumida: la routine se dispara cuando la app de Claude está activa; si el
equipo está apagado a esa hora, corre al reactivarse. Tolerable para un informe mensual.

La recolección de datos y el PDF sí escalan a más hoteles sin trabajo extra (la routine
itera todos los hoteles activos; n8n genera el PDF).

### Formas de `totales` por tipo (verificado en BD 2026-08-20)

`form_submissions.totales` tiene estructura distinta según el tipo de formulario. El
prompt debe interpretarlas:
- **lenceria:** `{ general, porPrenda:{...}, porUbicacion:{...} }`
- **cuadrador:** `{ kg, prenda, pendiente, declaracion }` (estructura nueva)
- **produccion:** `{ general, porColumna:{ dec_jurada, produccion, pendientes, ... } }`

## Garantía de periodo (crítico)

El informe SOLO puede usar datos del mes anterior. La routine calcula **una vez** el
rango y no consulta ninguna otra fecha:

- `desde = primer día del mes anterior`  (p. ej. `2026-07-01`)
- `hasta = primer día del mes actual`     (p. ej. `2026-08-01`, **exclusivo**)
- Filtro: `fecha >= desde AND fecha < hasta`.
- Cruce de año: si hoy es enero, el mes anterior es diciembre del año anterior.

Nunca usar `LIKE '2026-07%'` ni rangos con `<=`: siempre `>= desde AND < hasta`.

## Prompt maestro de la routine (pegar en el schedule del día 1)

Este es el texto a programar en Claude Desktop (schedule mensual, día 1). Requiere el
conector **MCP de Supabase** activo. Las SQL están verificadas contra el proyecto
`zongaaygriklqsxzxfgl` (2026-08-20).

> ---
> **Tarea: generar los informes de comportamiento del mes anterior (todos los hoteles).**
>
> Usa el MCP de Supabase (proyecto Polarier, id `zongaaygriklqsxzxfgl`). Sigue los pasos
> en orden y NO uses datos de ninguna fecha fuera del mes anterior.
>
> **Paso 1 — Calcular el periodo.** El mes anterior al actual. `desde` = primer día de
> ese mes; `hasta` = primer día del mes actual (exclusivo). Si hoy es enero, el mes
> anterior es diciembre del año previo.
>
> **Paso 2 — Leer los partes del mes anterior de todos los hoteles activos:**
> ```sql
> select h.id as hotel_id, h.nombre as hotel,
>        fd.tipo, fd.nombre as formulario,
>        fs.id as submission_id, fs.fecha, fs.estado, fs.totales, fs.data
> from hoteles h
> join form_submissions fs on fs.hotel_id = h.id
> join form_definitions fd on fd.id = fs.form_definition_id
> where h.activo = true
>   and fs.fecha >= DATE '<desde>'      -- primer día del mes anterior
>   and fs.fecha <  DATE '<hasta>'      -- primer día del mes actual (exclusivo)
> order by h.nombre, fs.fecha, fd.tipo;
> ```
>
> **Paso 3 — Por cada hotel con al menos un parte**, redacta un informe en español a
> partir de sus partes. Interpreta `totales` según el tipo:
> - lenceria: `{ general, porPrenda, porUbicacion }`
> - cuadrador: `{ kg, prenda, pendiente, declaracion }`
> - produccion: `{ general, porColumna:{ dec_jurada, produccion, pendientes, ... } }`
>
> El informe debe cubrir: nº de partes y días con actividad, totales agregados por tipo
> de formulario, tendencias/observaciones y valoraciones accionables. Solo afirma lo que
> sostienen los datos del mes; NO compares con otros meses (no se leyeron).
>
> **Paso 4 — Obtener el auditor del hotel** (para `user_id`, requerido por la tabla):
> ```sql
> select user_id from user_hotel_roles
> where hotel_id = '<hotel_id>' and rol = 'auditor' and activo = true limit 1;
> ```
> Si no hay auditor, usa el `user_id` de cualquiera de los partes leídos de ese hotel.
>
> **Paso 5 — Guardar el informe** (un upsert por hotel). `resumen` debe tener exactamente
> esta forma (la app lee `analisis` y `valoraciones`):
> ```sql
> insert into monthly_reports (hotel_id, user_id, anio, mes, estado, resumen, metricas, generado_at)
> values (
>   '<hotel_id>', '<user_id>', <anio>, <mes>, 'listo',
>   jsonb_build_object(
>     'analisis', '<texto largo del análisis, en markdown>',
>     'valoraciones', jsonb_build_array('<punto 1>', '<punto 2>', '...')
>   ),
>   jsonb_build_object('totalPartes', <n>, 'porFormulario', '<agregados>'::jsonb),
>   now()
> )
> on conflict (hotel_id, user_id, anio, mes) do update
>   set estado = 'listo', resumen = excluded.resumen,
>       metricas = excluded.metricas, generado_at = now();
> ```
> Escapa las comillas simples del texto duplicándolas (`''`).
>
> **Paso 6 — Resumen final:** lista los hoteles procesados y cuántos partes tuvo cada uno.
> Los hoteles sin partes en el mes se omiten (no se crea informe).
> ---

Nota: el PDF (`pdf_url`) se rellenará en la Fase 2. Por ahora `estado='listo'` con el
`resumen` en markdown es suficiente para que la app muestre el informe.

## Paso 1 — Leer los partes del mes anterior (MCP Supabase)

Por cada hotel activo (`select id, nombre from hoteles where activo = true`):

```sql
select fs.id, fs.fecha, fs.estado, fs.totales, fs.data,
       fd.tipo, fd.nombre as formulario
from form_submissions fs
join form_definitions fd on fd.id = fs.form_definition_id
where fs.hotel_id = :hotel_id
  and fs.fecha >= :desde        -- primer día del mes anterior
  and fs.fecha <  :hasta        -- primer día del mes actual (exclusivo)
order by fs.fecha asc;
```

Si un hotel no tiene partes en el rango → se omite (no se genera informe de ese mes).

## Paso 2 — Redactar el informe (Claude)

Con los partes del rango, Claude produce un objeto `resumen` (JSON) que al menos incluya:

```json
{
  "periodo": { "anio": 2026, "mes": 7, "nombre": "Julio 2026" },
  "totalPartes": 0,
  "porFormulario": [
    { "tipo": "lenceria",  "partes": 0, "diasConParte": 0, "totalGeneral": 0 }
  ],
  "analisis": "Texto en español con el comportamiento del mes…",
  "valoraciones": ["Punto 1", "Punto 2"],
  "recomendaciones": ["…"]
}
```

Reglas: solo afirmar lo que sostienen los datos del rango; no inventar días sin parte;
comparaciones con meses anteriores solo si se leyeron esos meses explícitamente
(por defecto, NO — el foco es el mes anterior).

## Paso 3 — Generar y subir el PDF (webhook n8n)

POST (JSON) al webhook del workflow **"Informe mensual → PDF"** con:

```json
{
  "hotel_id": "<uuid>",
  "hotel": "Gran Muthu Habana",
  "anio": 2026,
  "mes": 7,
  "resumen": { ... }        // el objeto del paso 2
}
```

El workflow responde con la ruta del PDF en Storage:

```json
{ "pdf_url": "<hotel_id>/2026-07.pdf" }
```

Especificación del workflow: ver §Workflow n8n.

## Paso 4 — Registrar el informe (MCP Supabase)

Upsert en `monthly_reports` (un registro por hotel+usuario+año+mes; hay un auditor
por hotel, obtén su `user_id` de `user_hotel_roles` donde `rol='auditor'` y `activo`):

```sql
insert into monthly_reports (hotel_id, user_id, anio, mes, estado, resumen, metricas, pdf_url, generado_at)
values (:hotel_id, :user_id, :anio, :mes, 'listo', :resumen::jsonb, :metricas::jsonb, :pdf_url, now())
on conflict (hotel_id, user_id, anio, mes)
do update set estado='listo', resumen=excluded.resumen, metricas=excluded.metricas,
              pdf_url=excluded.pdf_url, generado_at=now();
```

`metricas` = los agregados (`porFormulario`, `totalPartes`); `resumen` = el análisis
redactado. La app lee ambos.

## Workflow n8n — "Informe mensual → PDF"

Entrada (Webhook, POST JSON): `{ hotel_id, hotel, anio, mes, resumen }`.

Nodos sugeridos:
1. **Webhook** (POST) — recibe el JSON.
2. **HTML/Plantilla** — arma el HTML del informe con `hotel`, periodo y `resumen`
   (reutilizar el estilo del informe diario si se quiere coherencia visual).
3. **HTML→PDF** — genera el binario PDF.
4. **Supabase (Storage upload)** — sube a bucket `informes-mensuales`, ruta
   `{hotel_id}/{anio}-{mes}.pdf`, `upsert = true`.
5. **Respond to Webhook** — devuelve `{ "pdf_url": "{hotel_id}/{anio}-{mes}.pdf" }`.

Notas:
- Reutiliza el patrón del workflow de correo (`src/services/informeCorreo.ts`): allí la
  app manda el PDF ya hecho; aquí n8n lo genera. Convención de ruta idéntica a la app.
- El bucket y sus políticas de lectura los crea `supabase/migrations/005_...sql`.

## Programación

En Claude Desktop, crear la routine con schedule cron **el día 1 a una hora tranquila**
(evitar :00 exacto). El prompt de la routine debe seguir los pasos 1–4 de este documento.

## Estado de implementación

- [x] Tablas y almacén: migraciones `004_monthly_reports.sql`, `005_informes_mensuales_storage.sql`.
- [x] Servicios de lectura en la app (`getMonthlyReports`, `getSubmissionsByMonth`).
- [x] Vista de meses y detalle del mes en la app.
- [ ] Workflow n8n "Informe mensual → PDF" (montar en n8n).
- [ ] Routine en Claude Desktop (programar con MCP Supabase + webhook n8n).
