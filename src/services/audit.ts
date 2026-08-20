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

// -----------------------------------------------------------------------------
// Informes mensuales (apartado "por meses")
// -----------------------------------------------------------------------------
export type MonthlyEstado = 'pendiente' | 'generando' | 'listo' | 'error';

export interface MonthlyReport {
  id: string;
  hotel_id: string;
  user_id: string;
  anio: number;
  mes: number; // 1..12
  estado: MonthlyEstado;
  resumen: Record<string, unknown>;
  metricas: Record<string, unknown>;
  pdf_url: string | null;
  generado_at: string | null;
  created_at: string;
  updated_at: string;
}

// Dos dígitos para construir fechas YYYY-MM-DD.
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Submissions de un mes concreto (rango [primer día, primer día del mes siguiente)).
 * La RLS limita a las del propio usuario.
 */
export const getSubmissionsByMonth = async (
  hotelId: string,
  anio: number,
  mes: number
): Promise<FormSubmission[]> => {
  const desde = `${anio}-${pad2(mes)}-01`;
  const sigAnio = mes === 12 ? anio + 1 : anio;
  const sigMes = mes === 12 ? 1 : mes + 1;
  const hasta = `${sigAnio}-${pad2(sigMes)}-01`; // exclusivo
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('hotel_id', hotelId)
    .gte('fecha', desde)
    .lt('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FormSubmission[];
};

/**
 * Informes mensuales existentes de un hotel (los del propio usuario, por RLS).
 * Sirve para conocer el estado de cada mes en el listado.
 */
export const getMonthlyReports = async (hotelId: string): Promise<MonthlyReport[]> => {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MonthlyReport[];
};

/**
 * Informe mensual de un (hotel, año, mes) concreto, si existe (del propio usuario
 * por RLS). Para la vista de detalle del mes.
 */
export const getMonthlyReport = async (
  hotelId: string,
  anio: number,
  mes: number
): Promise<MonthlyReport | null> => {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('anio', anio)
    .eq('mes', mes)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as MonthlyReport | null;
};

/**
 * URL firmada del PDF del informe mensual (bucket privado 'informes-mensuales').
 * pdfUrl es la ruta guardada en monthly_reports.pdf_url.
 */
export const getMonthlyReportPdfUrl = async (
  pdfUrl: string,
  expiresInSec = 3600
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('informes-mensuales')
    .createSignedUrl(pdfUrl, expiresInSec);
  if (error || !data) throw new Error('No se pudo generar la URL del informe');
  return data.signedUrl;
};

/**
 * Crea o actualiza el informe mensual de un (hotel, usuario, año, mes).
 * Pensado para que el agente lo rellene más adelante; disponible ya como enganche.
 */
export const upsertMonthlyReport = async (params: {
  hotelId: string;
  anio: number;
  mes: number;
  estado?: MonthlyEstado;
  resumen?: Record<string, unknown>;
  metricas?: Record<string, unknown>;
  pdfUrl?: string | null;
}): Promise<MonthlyReport> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const row: Record<string, unknown> = {
    hotel_id: params.hotelId,
    user_id: user.id,
    anio: params.anio,
    mes: params.mes,
  };
  if (params.estado !== undefined) row.estado = params.estado;
  if (params.resumen !== undefined) row.resumen = params.resumen;
  if (params.metricas !== undefined) row.metricas = params.metricas;
  if (params.pdfUrl !== undefined) row.pdf_url = params.pdfUrl;

  const { data, error } = await supabase
    .from('monthly_reports')
    .upsert(row, { onConflict: 'hotel_id,user_id,anio,mes' })
    .select()
    .single();
  if (error) throw error;
  return data as MonthlyReport;
};
