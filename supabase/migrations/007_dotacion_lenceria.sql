-- =============================================================================
-- Dotación de lencería del hotel (stock fijo por ubicación × prenda)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001..006).
--
-- Idea de negocio
-- ---------------
-- La cantidad de lencería de un hotel es UNA y no cambia: a lo largo del mes va
-- circulando entre ubicaciones (pisos, offices, almacén sucio, lavandería,
-- almacén limpio…) y al cierre del mes tiene que volver a sumar lo mismo. Esa
-- cifra es la "dotación del hotel" con la que el dashboard mide el avance y
-- con la que el informe compara el inventario contado.
--
-- Hasta ahora la dotación se deducía del conteo de lencería más alto del mes
-- (o se tecleaba a mano en el dashboard). Aquí pasa a ser un dato maestro:
--
--   dotacion_lenceria   1 fila por hotel + ubicación + prenda, con la cantidad
--                       que debería haber. Es lo que precarga el formulario de
--                       lencería y contra lo que se comparan los conteos.
--
-- Y se expone a la capa del informe mensual:
--
--   audit_mes.dotacion_hotel      total de la dotación (suma de la tabla)
--   audit_mes_dias.dotacion_hotel idem, para comparar cada conteo diario
--   audit_mes_dotacion            por ubicación × prenda: dotación, último
--                                 conteo del mes y diferencia
--
-- Los valores iniciales son los del Excel "CONTROL DE ALMACÉN" del Gran Muthu
-- Habana (2.877 prendas). Trae dos ubicaciones que el catálogo no tenía
-- (Piso 10 y Piso 11), así que se añaden y se reordena el catálogo al orden
-- de esa hoja.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Catálogo de ubicaciones: Piso 10 y Piso 11 + orden de la hoja
-- -----------------------------------------------------------------------------
insert into catalogo_ubicaciones (hotel_id, nombre, orden)
select h.id, v.nombre, v.orden
from hoteles h,
  (values ('Piso 10', 4), ('Piso 11', 5)) as v(nombre, orden)
where h.slug = 'gran-muthu-habana'
  and not exists (
    select 1 from catalogo_ubicaciones u
    where u.hotel_id = h.id and u.nombre = v.nombre
  );

-- Mismo orden que la hoja de control (las filas nuevas van entre los almacenes
-- y los pisos altos). `orden` solo afecta a cómo se pintan; los datos guardados
-- van por UUID, así que renumerar no toca ninguna submission.
update catalogo_ubicaciones u
set orden = v.orden
from hoteles h,
  (values
    ('Lavandería', 1), ('Alm. Sucio', 2), ('Alm. Limpio', 3),
    ('Piso 10', 4), ('Piso 11', 5),
    ('Piso 24', 6), ('Office Piso 24', 7),
    ('Piso 25', 8), ('Office Piso 25', 9),
    ('Piso 26', 10), ('Office Piso 26', 11),
    ('Spa-1', 12), ('Spa-2', 13),
    ('Innova', 14), ('Ama de llaves', 15), ('Puesto médico', 16)
  ) as v(nombre, orden)
where h.slug = 'gran-muthu-habana'
  and u.hotel_id = h.id
  and u.nombre = v.nombre;


-- -----------------------------------------------------------------------------
-- 2. Tabla maestra: dotacion_lenceria
-- -----------------------------------------------------------------------------
create table if not exists dotacion_lenceria (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references hoteles(id) on delete cascade,
  ubicacion_id  uuid not null references catalogo_ubicaciones(id) on delete cascade,
  prenda_id     uuid not null references catalogo_prendas(id) on delete cascade,
  cantidad      int  not null default 0 check (cantidad >= 0),
  updated_at    timestamptz not null default now(),
  unique (hotel_id, ubicacion_id, prenda_id)
);
create index if not exists idx_dotacion_hotel on dotacion_lenceria(hotel_id);

drop trigger if exists trg_dotacion_updated on dotacion_lenceria;
create trigger trg_dotacion_updated before update on dotacion_lenceria
  for each row execute function set_updated_at();

