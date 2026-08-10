import { supabase } from '@/lib/supabaseClient';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
export type FormTipo = 'produccion' | 'cuadrador' | 'lenceria';
export type SubmissionEstado = 'borrador' | 'completado';

export interface Prenda {
  id: string;
  codigo: string | null;
  nombre: string;
  orden: number;
}

export interface Ubicacion {
  id: string;
  nombre: string;
  orden: number;
}

export interface FormDefinition {
  id: string;
  hotel_id: string;
  tipo: FormTipo;
  nombre: string;
  schema_version: number;
  config: Record<string, unknown>;
  activo: boolean;
}

export interface FormSubmission {
  id: string;
  hotel_id: string;
  form_definition_id: string;
  user_id: string;
  fecha: string; // YYYY-MM-DD
  estado: SubmissionEstado;
  data: Record<string, unknown>;
  totales: Record<string, unknown>;
  informe_url: string | null;
  informe_estado: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Catálogos (por hotel)
// -----------------------------------------------------------------------------
export const getPrendas = async (hotelId: string): Promise<Prenda[]> => {
  const { data, error } = await supabase
    .from('catalogo_prendas')
    .select('id, codigo, nombre, orden')
    .eq('hotel_id', hotelId)
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data ?? [];
};

export const getUbicaciones = async (hotelId: string): Promise<Ubicacion[]> => {
  const { data, error } = await supabase
    .from('catalogo_ubicaciones')
    .select('id, nombre, orden')
    .eq('hotel_id', hotelId)
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data ?? [];
};

// -----------------------------------------------------------------------------
// Definiciones de formulario
// -----------------------------------------------------------------------------
export const getFormDefinitions = async (hotelId: string): Promise<FormDefinition[]> => {
  const { data, error } = await supabase
    .from('form_definitions')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('activo', true)
    .order('tipo');
  if (error) throw error;
  return (data ?? []) as FormDefinition[];
};

// -----------------------------------------------------------------------------
// Submissions
// -----------------------------------------------------------------------------
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Submission de un formulario para una fecha concreta (por defecto hoy).
 * Devuelve null si aún no existe (formulario del día sin empezar).
 */
export const getSubmission = async (
  formDefinitionId: string,
  fecha: string = today()
): Promise<FormSubmission | null> => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_definition_id', formDefinitionId)
    .eq('fecha', fecha)
    .maybeSingle();
  if (error) throw error;
  return data as FormSubmission | null;
};

/**
 * Crea o actualiza la submission del día (upsert por la clave única
 * hotel_id + form_definition_id + fecha + user_id).
 */
export const saveSubmission = async (params: {
  hotelId: string;
  formDefinitionId: string;
  fecha?: string;
  estado: SubmissionEstado;
  data: Record<string, unknown>;
  totales: Record<string, unknown>;
}): Promise<FormSubmission> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const row = {
    hotel_id: params.hotelId,
    form_definition_id: params.formDefinitionId,
    user_id: user.id,
    fecha: params.fecha ?? today(),
    estado: params.estado,
    data: params.data,
    totales: params.totales,
  };

  const { data, error } = await supabase
    .from('form_submissions')
    .upsert(row, { onConflict: 'hotel_id,form_definition_id,fecha,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as FormSubmission;
};

/**
 * Histórico de submissions de un hotel (más recientes primero).
 * La RLS limita a las del propio usuario.
 */
export const getSubmissionHistory = async (
  hotelId: string,
  limit = 60
): Promise<FormSubmission[]> => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('fecha', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
};
