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
// Dotación de lencería (stock fijo del hotel por ubicación × prenda)
// -----------------------------------------------------------------------------
export interface DotacionCelda {
  ubicacion_id: string;
  prenda_id: string;
  cantidad: number;
}

/**
 * Dotación del hotel en la misma forma que `data` del formulario de lencería:
 * `{ [ubicacionId]: { [prendaId]: cantidad } }`. Vacío si el hotel no tiene
 * dotación cargada (la app entonces no compara contra nada).
 */
export const getDotacionLenceria = async (
  hotelId: string
): Promise<Record<string, Record<string, number>>> => {
  const { data, error } = await supabase
    .from('dotacion_lenceria')
    .select('ubicacion_id, prenda_id, cantidad')
    .eq('hotel_id', hotelId);
  if (error) throw error;
  const dotacion: Record<string, Record<string, number>> = {};
  for (const c of (data ?? []) as DotacionCelda[]) {
    (dotacion[c.ubicacion_id] ??= {})[c.prenda_id] = Number(c.cantidad) || 0;
  }
  return dotacion;
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
 * MI submission de un formulario para una fecha concreta (por defecto hoy).
 * Devuelve null si aún no existe (formulario del día sin empezar).
 *
 * El filtro por `user_id` es imprescindible, no una optimización: un
 * administrador ve por RLS los partes de todo su equipo, así que sin él esta
 * consulta podría devolver varias filas (revienta el `maybeSingle`) o cargar en
 * el formulario el parte de otra persona. Como `saveSubmission` hace upsert con
 * la clave (hotel, formulario, fecha, usuario), guardar entonces no corregiría
 * ese parte: crearía una copia paralela a nombre del administrador.
 *
 * Para abrir el parte de otra persona (solo lectura) está `getSubmissionById`.
 */
export const getSubmission = async (
  formDefinitionId: string,
  fecha: string = today()
): Promise<FormSubmission | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_definition_id', formDefinitionId)
    .eq('fecha', fecha)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as FormSubmission | null;
};

/**
 * Una submission concreta por id. La RLS decide si se puede ver: la propia
 * siempre, y las del resto del hotel solo si eres administrador.
 */
export const getSubmissionById = async (id: string): Promise<FormSubmission | null> => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('id', id)
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
// Autoría de los partes (quién rellenó cada uno)
// -----------------------------------------------------------------------------
export interface Autor {
  id: string;
  nombre: string;
  email: string | null;
}

/**
 * Nombres de quienes firman una lista de partes, indexados por `user_id`.
 *
 * Solo sirve de algo para un administrador: la RLS de `profiles` deja ver el
 * perfil propio y, si eres admin, el de la gente con rol en tus hoteles. Para
 * los demás devuelve únicamente su propio perfil, que es justo lo que ven.
 *
 * Nunca lanza: si los perfiles no se pueden leer, el histórico debe seguir
 * mostrándose (sin nombre) en lugar de quedarse en blanco.
 */
export const getAutores = async (userIds: string[]): Promise<Record<string, Autor>> => {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);
    if (error) throw error;
    const autores: Record<string, Autor> = {};
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      autores[p.id] = {
        id: p.id,
        nombre: p.full_name?.trim() || p.email?.split('@')[0] || 'Sin nombre',
        email: p.email,
      };
    }
    return autores;
  } catch (e) {
    console.warn('No se pudieron cargar los autores de los partes:', e);
    return {};
  }
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
  /** Cuándo se pidió el informe desde la app. Es la cola que atiende la routine. */
  solicitado_at: string | null;
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

/**
 * Pide el informe mensual de un hotel y periodo.
 *
 * Son dos cosas, en este orden y con esta prioridad:
 *
 *  1. Escribe la SOLICITUD en `monthly_reports` (`estado='pendiente'`,
 *     `solicitado_at=now`). Esto es lo que manda: lo escribe un usuario
 *     autenticado y pasa por RLS, así que es la única fuente fiable de qué
 *     informe hay que generar.
 *  2. Despierta a la routine de Claude llamando a la Edge Function
 *     `disparar-informe-mensual` (que guarda el token del endpoint /fire; no
 *     puede vivir en el bundle de Vite, que es público).
 *
 * Si (2) falla no se lanza error: la solicitud ya está en la cola y el barrido
 * diario de la routine la recogerá. Solo se pierde la inmediatez.
 */
export const solicitarInformeMensual = async (
  hotelId: string,
  anio: number,
  mes: number
): Promise<{ reporte: MonthlyReport; disparada: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const { data, error } = await supabase
    .from('monthly_reports')
    .upsert(
      {
        hotel_id: hotelId,
        user_id: user.id,
        anio,
        mes,
        estado: 'pendiente' as MonthlyEstado,
        solicitado_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id,user_id,anio,mes' }
    )
    .select()
    .single();
  if (error) throw error;

  let disparada = false;
  try {
    const { error: fnError } = await supabase.functions.invoke('disparar-informe-mensual', {
      body: { hotel_id: hotelId, anio, mes },
    });
    disparada = !fnError;
    if (fnError) console.warn('No se pudo disparar la routine:', fnError);
  } catch (e) {
    console.warn('No se pudo disparar la routine:', e);
  }

  return { reporte: data as MonthlyReport, disparada };
};
