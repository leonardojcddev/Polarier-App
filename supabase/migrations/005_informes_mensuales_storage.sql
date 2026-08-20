-- =============================================================================
-- Storage para informes mensuales (PDF) — Fase 2b
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 004_monthly_reports.sql).
--
-- Crea un bucket PRIVADO donde la routine del día 1 sube el PDF del informe
-- mensual por hotel. La ruta del archivo se guarda en monthly_reports.pdf_url.
--
-- Convención de ruta dentro del bucket:  {hotel_id}/{anio}-{mes}.pdf
--
-- El PDF lo sube un workflow de n8n (con su credencial de Supabase), invocado por
-- la routine mensual de Claude Desktop. Las políticas de abajo son para LECTURA
-- desde la app por el auditor del hotel (se sirve con URL firmada).
-- =============================================================================

-- Bucket privado (no público: se sirve con URL firmada).
insert into storage.buckets (id, name, public)
values ('informes-mensuales', 'informes-mensuales', false)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Lectura desde la app: el usuario puede leer el PDF de un hotel al que tiene
-- acceso. La primera carpeta de la ruta (name split por '/') es el hotel_id.
-- -----------------------------------------------------------------------------
drop policy if exists "informes_mensuales_read" on storage.objects;
create policy "informes_mensuales_read" on storage.objects for select
  using (
    bucket_id = 'informes-mensuales'
    and has_hotel_access( (storage.foldername(name))[1]::uuid )
  );

-- Nota: NO se crean políticas de insert/update/delete para usuarios normales.
-- Solo el workflow de n8n (con su credencial de Supabase) escribe en este bucket.