comment on table dotacion_lenceria is
  'Stock fijo de lencería del hotel por ubicación y prenda. Precarga el formulario de lencería y es la dotación con la que se mide el avance del mes.';


-- -----------------------------------------------------------------------------
-- 3. RLS: leer con acceso al hotel; escribir solo supervisor/admin
-- -----------------------------------------------------------------------------
create or replace function has_hotel_role(h uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_hotel_roles
    where user_id = auth.uid() and hotel_id = h and activo and rol = any(roles)
  );
$$;

alter table dotacion_lenceria enable row level security;

drop policy if exists "dotacion_select" on dotacion_lenceria;
create policy "dotacion_select" on dotacion_lenceria for select
  using (has_hotel_access(hotel_id));

drop policy if exists "dotacion_insert" on dotacion_lenceria;
create policy "dotacion_insert" on dotacion_lenceria for insert
  with check (has_hotel_role(hotel_id, array['supervisor','admin']));

drop policy if exists "dotacion_update" on dotacion_lenceria;
create policy "dotacion_update" on dotacion_lenceria for update
  using (has_hotel_role(hotel_id, array['supervisor','admin']))
  with check (has_hotel_role(hotel_id, array['supervisor','admin']));

drop policy if exists "dotacion_delete" on dotacion_lenceria;
create policy "dotacion_delete" on dotacion_lenceria for delete
  using (has_hotel_role(hotel_id, array['supervisor','admin']));


-- -----------------------------------------------------------------------------
-- 4. Dotación del Gran Muthu Habana (hoja "CONTROL DE ALMACÉN", 2.877 prendas)
-- -----------------------------------------------------------------------------
-- Columnas por código de prenda: SP Sábana personal, SK Sábana king, F Fundas,
-- TB Toalla de baño, TM Toalla de mano, TA Alfombrín, TF Toallas faciales,
-- TP Toalla piscina. Las celdas vacías de la hoja no se insertan (son 0).
--
-- Totales de control de la hoja: SP 515 · SK 125 · F 327 · TB 355 · TM 352 ·
-- TA 347 · TF 71 · TP 785 · general 2.877. Se comprueban al final.
insert into dotacion_lenceria (hotel_id, ubicacion_id, prenda_id, cantidad)
select h.id, u.id, p.id, v.cantidad
from hoteles h
join (values
  -- Lavandería (114)
  ('Lavandería','SP',41), ('Lavandería','F',27), ('Lavandería','TB',4),
  ('Lavandería','TM',1),  ('Lavandería','TF',6), ('Lavandería','TP',35),
  -- Alm. Sucio (1)
  ('Alm. Sucio','TB',1),
  -- Alm. Limpio (1.091)
  ('Alm. Limpio','SP',212), ('Alm. Limpio','SK',61),  ('Alm. Limpio','F',96),
  ('Alm. Limpio','TB',78),  ('Alm. Limpio','TM',111), ('Alm. Limpio','TA',235),
  ('Alm. Limpio','TF',48),  ('Alm. Limpio','TP',250),
  -- Piso 10 (27)
  ('Piso 10','SP',7), ('Piso 10','SK',2), ('Piso 10','F',6),
  ('Piso 10','TB',5), ('Piso 10','TM',5), ('Piso 10','TA',2),
  -- Piso 11 (52)
  ('Piso 11','SP',18), ('Piso 11','SK',6),  ('Piso 11','F',4),
  ('Piso 11','TB',12), ('Piso 11','TM',10), ('Piso 11','TF',2),
  -- Piso 24 (261)
  ('Piso 24','SP',52), ('Piso 24','SK',10), ('Piso 24','F',49),
  ('Piso 24','TB',60), ('Piso 24','TM',61), ('Piso 24','TA',29),
  -- Office Piso 24 (114)
  ('Office Piso 24','SP',24), ('Office Piso 24','SK',6),  ('Office Piso 24','F',24),
  ('Office Piso 24','TB',24), ('Office Piso 24','TM',24), ('Office Piso 24','TA',12),
  -- Piso 25 (247)
  ('Piso 25','SP',68), ('Piso 25','SK',18), ('Piso 25','F',46),
  ('Piso 25','TB',46), ('Piso 25','TM',46), ('Piso 25','TA',23),
  -- Office Piso 25 (114)
  ('Office Piso 25','SP',24), ('Office Piso 25','SK',6),  ('Office Piso 25','F',24),
  ('Office Piso 25','TB',24), ('Office Piso 25','TM',24), ('Office Piso 25','TA',12),
  -- Piso 26 (133)
  ('Piso 26','SP',32), ('Piso 26','SK',10), ('Piso 26','F',26),
  ('Piso 26','TB',26), ('Piso 26','TM',26), ('Piso 26','TA',13),
  -- Office Piso 26 (114)
  ('Office Piso 26','SP',24), ('Office Piso 26','SK',6),  ('Office Piso 26','F',24),
  ('Office Piso 26','TB',24), ('Office Piso 26','TM',24), ('Office Piso 26','TA',12),
  -- Spa-1 (350)
  ('Spa-1','SP',10), ('Spa-1','TB',50), ('Spa-1','TM',16),
  ('Spa-1','TA',9),  ('Spa-1','TF',15), ('Spa-1','TP',250),
  -- Spa-2 (250)
  ('Spa-2','TP',250),
  -- Innova (4)
  ('Innova','SP',2), ('Innova','F',1), ('Innova','TB',1),
  -- Ama de llaves (1)
  ('Ama de llaves','TM',1),
  -- Puesto médico (4)
  ('Puesto médico','SP',1), ('Puesto médico','TM',3)
) as v(ubicacion, codigo, cantidad) on true
join catalogo_ubicaciones u on u.hotel_id = h.id and u.nombre = v.ubicacion
join catalogo_prendas     p on p.hotel_id = h.id and p.codigo = v.codigo
where h.slug = 'gran-muthu-habana'
on conflict (hotel_id, ubicacion_id, prenda_id) do update
  set cantidad = excluded.cantidad;

