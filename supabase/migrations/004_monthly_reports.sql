-- =============================================================================
-- Informes mensuales de auditoría — Fase 2 (apartado "por meses")
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001..003).
--
-- Objetivo: agrupar los formularios diarios por mes y tener un sitio donde, a
-- final de mes, un agente escriba un "informe de comportamiento mensual" con
-- valoraciones. Esta migración solo crea el almacén; el agente y la generación
-- del PDF mensual llegan después.
--
-- Un registro por (hotel, usuario, año, mes). Se asocia a user_id igual que
-- form_submissions, para que cada auditor vea sus propios informes (RLS).
--   resumen  jsonb = valoraciones/estructura que rellenará el agente
--   metricas jsonb = totales agregados del mes (cacheados, opcional)
-- =============================================================================

create table if not exists monthly_reports (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hoteles(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  anio        int  not null,
  mes         int  not null check (mes between 1 and 12),
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','generando','listo','error')),
  resumen     jsonb not null default '{}'::jsonb,   -- valoraciones del agente (futuro)
  metricas    jsonb not null default '{}'::jsonb,   -- agregados del mes (cache, opcional)
  pdf_url     text,
  generado_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (hotel_id, user_id, anio, mes)
);
create index if not exists idx_monthly_hotel_periodo
  on monthly_reports(hotel_id, anio desc, mes desc);
create index if not exists idx_monthly_user on monthly_reports(user_id);

-- updated_at automático (reutiliza la función de 001)
drop trigger if exists trg_monthly_updated on monthly_reports;
create trigger trg_monthly_updated before update on monthly_reports
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security — mismo modelo que form_submissions: cada usuario gestiona
-- SOLO sus informes, en hoteles a los que tiene acceso.
-- -----------------------------------------------------------------------------
alter table monthly_reports enable row level security;

drop policy if exists "monthly_select" on monthly_reports;
create policy "monthly_select" on monthly_reports for select
  using (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "monthly_insert" on monthly_reports;
create policy "monthly_insert" on monthly_reports for insert
  with check (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "monthly_update" on monthly_reports;
create policy "monthly_update" on monthly_reports for update
  using (user_id = auth.uid() and has_hotel_access(hotel_id))
  with check (user_id = auth.uid() and has_hotel_access(hotel_id));

drop policy if exists "monthly_delete" on monthly_reports;
create policy "monthly_delete" on monthly_reports for delete
  using (user_id = auth.uid() and has_hotel_access(hotel_id));
