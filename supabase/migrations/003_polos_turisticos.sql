-- =============================================================================
-- Polos turísticos + vinculación del hotel Gran Muthu Habana — Fase 1c
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001 y 002).
-- Idempotente: se puede re-ejecutar sin duplicar.
-- =============================================================================

-- Los 6 polos turísticos. (Por ahora solo La Habana tiene hotel.)
insert into polos_turisticos (nombre)
select v.nombre
from (values
  ('La Habana'),
  ('Varadero'),
  ('Caibarién'),
  ('Cayo Coco'),
  ('Cayo Cruz'),
  ('Holguín')
) as v(nombre)
where not exists (
  select 1 from polos_turisticos p where p.nombre = v.nombre
);

-- Vincular el Gran Muthu Habana al polo La Habana.
update hoteles h
set polo_id = p.id
from polos_turisticos p
where h.slug = 'gran-muthu-habana'
  and p.nombre = 'La Habana';
