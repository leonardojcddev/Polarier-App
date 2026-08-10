import { supabase } from '@/lib/supabaseClient';

export interface Polo {
  id: string;
  nombre: string;
}

export interface Hotel {
  id: string;
  polo_id: string | null;
  nombre: string;
  slug: string;
  activo: boolean;
  polo?: Polo | null;
}

export type RolHotel = 'auditor' | 'supervisor' | 'admin';

export interface HotelRole {
  id: string;
  hotel_id: string;
  rol: RolHotel;
  activo: boolean;
  hotel?: Hotel;
}

/**
 * Roles del usuario autenticado, con el hotel embebido.
 * La RLS ya limita a los roles propios; aquí solo pedimos los activos.
 */
export const getMyRoles = async (): Promise<HotelRole[]> => {
  const { data, error } = await supabase
    .from('user_hotel_roles')
    .select(
      'id, hotel_id, rol, activo, hotel:hoteles(id, polo_id, nombre, slug, activo, polo:polos_turisticos(id, nombre))'
    )
    .eq('activo', true);
  if (error) throw error;
  return (data ?? []) as unknown as HotelRole[];
};

/**
 * Todos los polos turísticos. Sujeto a RLS: un usuario solo ve los polos
 * que tengan al menos un hotel al que él tenga acceso.
 */
export const getPolos = async (): Promise<Polo[]> => {
  const { data, error } = await supabase
    .from('polos_turisticos')
    .select('id, nombre')
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as Polo[];
};

/**
 * Hoteles a los que el usuario tiene acceso (derivados de sus roles).
 */
export const getMyHotels = async (): Promise<Hotel[]> => {
  const roles = await getMyRoles();
  const map = new Map<string, Hotel>();
  for (const r of roles) {
    if (r.hotel) map.set(r.hotel.id, r.hotel);
  }
  return Array.from(map.values());
};
