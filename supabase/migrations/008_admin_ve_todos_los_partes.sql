-- =============================================================================
-- Los administradores ven todos los partes de su hotel
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (después de 001..007).
--
-- Qué cambia
-- ----------
-- Hasta ahora la RLS del módulo de auditoría era estrictamente personal: cada
-- usuario veía SOLO sus propias entregas (`user_id = auth.uid()`). Eso vale para
-- quien rellena los partes, pero deja ciego a quien tiene que supervisarlos: un
-- administrador del hotel entraba al histórico y no veía nada de lo que rellenan
-- los supervisores y auditores.
--
-- Aquí se abre la LECTURA a los administradores del hotel:
--
--   form_submissions      un admin ve todos los partes de sus hoteles
--   audit_daily           idem, en la capa plana del informe mensual
--   audit_daily_detalle   idem, en el desglose por prenda/ubicación
--   profiles              un admin puede resolver el nombre y el correo de la
--                         gente que rellena partes en sus hoteles (si no, el
--                         histórico mostraría UUID en vez de personas)
--
-- Qué NO cambia — a propósito
-- ---------------------------
-- * La ESCRITURA sigue siendo personal: insert/update/delete continúan exigiendo
--   `user_id = auth.uid()`. Un administrador mira, no corrige. Editar el parte de
--   otro rompería la trazabilidad y, con la clave única
--   (hotel, formulario, fecha, usuario), acabaría creando una entrega paralela a
--   nombre del administrador en lugar de modificar la original.
-- * `monthly_reports` sigue siendo por usuario. No hace falta tocarlo: la routine
--   que redacta el informe lee `audit_mes`/`audit_mes_dias`, que agregan el mes
--   ENTERO del hotel, así que el informe que genera un administrador ya cubre el
--   trabajo de todo el mundo.
-- * El rol `supervisor` no gana visibilidad extra. Si más adelante se quiere que
--   también vea el trabajo de los auditores, basta con añadir 'supervisor' a los
--   array['admin'] de este fichero (y a `puede_ver_perfil`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Helper: ¿puedo ver el perfil de esta persona?
-- -----------------------------------------------------------------------------
-- Cierto cuando el usuario actual es administrador de algún hotel en el que la
-- persona objetivo tiene un rol activo. Es SECURITY DEFINER porque necesita mirar
-- las filas de `user_hotel_roles` de OTRO usuario, que la política `uhr_select_own`
-- no deja leer directamente.
--
-- Devuelve un booleano sobre los hoteles del propio llamante: no filtra ningún
-- dato ajeno, igual que `has_hotel_access` y `has_hotel_role`.
create or replace function puede_ver_perfil(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or exists (
        select 1
        from user_hotel_roles yo
        join user_hotel_roles suyo on suyo.hotel_id = yo.hotel_id
        where yo.user_id = auth.uid()
          and yo.rol = 'admin'
          and yo.activo
          and suyo.user_id = target
          and suyo.activo
      );
$$;

comment on function puede_ver_perfil(uuid) is
  'Cierto si el usuario actual es el propio objetivo o administrador de un hotel donde el objetivo tiene rol activo. Usado por la RLS de profiles para poder mostrar quién rellenó cada parte.';


-- -----------------------------------------------------------------------------
-- 2. form_submissions: lectura para el administrador del hotel
-- -----------------------------------------------------------------------------
-- Para quien no es admin la condición nueva es falsa, así que el comportamiento
-- de auditores y supervisores queda exactamente igual que antes.
drop policy if exists "subm_select" on form_submissions;
create policy "subm_select" on form_submissions for select
  using (
    has_hotel_access(hotel_id)
    and (
      user_id = auth.uid()
      or has_hotel_role(hotel_id, array['admin'])
    )
  );

-- insert / update / delete se quedan como estaban (solo lo propio). Se redeclaran
-- aquí para dejar constancia de que la restricción es deliberada y no un olvido.
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


-- -----------------------------------------------------------------------------
-- 3. Capa plana del informe (audit_daily / audit_daily_detalle)
-- -----------------------------------------------------------------------------
-- Siguen siendo de solo lectura para todo el mundo: las escribe el trigger.
drop policy if exists "audit_daily_select" on audit_daily;
create policy "audit_daily_select" on audit_daily for select
  using (
    has_hotel_access(hotel_id)
    and (
      user_id = auth.uid()
      or has_hotel_role(hotel_id, array['admin'])
    )
  );

drop policy if exists "audit_det_select" on audit_daily_detalle;
create policy "audit_det_select" on audit_daily_detalle for select
  using (
    has_hotel_access(hotel_id)
    and (
      has_hotel_role(hotel_id, array['admin'])
      or exists (
        select 1 from audit_daily ad
        where ad.submission_id = audit_daily_detalle.submission_id
          and ad.user_id = auth.uid()
      )
    )
  );


-- -----------------------------------------------------------------------------
-- 4. profiles: el administrador puede poner cara a cada parte
-- -----------------------------------------------------------------------------
-- `profiles` ya tiene políticas propias ("Users can view own profile", etc.).
-- Las políticas permisivas se SUMAN (OR), así que esta solo añade casos: nadie
-- pierde acceso a su propio perfil.
drop policy if exists "profiles_admin_hotel_select" on profiles;
create policy "profiles_admin_hotel_select" on profiles for select
  using (puede_ver_perfil(id));
