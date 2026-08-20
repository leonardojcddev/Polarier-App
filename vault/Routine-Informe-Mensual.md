# Routine: Informe de comportamiento mensual

Documento de referencia para montar la **routine en Claude Desktop** (cuenta cloud)
que, el **día 1 de cada mes**, genera el informe del **mes anterior completo** por
hotel, a partir de los partes diarios de auditoría.

> Esta routine NO vive en el repositorio de la app: se configura en Claude Desktop.
> Aquí queda la especificación exacta de qué debe hacer y cómo garantiza el periodo.

## Arquitectura

```
Claude Desktop (día 1)
  ├─ 1. MCP Supabase  → lee form_submissions del MES ANTERIOR (rango estricto)
  ├─ 2. Claude        → redacta análisis + valoraciones
  ├─ 3. Webhook n8n   → genera el PDF y lo sube a Storage (bucket informes-mensuales)
  └─ 4. MCP Supabase  → upsert en monthly_reports (resumen + estado 'listo' + pdf_url)
```

- **Acceso a datos:** conector **MCP de Supabase** (lee tablas, escribe `monthly_reports`).
- **PDF:** un **workflow de n8n** lo genera y lo sube a Storage (n8n tiene credencial de
  Supabase; el agente no sube binarios directamente). Ver §Workflow n8n.
- **App:** la vista de detalle del mes muestra el informe cuando `estado = 'listo'`
  (ver `src/pages/audit/AuditMonth.tsx`).

## Garantía de periodo (crítico)

El informe SOLO puede usar datos del mes anterior. La routine calcula **una vez** el
rango y no consulta ninguna otra fecha:

- `desde = primer día del mes anterior`  (p. ej. `2026-07-01`)
- `hasta = primer día del mes actual`     (p. ej. `2026-08-01`, **exclusivo**)
- Filtro: `fecha >= desde AND fecha < hasta`.
- Cruce de año: si hoy es enero, el mes anterior es diciembre del año anterior.

Nunca usar `LIKE '2026-07%'` ni rangos con `<=`: siempre `>= desde AND < hasta`.

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
