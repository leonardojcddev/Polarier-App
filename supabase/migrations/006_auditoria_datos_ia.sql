-- =============================================================================
-- Capa de datos "legible por IA" para el informe mensual de auditoría
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001..005).
--
-- Problema que resuelve
-- ---------------------
-- Con 3 partes diarios por hotel, un mes son ~90 filas de `form_submissions`
-- cuyo `data` y `totales` tienen TRES formas distintas según el tipo, y donde la
-- lencería usa UUID como claves (`{ubicacion_uuid: {prenda_uuid: n}}`). Eso es
-- ilegible para un agente sin cruzar dos catálogos, y un prompt enorme.
--
-- Aquí se aplana todo a dos tablas planas que se mantienen solas con un trigger:
--
--   audit_daily          1 fila por parte (hotel + fecha + formulario), con las
--                        métricas normalizadas en columnas y los nombres ya
--                        resueltos. Es LA tabla que lee el agente.
--   audit_daily_detalle  formato largo (prenda / ubicación / métrica / valor)
--                        para el desglose que `totales` no guarda.
--
-- Y dos vistas agregadas por mes (`audit_mes`, `audit_mes_dias`) que dejan el
-- informe mensual en ~3 KB en lugar de 90 blobs JSON.
--
-- IMPORTANTE: el criterio de `valor` y `kg` replica `leerTotales()` de
-- src/lib/dashboard.ts. Si allí cambia, hay que cambiarlo aquí o el dashboard y
-- el informe dirán cifras distintas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------

