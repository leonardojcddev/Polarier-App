-- =============================================================================
-- Definiciones de formulario: Producción y Cuadrador (Lavatín) — Fase 1b
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001_audit_module.sql).
-- Reproduce fielmente la estructura de los Excel originales.
--
-- Modelo de config (jsonb):
--   layout: 'lineas'
--   cabecera: [{key,label,tipo}]         → campos arriba del formulario
--   grupos:   [{label, cols:[{key,label,tipo,calc?}]}]  → columnas (2 niveles)
--   prendas_sugeridas / prendas_precargadas
--   campo_observaciones: bool
--
-- tipo de columna: 'num' (default) | 'text'. calc:'total_pmr' = auto (P+M+R).
--
-- Este script hace UPSERT real: si la definición ya existía (versión previa
-- simplificada), la ACTUALIZA con la config completa.
-- =============================================================================

-- --- Control de Producción -------------------------------------------------
-- Layout 'vales': cada vale es un bloque que contiene TODAS las prendas fijas.
-- El usuario añade/quita vales; dentro de cada vale rellena las cantidades de
-- cada prenda por columna. Total (P+M+R) se calcula por prenda.
with cfg as (
  select jsonb_build_object(
    'layout','vales',
    'prendas', jsonb_build_array(
      'SP Sábana Personal','SK Sábana King','F Funda',
      'TB Toalla Baño/Cuerpo','TC Toalla Cara/Mano','TA Toalla Alfombra',
      'TF Toalla Facial','TP Toalla Piscina','Mantelería','Servilleta'
    ),
    'cabecera', jsonb_build_array(
      jsonb_build_object('key','fecha','label','Fecha','tipo','fecha'),
      jsonb_build_object('key','operario','label','Operario','tipo','text'),
      jsonb_build_object('key','jefe_turno','label','Jefe de Turno','tipo','text'),
      jsonb_build_object('key','turno','label','Turno','tipo','text'),
      jsonb_build_object('key','area','label','Área','tipo','text'),
      jsonb_build_object('key','equipo','label','Equipo','tipo','text')
    ),
    -- Columnas de datos por prenda dentro de cada vale (con grupos de 2 niveles)
    'grupos', jsonb_build_array(
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','dec_jurada','label','Cant. Dec. Jurada','tipo','num')
      )),
      jsonb_build_object('label','Hora','cols', jsonb_build_array(
        jsonb_build_object('key','hora_inicio','label','Inicio','tipo','text'),
        jsonb_build_object('key','hora_fin','label','Fin','tipo','text')
      )),
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','produccion','label','Producción (P)','tipo','num')
      )),
      jsonb_build_object('label','Manchas (M)','cols', jsonb_build_array(
        jsonb_build_object('key','m_rosa','label','Rosa/Amarilla','tipo','num'),
        jsonb_build_object('key','m_negra','label','Negra','tipo','num'),
        jsonb_build_object('key','m_oxido','label','Óxido','tipo','num'),
        jsonb_build_object('key','m_varias','label','Varias','tipo','num')
      )),
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','roturas','label','Roturas (R)','tipo','num')
      )),
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','total','label','Total (P+M+R)','tipo','num','calc','total_pmr')
      )),
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','faltante','label','Faltante/Sobrante','tipo','num')
      )),
      jsonb_build_object('cols', jsonb_build_array(
        jsonb_build_object('key','pendientes','label','Pendientes','tipo','num')
      ))
    )
  ) as config
)
insert into form_definitions (hotel_id, tipo, nombre, config)
select h.id, 'produccion', 'Control de Producción', cfg.config
from hoteles h, cfg
where h.slug = 'gran-muthu-habana'
on conflict (hotel_id, tipo, schema_version)
do update set config = excluded.config, nombre = excluded.nombre;

-- --- Cuadrador Lavatín -----------------------------------------------------
-- Layout 'categorias': 5 categorías fijas (Mantel, Cubremantel, Servilletas,
-- Caminitos, Otros). Cada categoría contiene líneas dinámicas (añadir/quitar),
-- y cada línea tiene: Vale, Cant. Declaración, Producción, Faltantes/Sobrantes,
-- Pendientes y Observaciones. Reproduce la tabla del Excel.
with cfg as (
  select jsonb_build_object(
    'layout','categorias',
    'cabecera', jsonb_build_array(
      jsonb_build_object('key','fecha','label','Fecha','tipo','fecha'),
      jsonb_build_object('key','turno','label','Turno','tipo','turno'),
      jsonb_build_object('key','cuadrador','label','Cuadrador','tipo','text'),
      jsonb_build_object('key','encargado_limpio','label','Encargado Limpio','tipo','text'),
      jsonb_build_object('key','jefe_turno','label','Jefe de Turno','tipo','text')
    ),
    'categorias', jsonb_build_array(
      'Mantel','Cubremantel','Servilletas','Caminitos','Otros'
    ),
    'columnas', jsonb_build_array(
      jsonb_build_object('key','vale','label','Vale','tipo','text'),
      jsonb_build_object('key','declaracion','label','Cant. en Declaración Jurada','tipo','num'),
      jsonb_build_object('key','produccion','label','Producción','tipo','num'),
      jsonb_build_object('key','faltante','label','Faltantes/Sobrantes','tipo','num'),
      jsonb_build_object('key','pendientes','label','Pendientes','tipo','num'),
      jsonb_build_object('key','observaciones','label','Observaciones','tipo','text')
    )
  ) as config
)
insert into form_definitions (hotel_id, tipo, nombre, config)
select h.id, 'cuadrador', 'Cuadrador Lavatín', cfg.config
from hoteles h, cfg
where h.slug = 'gran-muthu-habana'
on conflict (hotel_id, tipo, schema_version)
do update set config = excluded.config, nombre = excluded.nombre;
