-- =============================================================================
-- Módulo de Auditoría (control de almacén hotelero) — Fase 1
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor.
-- Diseñado multi-hotel desde el inicio, preparado para polos turísticos.
-- Idempotente donde es razonable (IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- Extensión para UUIDs (Supabase suele tenerla; por si acaso)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Jerarquía organizativa: polos turísticos → hoteles
-- -----------------------------------------------------------------------------
create table if not exists polos_turisticos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists hoteles (
  id          uuid primary key default gen_random_uuid(),
  polo_id     uuid references polos_turisticos(id) on delete set null,  -- nullable por ahora
  nombre      text not null,
  slug        text unique not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Roles por hotel: quién puede hacer qué, en qué hotel
-- -----------------------------------------------------------------------------
create table if not exists user_hotel_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  hotel_id    uuid not null references hoteles(id) on delete cascade,
  rol         text not null default 'auditor'
              check (rol in ('auditor','supervisor','admin')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, hotel_id, rol)
);
create index if not exists idx_uhr_user on user_hotel_roles(user_id) where activo;

-- Helper: ¿el usuario actual tiene acceso (algún rol activo) a un hotel?
create or replace function has_hotel_access(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_hotel_roles
    where user_id = auth.uid() and hotel_id = h and activo
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Catálogos (sin hardcodear prendas/ubicaciones en el frontend)
-- -----------------------------------------------------------------------------
create table if not exists catalogo_prendas (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hoteles(id) on delete cascade,
  codigo      text,                 -- p.ej. 'SP', 'SK'
  nombre      text not null,        -- 'Sábana personal'
  orden       int not null default 0,
  activo      boolean not null default true
);
create index if not exists idx_prendas_hotel on catalogo_prendas(hotel_id) where activo;

create table if not exists catalogo_ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hoteles(id) on delete cascade,
  nombre      text not null,        -- 'Piso 24', 'Lavandería'
  orden       int not null default 0,
  activo      boolean not null default true
);
create index if not exists idx_ubic_hotel on catalogo_ubicaciones(hotel_id) where activo;

-- -----------------------------------------------------------------------------
-- 4. Definiciones de formulario (catálogo extensible de tipos)
--    config jsonb = estructura del formulario (columnas, secciones…)
-- -----------------------------------------------------------------------------
create table if not exists form_definitions (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid not null references hoteles(id) on delete cascade,
  tipo            text not null
                  check (tipo in ('produccion','cuadrador','lenceria')),
  nombre          text not null,
  schema_version  int not null default 1,
  config          jsonb not null default '{}'::jsonb,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (hotel_id, tipo, schema_version)
);

-- -----------------------------------------------------------------------------
-- 5. Entregas diarias de formulario (los datos que rellena el usuario)
--    data jsonb    = líneas/valores del formulario
--    totales jsonb = totales calculados
--    informe_*     = enganche para PDF/WhatsApp/email (futuro, sin implementar)
-- -----------------------------------------------------------------------------
create table if not exists form_submissions (
  id                  uuid primary key default gen_random_uuid(),
  hotel_id            uuid not null references hoteles(id) on delete cascade,
  form_definition_id  uuid not null references form_definitions(id) on delete restrict,
  user_id             uuid not null references auth.users(id) on delete set null,
  fecha               date not null default current_date,
  estado              text not null default 'borrador'
                      check (estado in ('borrador','completado')),
  data                jsonb not null default '{}'::jsonb,
  totales             jsonb not null default '{}'::jsonb,
  -- Enganche automatización (futuro):
  informe_url         text,
  informe_estado      text default 'pendiente'
                      check (informe_estado in ('pendiente','generando','listo','error')),
  enviado_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Un formulario por día, por hotel, por usuario:
  unique (hotel_id, form_definition_id, fecha, user_id)
);
create index if not exists idx_subm_hotel_fecha on form_submissions(hotel_id, fecha desc);
create index if not exists idx_subm_user on form_submissions(user_id);

-- updated_at automático
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_subm_updated on form_submissions;
create trigger trg_subm_updated before update on form_submissions
  for each row execute function set_updated_at();

-- =============================================================================
-- 6. Row Level Security
-- =============================================================================
alter table polos_turisticos    enable row level security;
alter table hoteles             enable row level security;
alter table user_hotel_roles    enable row level security;
alter table catalogo_prendas    enable row level security;
alter table catalogo_ubicaciones enable row level security;
alter table form_definitions    enable row level security;
alter table form_submissions    enable row level security;

-- Hoteles: el usuario ve los hoteles a los que tiene acceso.
drop policy if exists "hoteles_select" on hoteles;
create policy "hoteles_select" on hoteles for select
  using (has_hotel_access(id));

-- Polos: visibles si el usuario tiene acceso a algún hotel de ese polo.
drop policy if exists "polos_select" on polos_turisticos;
create policy "polos_select" on polos_turisticos for select
  using (exists (
    select 1 from hoteles h where h.polo_id = polos_turisticos.id and has_hotel_access(h.id)
  ));

-- Roles: cada usuario ve sus propios roles.
drop policy if exists "uhr_select_own" on user_hotel_roles;
create policy "uhr_select_own" on user_hotel_roles for select
  using (user_id = auth.uid());

-- Catálogos: legibles si tienes acceso al hotel.
drop policy if exists "prendas_select" on catalogo_prendas;
create policy "prendas_select" on catalogo_prendas for select
  using (has_hotel_access(hotel_id));

drop policy if exists "ubic_select" on catalogo_ubicaciones;
create policy "ubic_select" on catalogo_ubicaciones for select
  using (has_hotel_access(hotel_id));

-- Definiciones: legibles si tienes acceso al hotel.
drop policy if exists "formdef_select" on form_definitions;
create policy "formdef_select" on form_definitions for select
  using (has_hotel_access(hotel_id));

-- Submissions: el usuario gestiona SOLO las suyas, en hoteles a los que accede.
drop policy if exists "subm_select" on form_submissions;
create policy "subm_select" on form_submissions for select
  using (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "subm_insert" on form_submissions;
create policy "subm_insert" on form_submissions for insert
  with check (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "subm_update" on form_submissions;
create policy "subm_update" on form_submissions for update
  using (user_id = auth.uid() and has_hotel_access(hotel_id))
  with check (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "subm_delete" on form_submissions;
create policy "subm_delete" on form_submissions for delete
  using (user_id = auth.uid() and has_hotel_access(hotel_id));

-- =============================================================================
-- 7. Datos iniciales — Hotel Gran Muthu Habana + catálogos + form lencería
-- =============================================================================
insert into hoteles (nombre, slug)
values ('Gran Muthu Habana', 'gran-muthu-habana')
on conflict (slug) do nothing;

-- Prendas (catálogo común observado en los 3 formularios)
insert into catalogo_prendas (hotel_id, codigo, nombre, orden)
select h.id, v.codigo, v.nombre, v.orden
from hoteles h,
  (values
    ('SP','Sábana personal',1),
    ('SK','Sábana king',2),
    ('F','Fundas',3),
    ('TB','Toalla de baño',4),
    ('TM','Toalla de mano',5),
    ('TA','Alfombrín',6),
    ('TF','Toallas faciales',7),
    ('TP','Toalla piscina',8)
  ) as v(codigo,nombre,orden)
where h.slug = 'gran-muthu-habana'
on conflict do nothing;

-- Ubicaciones (del control de lencería Muthu)
insert into catalogo_ubicaciones (hotel_id, nombre, orden)
select h.id, v.nombre, v.orden
from hoteles h,
  (values
    ('Lavandería',1),('Alm. Sucio',2),('Alm. Limpio',3),
    ('Piso 24',4),('Office Piso 24',5),
    ('Piso 25',6),('Office Piso 25',7),
    ('Piso 26',8),('Office Piso 26',9),
    ('Spa-1',10),('Spa-2',11)
  ) as v(nombre,orden)
where h.slug = 'gran-muthu-habana'
on conflict do nothing;

-- Definición del formulario de lencería (matriz ubicación × prenda)
insert into form_definitions (hotel_id, tipo, nombre, config)
select h.id, 'lenceria', 'Control de Lencería',
  jsonb_build_object(
    'layout','matriz',
    'filas','ubicaciones',
    'columnas','prendas',
    'total_fila', true,
    'total_columna', true
  )
from hoteles h
where h.slug = 'gran-muthu-habana'
on conflict (hotel_id, tipo, schema_version) do nothing;

-- =============================================================================
-- 8. Asignar rol de auditor a un usuario (EDITA el email antes de ejecutar)
-- =============================================================================
-- Auditor de prueba (cambiar/añadir el usuario real cuando corresponda):
insert into user_hotel_roles (user_id, hotel_id, rol)
select u.id, h.id, 'auditor'
from auth.users u, hoteles h
where u.email = 'leodev0211@gmail.com'
  and h.slug = 'gran-muthu-habana'
on conflict do nothing;