-- Convierte un valor jsonb a numeric aceptando tanto números como cadenas
-- numéricas ("120", "1,5"). Devuelve NULL para cualquier otra cosa, que es como
-- se descartan los campos de texto (`hora_inicio`, `vale`, `observaciones`…).
create or replace function audit_to_num(v jsonb)
returns numeric
language sql immutable
set search_path = public
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string'
     and (v #>> '{}') ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$'
      then replace(btrim(v #>> '{}'), ',', '.')::numeric
    else null
  end;
$$;

-- Aplana `totales` a un diccionario plano de números, fusionando el nivel raíz
-- con `porColumna`. Mismo aplanado que hace `leerTotales` en dashboard.ts.
create or replace function audit_flat_metricas(p_totales jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select
    coalesce((
      select jsonb_object_agg(k, to_jsonb(n))
      from jsonb_each(coalesce(p_totales, '{}'::jsonb)) t(k, v),
           lateral audit_to_num(t.v) n
      where n is not null
    ), '{}'::jsonb)
    ||
    coalesce((
      select jsonb_object_agg(k, to_jsonb(n))
      from jsonb_each(coalesce(p_totales -> 'porColumna', '{}'::jsonb)) t(k, v),
           lateral audit_to_num(t.v) n
      where n is not null
    ), '{}'::jsonb);
$$;

-- Nombre del día de la semana en español (no depende del lc_time del servidor).
create or replace function audit_dia_semana(f date)
returns text
language sql immutable
set search_path = public
as $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])
         [extract(dow from f)::int + 1];
$$;


-- -----------------------------------------------------------------------------
-- 1. audit_daily — 1 fila por parte, plana y legible
-- -----------------------------------------------------------------------------
create table if not exists audit_daily (
  submission_id      uuid primary key references form_submissions(id) on delete cascade,
  hotel_id           uuid not null,
  hotel              text not null,
  polo               text,
  form_definition_id uuid not null,
  tipo               text not null,           -- lenceria | produccion | cuadrador
  formulario         text not null,
  user_id            uuid,

  fecha              date not null,
  anio               int  not null,
  mes                int  not null,
  dia                int  not null,
  periodo            text not null,           -- 'YYYY-MM'
  dia_semana         text not null,

  estado             text not null,           -- borrador | completado
  turno              text,
  operario           text,
  jefe_turno         text,

  -- Métricas normalizadas (mismo criterio que leerTotales en dashboard.ts)
  valor              numeric not null default 0,  -- métrica principal, en prendas
  kg                 numeric not null default 0,
  inventario         numeric,                     -- solo lencería (dotación)
  declaracion        numeric,
  produccion         numeric,
  pendientes         numeric,
  faltante           numeric,
  roturas            numeric,
  manchas            numeric,
  total_pmr          numeric,
  n_vales            int,
  n_lineas           int,

  metricas           jsonb not null default '{}'::jsonb,  -- todo lo demás, aplanado
  actualizado_at     timestamptz not null default now()
);
create index if not exists idx_audit_daily_hotel_periodo on audit_daily(hotel_id, periodo);
create index if not exists idx_audit_daily_hotel_fecha   on audit_daily(hotel_id, fecha desc);
create index if not exists idx_audit_daily_tipo          on audit_daily(tipo);


-- -----------------------------------------------------------------------------
-- 2. audit_daily_detalle — formato largo, con los nombres ya resueltos
-- -----------------------------------------------------------------------------
-- Es lo que permite afirmar cosas que `totales` no sostiene ("las toallas de
-- piscina concentran el 40 % de las manchas"): `totales` no desglosa por prenda.
create table if not exists audit_daily_detalle (
  id            bigserial primary key,
  submission_id uuid not null references form_submissions(id) on delete cascade,
  hotel_id      uuid not null,
  fecha         date not null,
  periodo       text not null,
  tipo          text not null,
  vale          text,     -- nombre del vale (producción) o nº de vale (cuadrador)
  prenda        text,     -- nombre legible, nunca UUID
  ubicacion     text,     -- solo lencería
  metrica       text not null,  -- cantidad | dec_jurada | produccion | m_rosa | produccion_kg | …
  valor         numeric not null
);
create index if not exists idx_audit_det_hotel_periodo on audit_daily_detalle(hotel_id, periodo);
create index if not exists idx_audit_det_prenda        on audit_daily_detalle(hotel_id, periodo, prenda);
create index if not exists idx_audit_det_submission    on audit_daily_detalle(submission_id);


-- -----------------------------------------------------------------------------
-- 3. Aplanado: refrescar_audit_datos(submission_id)
-- -----------------------------------------------------------------------------
-- Borra y reinserta las filas derivadas de UNA submission. Idempotente: se puede
-- llamar tantas veces como haga falta (es lo que hace el backfill del final).
create or replace function refrescar_audit_datos(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s          form_submissions%rowtype;
  d          form_definitions%rowtype;
  v_hotel    text;
  v_polo     text;
  m          jsonb;    -- métricas de `totales`, aplanadas
  cab        jsonb;    -- data.cabecera
  v_valor    numeric;
  v_kg       numeric;
  v_inv      numeric;
  v_periodo  text;
begin
  select * into s from form_submissions where id = p_submission_id;

  -- Si la submission ya no existe, solo hay que limpiar.
  if not found then
    delete from audit_daily         where submission_id = p_submission_id;
    delete from audit_daily_detalle where submission_id = p_submission_id;
    return;
  end if;

  select * into d from form_definitions where id = s.form_definition_id;
  select h.nombre, po.nombre
    into v_hotel, v_polo
    from hoteles h
    left join polos_turisticos po on po.id = h.polo_id
   where h.id = s.hotel_id;

  m         := audit_flat_metricas(s.totales);
  cab       := coalesce(s.data -> 'cabecera', '{}'::jsonb);
  v_periodo := to_char(s.fecha, 'YYYY-MM');

  -- Métrica principal: MISMO criterio que leerTotales() en dashboard.ts.
  if d.tipo = 'cuadrador' then
    v_valor := coalesce(audit_to_num(m -> 'prenda'), audit_to_num(m -> 'produccion'), 0);
    v_kg    := coalesce(audit_to_num(m -> 'kg'), 0);
    v_inv   := null;
  elsif d.tipo = 'lenceria' then
    -- `general` en lencería es INVENTARIO (dotación), no producción.
    v_valor := coalesce(audit_to_num(m -> 'general'), 0);
    v_kg    := 0;
    v_inv   := v_valor;
  else
    v_valor := coalesce(audit_to_num(m -> 'produccion'),
                        audit_to_num(m -> 'total'),
                        audit_to_num(m -> 'general'), 0);
    v_kg    := coalesce(audit_to_num(m -> 'kg'), 0);
    v_inv   := null;
  end if;

  insert into audit_daily (
    submission_id, hotel_id, hotel, polo, form_definition_id, tipo, formulario, user_id,
    fecha, anio, mes, dia, periodo, dia_semana,
    estado, turno, operario, jefe_turno,
    valor, kg, inventario, declaracion, produccion, pendientes,
    faltante, roturas, manchas, total_pmr, n_vales, n_lineas,
    metricas, actualizado_at
  ) values (
    s.id, s.hotel_id, coalesce(v_hotel, '?'), v_polo,
    s.form_definition_id, d.tipo, d.nombre, s.user_id,
    s.fecha,
    extract(year  from s.fecha)::int,
    extract(month from s.fecha)::int,
    extract(day   from s.fecha)::int,
    v_periodo,
    audit_dia_semana(s.fecha),
    s.estado,
    nullif(cab ->> 'turno', ''),
    nullif(cab ->> 'operario', ''),
    nullif(cab ->> 'jefe_turno', ''),
    v_valor,
    v_kg,
    v_inv,
    -- `declaracion` en cuadrador, `dec_jurada` en producción: misma idea.
    coalesce(audit_to_num(m -> 'declaracion'), audit_to_num(m -> 'dec_jurada')),
    audit_to_num(m -> 'produccion'),
    -- `pendientes` (producción) vs `pendiente` (cuadrador).
    coalesce(audit_to_num(m -> 'pendientes'), audit_to_num(m -> 'pendiente')),
    audit_to_num(m -> 'faltante'),
    audit_to_num(m -> 'roturas'),
    nullif(
      coalesce(audit_to_num(m -> 'm_rosa'),   0) +
      coalesce(audit_to_num(m -> 'm_negra'),  0) +
      coalesce(audit_to_num(m -> 'm_oxido'),  0) +
      coalesce(audit_to_num(m -> 'm_varias'), 0),
      0),
    audit_to_num(m -> 'total'),
    case when jsonb_typeof(s.data -> 'vales') = 'array'
         then jsonb_array_length(s.data -> 'vales') end,
    case
      when jsonb_typeof(s.data -> 'lineas') = 'array'
        then jsonb_array_length(s.data -> 'lineas')
      when jsonb_typeof(s.data -> 'categorias') = 'array' then (
        select coalesce(sum(jsonb_array_length(coalesce(c -> 'lineas', '[]'::jsonb))), 0)::int
        from jsonb_array_elements(s.data -> 'categorias') c)
    end,
    m,
    now()
  )
  on conflict (submission_id) do update set
    hotel_id = excluded.hotel_id, hotel = excluded.hotel, polo = excluded.polo,
    form_definition_id = excluded.form_definition_id, tipo = excluded.tipo,
    formulario = excluded.formulario, user_id = excluded.user_id,
    fecha = excluded.fecha, anio = excluded.anio, mes = excluded.mes, dia = excluded.dia,
    periodo = excluded.periodo, dia_semana = excluded.dia_semana,
    estado = excluded.estado, turno = excluded.turno,
    operario = excluded.operario, jefe_turno = excluded.jefe_turno,
    valor = excluded.valor, kg = excluded.kg, inventario = excluded.inventario,
    declaracion = excluded.declaracion, produccion = excluded.produccion,
    pendientes = excluded.pendientes, faltante = excluded.faltante,
    roturas = excluded.roturas, manchas = excluded.manchas, total_pmr = excluded.total_pmr,
    n_vales = excluded.n_vales, n_lineas = excluded.n_lineas,
    metricas = excluded.metricas, actualizado_at = now();

  -- ---------------------------------------------------------------------------
  -- Detalle: se reconstruye entero en cada refresco.
  -- ---------------------------------------------------------------------------
  delete from audit_daily_detalle where submission_id = p_submission_id;

  if d.tipo = 'lenceria' then
    -- data = { <ubicacion_uuid>: { <prenda_uuid>: n }, _ubicaciones: [...] }
    -- `_ubicaciones` son las ubicaciones que el supervisor añade a mano: viven en
    -- el mismo nivel del objeto, así que hay que excluirlas del recorrido y
    -- usarlas para resolver nombres que no están en el catálogo.
    insert into audit_daily_detalle (
      submission_id, hotel_id, fecha, periodo, tipo, prenda, ubicacion, metrica, valor)
    select
      s.id, s.hotel_id, s.fecha, v_periodo, 'lenceria',
      coalesce(cp.nombre, 'Prenda ' || pr.key),
      coalesce(cu.nombre, ux.nombre, 'Ubicación ' || ub.key),
      'cantidad',
      n.n
    from jsonb_each(s.data) ub
    cross join lateral jsonb_each(ub.value) pr
    cross join lateral (select audit_to_num(pr.value) as n) n
    left join catalogo_prendas     cp on cp.id::text = pr.key
    left join catalogo_ubicaciones cu on cu.id::text = ub.key
    left join lateral (
      select e ->> 'nombre' as nombre
      from jsonb_array_elements(coalesce(s.data -> '_ubicaciones', '[]'::jsonb)) e
      where e ->> 'id' = ub.key
      limit 1
    ) ux on true
    where ub.key <> '_ubicaciones'
      and jsonb_typeof(ub.value) = 'object'
      and n.n is not null;

  elsif jsonb_typeof(s.data -> 'vales') = 'array' then
    -- Producción: data.vales[].prendas[].valores{}
    -- `hora_inicio` / `hora_fin` son texto y audit_to_num los descarta solo.
    insert into audit_daily_detalle (
      submission_id, hotel_id, fecha, periodo, tipo, vale, prenda, metrica, valor)
    select
      s.id, s.hotel_id, s.fecha, v_periodo, d.tipo,
      nullif(vale ->> 'nombre', ''),
      nullif(pr ->> 'prenda', ''),
      kv.key,
      n.n
    from jsonb_array_elements(s.data -> 'vales') vale
    cross join lateral jsonb_array_elements(coalesce(vale -> 'prendas', '[]'::jsonb)) pr
    cross join lateral jsonb_each(coalesce(pr -> 'valores', '{}'::jsonb)) kv
    cross join lateral (select audit_to_num(kv.value) as n) n
    where n.n is not null;

  elsif jsonb_typeof(s.data -> 'lineas') = 'array' then
    -- Cuadrador Lavatín: una línea por prenda. `produccion_prenda` y
    -- `produccion_kg` son columnas DERIVADAS que la app calcula al vuelo y no
    -- persiste (ver CuadradorForm.tsx); aquí sí se materializan.
    insert into audit_daily_detalle (
      submission_id, hotel_id, fecha, periodo, tipo, vale, prenda, metrica, valor)
    select
      s.id, s.hotel_id, s.fecha, v_periodo, d.tipo,
      lin.vale, lin.prenda, met.metrica, met.valor
    from (
      select
        nullif(l -> 'valores' ->> 'vale', '')          as vale,
        nullif(l ->> 'prenda', '')                     as prenda,
        audit_to_num(l -> 'valores' -> 'declaracion')  as declaracion,
        audit_to_num(l -> 'valores' -> 'pendiente')    as pendiente
      from jsonb_array_elements(s.data -> 'lineas') l
    ) lin
    left join lateral (
      select audit_to_num(e -> 'peso') as peso
      from jsonb_array_elements(coalesce(d.config -> 'prendas_peso', '[]'::jsonb)) e
      where e ->> 'nombre' = lin.prenda
      limit 1
    ) pe on true
    cross join lateral (values
      ('declaracion',       lin.declaracion),
      ('pendiente',         lin.pendiente),
      ('produccion_prenda', greatest(0, coalesce(lin.declaracion, 0) - coalesce(lin.pendiente, 0))),
      ('produccion_kg',     greatest(0, coalesce(lin.declaracion, 0) - coalesce(lin.pendiente, 0))
                            * coalesce(pe.peso, 0))
    ) as met(metrica, valor)
    -- Una línea sin declaración ni pendiente está vacía: no genera filas.
    where (lin.declaracion is not null or lin.pendiente is not null)
      and met.valor is not null;

  elsif jsonb_typeof(s.data -> 'categorias') = 'array' then
    -- Layout `categorias` (migración 002, sustituido por 003 pero aún en datos).
    insert into audit_daily_detalle (
      submission_id, hotel_id, fecha, periodo, tipo, vale, prenda, metrica, valor)
    select
      s.id, s.hotel_id, s.fecha, v_periodo, d.tipo,
      nullif(l -> 'valores' ->> 'vale', ''),
      nullif(cat ->> 'nombre', ''),
      kv.key,
      n.n
    from jsonb_array_elements(s.data -> 'categorias') cat
    cross join lateral jsonb_array_elements(coalesce(cat -> 'lineas', '[]'::jsonb)) l
    cross join lateral jsonb_each(coalesce(l -> 'valores', '{}'::jsonb)) kv
    cross join lateral (select audit_to_num(kv.value) as n) n
    where n.n is not null
      and kv.key <> 'vale';
  end if;
end;
$fn$;


-- -----------------------------------------------------------------------------
-- 4. Trigger sobre form_submissions
-- -----------------------------------------------------------------------------
create or replace function trg_refrescar_audit_datos()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform refrescar_audit_datos(new.id);
  return new;
end;
$fn$;

drop trigger if exists trg_audit_daily on form_submissions;
create trigger trg_audit_daily
after insert or update of data, totales, estado, fecha, hotel_id, form_definition_id
on form_submissions
for each row execute function trg_refrescar_audit_datos();


-- -----------------------------------------------------------------------------
-- 4b. Permisos de las funciones
-- -----------------------------------------------------------------------------
-- `refrescar_audit_datos` es SECURITY DEFINER, y PostgREST expone cualquier
-- función de `public` en /rest/v1/rpc/. Sin esto, cualquiera con la anon key
-- podría invocarla. Solo debe llamarla el trigger — que no revalida privilegios
-- en ejecución, ya se comprueban al crearlo — y el backfill, que corre como
-- propietario.
revoke execute on function refrescar_audit_datos(uuid)  from public, anon, authenticated;
revoke execute on function trg_refrescar_audit_datos()  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
-- Mismo modelo que form_submissions: cada auditor ve solo lo suyo, en hoteles a
-- los que tiene acceso. Solo lectura: quien escribe es el trigger, que corre
-- como security definer. La routine entra por el conector MCP de Supabase, que
-- no pasa por RLS.
alter table audit_daily         enable row level security;
alter table audit_daily_detalle enable row level security;

drop policy if exists "audit_daily_select" on audit_daily;
create policy "audit_daily_select" on audit_daily for select
  using (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "audit_det_select" on audit_daily_detalle;
create policy "audit_det_select" on audit_daily_detalle for select
  using (
    has_hotel_access(hotel_id)
    and exists (
      select 1 from audit_daily ad
      where ad.submission_id = audit_daily_detalle.submission_id
        and ad.user_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 6. Cola de generación en monthly_reports
-- -----------------------------------------------------------------------------
-- El botón "Generar ahora" de la app escribe `solicitado_at`. Es la AUTORIDAD de
-- qué hay que generar: la escribe un usuario autenticado bajo RLS. El disparo de
-- la routine (POST /fire) solo dice "mira la cola", nunca qué informe redactar.
--
-- Un mes está pendiente cuando:
--   solicitado_at is not null and (generado_at is null or generado_at < solicitado_at)
alter table monthly_reports add column if not exists solicitado_at timestamptz;

create index if not exists idx_monthly_cola on monthly_reports(solicitado_at)
  where solicitado_at is not null;


-- -----------------------------------------------------------------------------
-- 7. Vistas agregadas por mes — lo que lee el agente
-- -----------------------------------------------------------------------------
-- `security_invoker = true` es imprescindible: por defecto una vista corre con
-- los permisos de su dueño y se salta la RLS de las tablas de debajo.

-- 7.1 audit_mes: 1 fila por hotel + periodo + tipo de formulario (3 por hotel/mes).
drop view if exists audit_mes;
create view audit_mes
with (security_invoker = true) as
select
  hotel_id,
  max(hotel)      as hotel,
  max(polo)       as polo,
  anio, mes, periodo, tipo,
  max(formulario) as formulario,

  count(*)::int                                    as partes,
  count(distinct fecha)::int                       as dias_con_parte,
  count(*) filter (where estado = 'borrador')::int as borradores,
  (date_trunc('month', min(fecha)) + interval '1 month - 1 day')::date
    - date_trunc('month', min(fecha))::date + 1    as dias_mes,
  min(fecha) as primer_dia,
  max(fecha) as ultimo_dia,

  -- En lencería el total del mes NO se suma: es un inventario, se toma el mayor
  -- conteo del mes (mismo criterio que la serie de dashboard.ts).
  case when tipo = 'lenceria' then max(valor) else sum(valor) end as total_valor,
  sum(kg)        as total_kg,
  max(inventario) as max_inventario,

  avg(valor) filter (where valor > 0)                                    as media_diaria,
  (percentile_cont(0.5) within group (order by valor)
    filter (where valor > 0))::numeric                                   as mediana_diaria,

  sum(declaracion) as total_declaracion,
  sum(produccion)  as total_produccion,
  sum(pendientes)  as total_pendientes,
  sum(faltante)    as total_faltante,
  sum(roturas)     as total_roturas,
  sum(manchas)     as total_manchas
from audit_daily
group by hotel_id, anio, mes, periodo, tipo;

comment on view audit_mes is
  'Resumen mensual por hotel y tipo de formulario. Punto de entrada del informe mensual: 3 filas por hotel y mes en lugar de ~90 submissions.';

-- 7.2 audit_mes_dias: la serie diaria con la comparación ya hecha.
drop view if exists audit_mes_dias;
create view audit_mes_dias
with (security_invoker = true) as
with med as (
  -- percentile_cont es un agregado de conjunto ordenado: no admite OVER, así que
  -- la mediana del mes se calcula aparte y se une.
  select hotel_id, periodo, tipo,
         (percentile_cont(0.5) within group (order by valor))::numeric as mediana_mes
  from audit_daily
  where valor > 0
  group by hotel_id, periodo, tipo
)
select
  ad.hotel_id, ad.hotel, ad.periodo, ad.anio, ad.mes,
  ad.fecha, ad.dia, ad.dia_semana,
  ad.tipo, ad.formulario, ad.estado,
  ad.valor, ad.kg, ad.inventario,
  ad.declaracion, ad.produccion, ad.pendientes,
  ad.faltante, ad.roturas, ad.manchas,
  med.mediana_mes,
  case when coalesce(med.mediana_mes, 0) > 0
       then round(ad.valor / med.mediana_mes, 3) end as ratio_vs_mediana,
  -- Umbrales replicados de detectarAlertas() en src/lib/dashboard.ts
  -- (UMBRAL_MUY_BAJO 0.5, UMBRAL_BAJO 0.75, UMBRAL_PICO 1.5).
  -- Si cambian allí, cambiarlos aquí.
  case
    when ad.valor <= 0                          then 'sin_datos'
    when coalesce(med.mediana_mes, 0) <= 0      then 'normal'
    when ad.valor / med.mediana_mes < 0.5       then 'muy_bajo'
    when ad.valor / med.mediana_mes < 0.75      then 'bajo'
    when ad.valor / med.mediana_mes > 1.5       then 'pico'
    else 'normal'
  end as clasificacion
from audit_daily ad
left join med
  on med.hotel_id = ad.hotel_id
 and med.periodo  = ad.periodo
 and med.tipo     = ad.tipo;

comment on view audit_mes_dias is
  'Serie diaria por hotel/mes/formulario con mediana del mes, ratio y clasificacion (sin_datos|muy_bajo|bajo|normal|pico). Umbrales replicados de src/lib/dashboard.ts.';


-- -----------------------------------------------------------------------------
-- 8. Backfill de lo que ya existe
-- -----------------------------------------------------------------------------
select refrescar_audit_datos(id) from form_submissions;