-- Comprobación: si la suma no cuadra con la hoja, la migración falla aquí y no
-- deja una dotación a medias.
do $$
declare
  v_total int;
begin
  select coalesce(sum(d.cantidad), 0) into v_total
  from dotacion_lenceria d
  join hoteles h on h.id = d.hotel_id
  where h.slug = 'gran-muthu-habana';
  if v_total <> 2877 then
    raise exception 'Dotación del Gran Muthu Habana: % prendas, se esperaban 2877', v_total;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 5. Capa del informe mensual: la dotación entra en las vistas
-- -----------------------------------------------------------------------------
-- Las vistas van con `security_invoker = true`, como las de la 006: sin eso
-- una vista corre con los permisos de su dueño y se salta la RLS.

-- 5.1 audit_dotacion_hotel: total por hotel (apoyo de las otras vistas).
drop view if exists audit_dotacion_hotel cascade;
create view audit_dotacion_hotel
with (security_invoker = true) as
select hotel_id, sum(cantidad)::numeric as dotacion_hotel
from dotacion_lenceria
group by hotel_id;

-- 5.2 audit_mes: misma vista que en la 006 + `dotacion_hotel`.
drop view if exists audit_mes;
create view audit_mes
with (security_invoker = true) as
select
  ad.hotel_id,
  max(ad.hotel)      as hotel,
  max(ad.polo)       as polo,
  ad.anio, ad.mes, ad.periodo, ad.tipo,
  max(ad.formulario) as formulario,

  count(*)::int                                       as partes,
  count(distinct ad.fecha)::int                       as dias_con_parte,
  count(*) filter (where ad.estado = 'borrador')::int as borradores,
  (date_trunc('month', min(ad.fecha)) + interval '1 month - 1 day')::date
    - date_trunc('month', min(ad.fecha))::date + 1    as dias_mes,
  min(ad.fecha) as primer_dia,
  max(ad.fecha) as ultimo_dia,

  -- En lencería el total del mes NO se suma: es un inventario, se toma el mayor
  -- conteo del mes (mismo criterio que la serie de dashboard.ts).
  case when ad.tipo = 'lenceria' then max(ad.valor) else sum(ad.valor) end as total_valor,
  sum(ad.kg)         as total_kg,
  max(ad.inventario) as max_inventario,

  -- Dotación fija del hotel (tabla dotacion_lenceria). Es el objetivo del mes;
  -- `max_inventario` es lo que se CONTÓ, y la diferencia entre ambos es lo que
  -- falta o sobra respecto al stock del hotel.
  max(dh.dotacion_hotel) as dotacion_hotel,

  avg(ad.valor) filter (where ad.valor > 0)                                 as media_diaria,
  (percentile_cont(0.5) within group (order by ad.valor)
    filter (where ad.valor > 0))::numeric                                   as mediana_diaria,

  sum(ad.declaracion) as total_declaracion,
  sum(ad.produccion)  as total_produccion,
  sum(ad.pendientes)  as total_pendientes,
  sum(ad.faltante)    as total_faltante,
  sum(ad.roturas)     as total_roturas,
  sum(ad.manchas)     as total_manchas
