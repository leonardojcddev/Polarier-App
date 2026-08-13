-- =============================================================================
-- Cuadrador Lavatín — nueva estructura de tabla (por prenda, con pesos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 002_forms_produccion_cuadrador.sql).
--
-- Cambia el layout de 'categorias' a 'cuadrador'. La nueva tabla es de líneas
-- dinámicas (añadir/quitar), y cada línea tiene:
--   Vale (texto) · Prenda (desplegable con peso) · Cant. Declaración Jurada de
--   Sucio (num) · Pendiente (num) · Producción (prenda)=Declaración−Pendiente
--   (auto) · Producción (kg)=prenda×peso (auto) · Observaciones (texto).
--
-- Los pesos (kg por prenda) viven en config.prendas_peso. Fuente: pesos_prendas.jpeg.
-- =============================================================================
with cfg as (
  select jsonb_build_object(
    'layout','cuadrador',
    'cabecera', jsonb_build_array(
      jsonb_build_object('key','fecha','label','Fecha','tipo','fecha'),
      jsonb_build_object('key','turno','label','Turno','tipo','turno'),
      jsonb_build_object('key','cuadrador','label','Cuadrador','tipo','text'),
      jsonb_build_object('key','encargado_limpio','label','Encargado Limpio','tipo','text'),
      jsonb_build_object('key','jefe_turno','label','Jefe de Turno','tipo','text')
    ),
    'prendas_peso', jsonb_build_array(
      jsonb_build_object('nombre','Sábana Personal','peso',0.75),
      jsonb_build_object('nombre','Sábana King','peso',1.02),
      jsonb_build_object('nombre','Funda de Almohada','peso',0.17),
      jsonb_build_object('nombre','Toalla Alfombra','peso',0.25),
      jsonb_build_object('nombre','Toalla Baño','peso',0.61),
      jsonb_build_object('nombre','Toalla Cara','peso',0.27),
      jsonb_build_object('nombre','Toalla Facial','peso',0.06),
      jsonb_build_object('nombre','Toalla Piscina','peso',0.94),
      jsonb_build_object('nombre','Cubremantel','peso',0.75),
      jsonb_build_object('nombre','Mantel','peso',0.39),
      jsonb_build_object('nombre','Servilleta','peso',0.08)
    )
  ) as config
)
update form_definitions fd
set config = cfg.config
from cfg, hoteles h
where fd.hotel_id = h.id
  and h.slug = 'gran-muthu-habana'
  and fd.tipo = 'cuadrador';
