-- =============================================================================
-- Un parte sin cerrar no se clasifica como desviación
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001..008).
--
-- Qué cambia
-- ----------
-- `audit_mes_dias.clasificacion` comparaba TODOS los días contra la mediana del
-- mes, sin mirar si el parte estaba cerrado. Un borrador a medias — tres vales
-- de los ocho del día — salía como `bajo` o `muy_bajo`, y el informe mensual lo
-- contaba como caída de producción cuando en realidad solo faltaban vales por
-- anotar: el mismo día aparecía dos veces, como desviación y como borrador.
--
-- A partir de aquí la clasificación gana el valor `borrador`, que se evalúa
-- ANTES de los umbrales. Replica lo que ya hace `clasificarDia()` en
-- `src/lib/dashboard.ts`, donde esos días se pintan en gris y no generan aviso
-- de desviación (la comparación no se pierde: se cuenta dentro del aviso de
-- borrador). Así el dashboard y el informe mensual cuentan lo mismo del mismo
-- día, que es justo lo que la nota cruzada de ambos ficheros pide mantener.
--
-- Qué NO cambia — a propósito
-- ---------------------------
-- * `valor <= 0` sigue mandando sobre el estado: si no hay nada registrado, el
--   día es `sin_datos` aunque la fila esté en borrador. Mismo orden que
--   `clasificarDia()`.
-- * Los borradores SIGUEN sumando en `valor`, en `audit_mes.total_valor` y en
--   la mediana del mes (el CTE `med` no filtra por estado). Es deliberado y
--   coincide con el dashboard: si no contaran, el día en curso — que está en
--   borrador hasta que se cierra — dejaría el acumulado siempre por detrás.
--   Lo que cambia es cómo se JUZGA el día, no cuánto suma.
-- * `ratio_vs_mediana` se sigue calculando para los borradores. El dato es útil
--   para redactar ("va un 70 % por debajo, probablemente faltan vales"); lo que
--   no procede es etiquetarlo de caída.
-- * `audit_mes.borradores` (el contador) se queda igual.
-- * Ninguna columna se añade ni se quita: la vista mantiene su firma.
--
-- Después de aplicar
-- ------------------
-- El prompt de la routine del informe mensual enumera los valores posibles de
-- `clasificacion` y todavía no incluye `borrador`. Hay que añadirlo ahí para
-- que la IA sepa interpretarlo. Ver vault/Routine-Informe-Mensual.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- audit_mes_dias: misma vista que en la 007 (dotación incluida) + `borrador`.
-- -----------------------------------------------------------------------------
drop view if exists audit_mes_dias;
create view audit_mes_dias
with (security_invoker = true) as
with med as (
  -- percentile_cont es un agregado de conjunto ordenado: no admite OVER, así que
  -- la mediana del mes se calcula aparte y se une.
  -- No se filtra por estado: los borradores también cuentan para la mediana,
  -- igual que en el dashboard.
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
  -- El orden importa y replica clasificarDia(): sin datos > borrador > umbrales.
  case
    when ad.valor <= 0                          then 'sin_datos'
    when ad.estado = 'borrador'                 then 'borrador'
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
  'Serie diaria por hotel/mes/formulario con mediana del mes, ratio y clasificacion (sin_datos|borrador|muy_bajo|bajo|normal|pico). Umbrales replicados de src/lib/dashboard.ts; un parte en borrador no se clasifica como desviacion. En lenceria, diferencia_dotacion = conteo del dia - dotacion del hotel.';


-- -----------------------------------------------------------------------------
-- Comprobación rápida (opcional): qué días cambian de etiqueta.
-- Debe devolver solo filas en borrador que antes salían como desviación.
-- -----------------------------------------------------------------------------
-- select hotel, fecha, formulario, estado, valor, mediana_mes,
--        ratio_vs_mediana, clasificacion
-- from audit_mes_dias
-- where estado = 'borrador'
-- order by fecha;