from audit_daily ad
left join audit_dotacion_hotel dh on dh.hotel_id = ad.hotel_id
group by ad.hotel_id, ad.anio, ad.mes, ad.periodo, ad.tipo;

comment on view audit_mes is
  'Resumen mensual por hotel y tipo de formulario. Punto de entrada del informe mensual: 3 filas por hotel y mes en lugar de ~90 submissions. dotacion_hotel = stock fijo (tabla dotacion_lenceria); max_inventario = lo contado.';

-- 5.3 audit_mes_dias: misma vista que en la 006 + dotación y diferencia diaria.
drop view if exists audit_mes_dias;
create view audit_mes_dias
with (security_invoker = true) as
with med as (
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
  -- Solo tiene sentido en lencería: cuánto se aleja el conteo del día del stock.
  dh.dotacion_hotel,
  case when ad.tipo = 'lenceria' and ad.inventario is not null
       then ad.inventario - dh.dotacion_hotel end as diferencia_dotacion,
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
 and med.tipo     = ad.tipo
left join audit_dotacion_hotel dh on dh.hotel_id = ad.hotel_id;

comment on view audit_mes_dias is
  'Serie diaria por hotel/mes/formulario con mediana del mes, ratio y clasificacion (sin_datos|muy_bajo|bajo|normal|pico). Umbrales replicados de src/lib/dashboard.ts. En lencería, diferencia_dotacion = conteo del día - dotación del hotel.';

-- 5.4 audit_mes_dotacion: dotación frente al ÚLTIMO conteo de lencería del mes,
--     por ubicación × prenda. Es lo que permite decir "faltan 12 toallas de
--     piscina en el Spa-1", que el total no sostiene.
drop view if exists audit_mes_dotacion;
create view audit_mes_dotacion
with (security_invoker = true) as
with ultimo as (
  select distinct on (hotel_id, periodo)
         hotel_id, periodo, submission_id, fecha
  from audit_daily
  where tipo = 'lenceria'
  order by hotel_id, periodo, fecha desc, actualizado_at desc
)
select
  d.hotel_id,
  ul.periodo,
  ul.fecha                                    as fecha_conteo,
  u.nombre                                    as ubicacion,
  p.nombre                                    as prenda,
  d.cantidad::numeric                         as dotacion,
  coalesce(det.valor, 0)                      as contado,
  coalesce(det.valor, 0) - d.cantidad         as diferencia
from dotacion_lenceria d
join catalogo_ubicaciones u on u.id = d.ubicacion_id
join catalogo_prendas     p on p.id = d.prenda_id
join ultimo ul on ul.hotel_id = d.hotel_id
left join audit_daily_detalle det
  on det.submission_id = ul.submission_id
 and det.metrica   = 'cantidad'
 and det.ubicacion = u.nombre
 and det.prenda    = p.nombre;

comment on view audit_mes_dotacion is
  'Dotación por ubicación × prenda frente al último conteo de lencería del mes (contado - dotacion = diferencia). Solo hoteles y periodos con algún parte de lencería.';
