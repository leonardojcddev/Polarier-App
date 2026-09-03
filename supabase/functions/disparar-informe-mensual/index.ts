// -----------------------------------------------------------------------------
// disparar-informe-mensual
// -----------------------------------------------------------------------------
// Despierta a la routine de Claude que redacta el informe mensual de auditoría.
//
// Por qué existe
// -------------
// La routine se dispara con un POST a su endpoint /fire usando un bearer token
// (`sk-ant-oat01-…`). Ese token NO puede vivir en el frontend: la app es una SPA
// de Vite y cualquier variable `VITE_*` acaba escrita en el bundle público. Con
// el token, cualquiera podría lanzar la routine, que corre con el conector MCP
// de Supabase y permisos de escritura.
//
// Qué NO hace
// -----------
// No decide qué informe se genera. El `text` que se manda a /fire llega a la
// routine envuelto en un bloque `<routine-fire-payload>` marcado como dato no
// fiable, así que solo sirve de aviso ("mira la cola"). Quién manda es la fila de
// `monthly_reports` con `solicitado_at`, escrita por un usuario autenticado y
// filtrada por RLS. Un token filtrado no consigue que la routine escriba sobre
// datos ajenos.
//
// Secretos (supabase secrets set):
//   ROUTINE_ID     trig_…                 id de la routine
//   ROUTINE_TOKEN  sk-ant-oat01-…         token del trigger de API
//
// Despliegue:
//   supabase functions deploy disparar-informe-mensual
// -----------------------------------------------------------------------------
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FIRE_BETA = 'experimental-cc-routine-2026-04-01';
const ANTHROPIC_VERSION = '2023-06-01';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const routineId = Deno.env.get('ROUTINE_ID');
  const routineToken = Deno.env.get('ROUTINE_TOKEN');
  if (!routineId || !routineToken) {
    return json({ error: 'Faltan los secretos ROUTINE_ID / ROUTINE_TOKEN' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Falta la cabecera Authorization' }, 401);

  let hotel_id: string, anio: number, mes: number;
  try {
    ({ hotel_id, anio, mes } = await req.json());
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400);
  }
  if (!hotel_id || !anio || !mes) {
    return json({ error: 'Faltan hotel_id, anio o mes' }, 400);
  }

  // Cliente actuando COMO el usuario que llama: la RLS de monthly_reports hace
  // de comprobación de permisos. Si la fila no vuelve, o no la ha creado él o no
  // tiene acceso a ese hotel; en ambos casos no hay nada que disparar.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: fila, error } = await supabase
    .from('monthly_reports')
    .select('id, solicitado_at')
    .eq('hotel_id', hotel_id)
    .eq('anio', anio)
    .eq('mes', mes)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!fila) return json({ error: 'No hay solicitud para ese hotel y periodo' }, 403);

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const fire = await fetch(
    `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${routineToken}`,
        'anthropic-beta': FIRE_BETA,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text:
          `Solicitud desde la app Polarier-Auto: hotel ${hotel_id}, periodo ${periodo}. ` +
          `Revisa la cola de monthly_reports y genera lo que esté pendiente.`,
      }),
    }
  );

  const cuerpo = await fire.text();
  if (!fire.ok) {
    // La solicitud ya está encolada, así que esto no rompe nada: el barrido
    // diario de la routine la recogerá. Se devuelve el error para el log.
    return json({ ok: false, status: fire.status, detalle: cuerpo.slice(0, 500) }, 502);
  }

  let session_url: string | null = null;
  try {
    session_url = JSON.parse(cuerpo).claude_code_session_url ?? null;
  } catch {
    /* la routine se ha disparado igual; solo perdemos el enlace */
  }

  return json({ ok: true, session_url });
});
