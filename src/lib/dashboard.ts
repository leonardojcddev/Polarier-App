// -----------------------------------------------------------------------------
// Lógica del dashboard de control (por hotel y por mes).
//
// Convierte las submissions de un mes en series diarias y acumuladas, calcula el
// avance frente a la dotación del hotel (total de prendas) y detecta desviaciones
// de comportamiento (días flojos, picos, días sin registrar, borradores).
//
// Es lógica pura y sin React: la vista (`DashboardControl.tsx`) solo pinta lo que
// aquí se decide, igual que `informe.ts` hace con el informe.
// -----------------------------------------------------------------------------
import type { FormDefinition, FormSubmission, FormTipo, SubmissionEstado } from "@/services/audit";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

/** Lo que aportó un formulario concreto en un día concreto. */
export interface DiaForm {
  estado: SubmissionEstado | null;
  /** Métrica principal en prendas (producción del día). */
  valor: number;
  /** Kg producidos (solo Cuadrador). */
  kg: number;
  /** Desglose completo de `totales` para el detalle del día. */
  metricas: Record<string, number>;
}

/** Un día del mes, con lo registrado por cada formulario. */
export interface DiaDashboard {
  dia: number; // 1..diasMes
  fecha: string; // YYYY-MM-DD
  etiqueta: string; // "12"
  fechaLarga: string; // "martes, 12 de agosto"
  futuro: boolean; // aún no ha llegado
  porForm: Record<string, DiaForm>; // form_definition_id → datos
}

/** Resumen de un formulario a lo largo del mes. */
export interface SerieForm {
  defId: string;
  nombre: string;
  tipo: FormTipo;
  color: string;
  /** Suma del mes (prendas). En lencería es el conteo máximo, no una suma. */
  total: number;
  diasConDatos: number;
  media: number;
  mediana: number;
  /** Los formularios de producción alimentan el acumulado; lencería no. */
  esProduccion: boolean;
}

export type TipoAlerta =
  | "produccion_baja"
  | "pico"
  | "sin_registrar"
  | "borrador"
  | "ritmo_bajo"
  | "ritmo_alto"
  | "sin_objetivo";

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidad: "alta" | "media" | "info";
  fecha?: string;
  dia?: number;
  titulo: string;
  /** Explicación en lenguaje llano de por qué llama la atención. */
  detalle: string;
  /** Qué conviene comprobar. */
  accion?: string;
}

export interface PuntoAcumulado {
  dia: number;
  etiqueta: string;
  fecha: string;
  /** Acumulado real hasta ese día (null en días futuros). */
  real: number | null;
  /** Ritmo ideal para llegar justo al objetivo el último día del mes. */
  ideal: number | null;
}

export interface ResumenDashboard {
  acumulado: number;
  objetivo: number | null;
  pctObjetivo: number | null;
  mediaDiaria: number;
  medianaDiaria: number;
  /** Estimación del cierre de mes manteniendo el ritmo actual. */
  proyeccion: number | null;
  diasRegistrados: number;
  diasTranscurridos: number;
  /** Jornadas ya cerradas (hoy no cuenta si el mes está en curso). */
  diasCompletos: number;
  diasMes: number;
  kgAcumulados: number;
}

export interface Dashboard {
  anio: number;
  mes: number;
  diasMes: number;
  /** Último día con datos posibles (diasMes si el mes ya terminó, 0 si es futuro). */
  diaActual: number;
  dias: DiaDashboard[];
  series: SerieForm[];
  /** Formulario usado como fuente del acumulado de producción. */
  fuenteId: string | null;
  objetivo: number | null;
  objetivoOrigen: string;
  curva: PuntoAcumulado[];
  resumen: ResumenDashboard;
  alertas: Alerta[];
  hayDatos: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, "0");
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const etiquetaMes = (anio: number, mes: number): string =>
  `${NOMBRES_MES[mes - 1] ?? mes} ${anio}`;

const diasDelMes = (anio: number, mes: number): number => new Date(anio, mes, 0).getDate();

const fechaLarga = (fecha: string): string =>
  new Date(`${fecha}T00:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const fmtNum = (n: number): string =>
  n.toLocaleString("es-ES", { maximumFractionDigits: 0 });

export const fmtKg = (n: number): string =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Color de cada formulario en las gráficas. Paleta Polarier: azul primario y
// dorado (accent), tomados del tema para que respeten modo claro/oscuro.
const COLOR_POR_TIPO: Record<FormTipo, string> = {
  produccion: "hsl(var(--primary))",
  cuadrador: "hsl(var(--accent))",
  lenceria: "hsl(231 30% 55%)",
};

// -----------------------------------------------------------------------------
// Extracción de métricas desde `totales` (su forma varía según el tipo de form)
// -----------------------------------------------------------------------------

/**
 * Aplana `totales` a un diccionario plano de números y elige la métrica principal:
 * - cuadrador → `prenda` (producción en prendas) y `kg`
 * - vales/líneas/categorías → `porColumna.produccion` (si no, `total`, si no `general`)
 * - lencería → `general` (es un conteo de inventario, no una producción)
 */
const leerTotales = (
  totales: Record<string, unknown> | null | undefined,
  tipo: FormTipo
): { valor: number; kg: number; metricas: Record<string, number> } => {
  const t = totales ?? {};
  const metricas: Record<string, number> = {};

  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "number") metricas[k] = v;
  }
  const porColumna = t.porColumna as Record<string, unknown> | undefined;
  if (porColumna && typeof porColumna === "object") {
    for (const [k, v] of Object.entries(porColumna)) {
      if (typeof v === "number") metricas[k] = v;
    }
  }

  if (tipo === "cuadrador") {
    return { valor: num(metricas.prenda ?? metricas.produccion), kg: num(metricas.kg), metricas };
  }
  if (tipo === "lenceria") {
    return { valor: num(metricas.general), kg: 0, metricas };
  }
  const valor = metricas.produccion ?? metricas.total ?? metricas.general ?? 0;
  return { valor: num(valor), kg: num(metricas.kg), metricas };
};

// -----------------------------------------------------------------------------
// Construcción del dashboard
// -----------------------------------------------------------------------------
export interface BuildDashboardParams {
  submissions: FormSubmission[];
  definitions: FormDefinition[];
  anio: number;
  mes: number; // 1..12
  /** Hoy en formato YYYY-MM-DD (inyectable para tests). */
  hoy?: string;
  /** Formulario elegido como fuente del acumulado; si no, se elige el que más datos tenga. */
  fuenteId?: string | null;
  /** Dotación del hotel introducida a mano; si no, se deduce del formulario de lencería. */
  objetivoManual?: number | null;
}

export const buildDashboard = (params: BuildDashboardParams): Dashboard => {
  const {
    submissions,
    definitions,
    anio,
    mes,
    hoy = new Date().toISOString().slice(0, 10),
    objetivoManual = null,
  } = params;

  const nDias = diasDelMes(anio, mes);
  const prefijo = `${anio}-${pad2(mes)}`;
  const defsPorId = new Map(definitions.map((d) => [d.id, d]));

  // Día actual dentro del mes: 0 si el mes aún no ha empezado, nDias si ya terminó.
  const [hAnio, hMes, hDia] = hoy.split("-").map(Number);
  const diaActual =
    hAnio > anio || (hAnio === anio && hMes > mes)
      ? nDias
      : hAnio === anio && hMes === mes
        ? Math.min(hDia, nDias)
        : 0;

  // --- Rejilla de días -------------------------------------------------------
  const dias: DiaDashboard[] = Array.from({ length: nDias }, (_, i) => {
    const dia = i + 1;
    const fecha = `${prefijo}-${pad2(dia)}`;
    return {
      dia,
      fecha,
      etiqueta: String(dia),
      fechaLarga: fechaLarga(fecha),
      futuro: dia > diaActual,
      porForm: {},
    };
  });
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));

  // Si hay varias submissions del mismo form y día (varios usuarios), se suman las
  // de producción y se queda el mayor conteo en lencería.
  for (const s of submissions) {
    const def = defsPorId.get(s.form_definition_id);
    const d = porFecha.get(s.fecha);
    if (!def || !d) continue;
    const { valor, kg, metricas } = leerTotales(s.totales, def.tipo);
    const prev = d.porForm[def.id];
    if (!prev) {
      d.porForm[def.id] = { estado: s.estado, valor, kg, metricas };
    } else if (def.tipo === "lenceria") {
      if (valor > prev.valor) d.porForm[def.id] = { estado: s.estado, valor, kg, metricas };
    } else {
      prev.valor += valor;
      prev.kg += kg;
      if (s.estado === "borrador") prev.estado = "borrador";
      for (const [k, v] of Object.entries(metricas)) prev.metricas[k] = (prev.metricas[k] ?? 0) + v;
    }
  }

  // --- Serie por formulario --------------------------------------------------
  const series: SerieForm[] = definitions.map((def) => {
    const valores = dias
      .map((d) => d.porForm[def.id]?.valor)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const esProduccion = def.tipo !== "lenceria";
    const total = esProduccion
      ? valores.reduce((a, b) => a + b, 0)
      : valores.length
        ? Math.max(...valores)
        : 0;
    return {
      defId: def.id,
      nombre: def.nombre,
      tipo: def.tipo,
      color: COLOR_POR_TIPO[def.tipo] ?? "hsl(var(--muted-foreground))",
      total,
      diasConDatos: valores.length,
      media: valores.length ? total / (esProduccion ? valores.length : 1) : 0,
      mediana: mediana(valores),
      esProduccion,
    };
  });

  // --- Fuente del acumulado --------------------------------------------------
  const candidatas = series.filter((s) => s.esProduccion);
  const fuenteId =
    (params.fuenteId && candidatas.some((s) => s.defId === params.fuenteId)
      ? params.fuenteId
      : null) ??
    [...candidatas].sort((a, b) => b.diasConDatos - a.diasConDatos || b.total - a.total)[0]?.defId ??
    null;
  const fuente = series.find((s) => s.defId === fuenteId) ?? null;

  // --- Objetivo (dotación del hotel) ----------------------------------------
  const serieLenceria = series.find((s) => s.tipo === "lenceria");
  let objetivo: number | null = null;
  let objetivoOrigen = "";
  if (objetivoManual && objetivoManual > 0) {
    objetivo = objetivoManual;
    objetivoOrigen = "Dotación introducida manualmente.";
  } else if (serieLenceria && serieLenceria.total > 0) {
    objetivo = serieLenceria.total;
    objetivoOrigen = `Dotación tomada del inventario más alto registrado en «${serieLenceria.nombre}» este mes.`;
  } else {
    objetivoOrigen =
      "Todavía no hay objetivo: se calcula con el total de prendas contado en el formulario de lencería. Rellénalo (o fija la dotación a mano) para ver el avance hacia el 100 %.";
  }

  // --- Curva acumulada -------------------------------------------------------
  let acc = 0;
  const curva: PuntoAcumulado[] = dias.map((d) => {
    const v = fuenteId ? (d.porForm[fuenteId]?.valor ?? 0) : 0;
    if (!d.futuro) acc += v;
    return {
      dia: d.dia,
      etiqueta: d.etiqueta,
      fecha: d.fecha,
      real: d.futuro ? null : acc,
      ideal: objetivo !== null ? Math.round((objetivo * d.dia) / nDias) : null,
    };
  });

  // --- Resumen ---------------------------------------------------------------
  const valoresFuente = fuenteId
    ? dias.filter((d) => !d.futuro).map((d) => d.porForm[fuenteId]?.valor ?? 0).filter((v) => v > 0)
    : [];
  const acumulado = valoresFuente.reduce((a, b) => a + b, 0);
  const mediaDiaria = valoresFuente.length ? acumulado / valoresFuente.length : 0;
  const medianaDiaria = mediana(valoresFuente);
  const kgAcumulados = fuenteId
    ? dias.reduce((s, d) => s + (d.porForm[fuenteId]?.kg ?? 0), 0)
    : 0;

  // Proyección de cierre: el día de hoy va a medias, así que el ritmo se calcula
  // solo con jornadas completas (hasta ayer si el mes está en curso).
  const mesEnCurso = hAnio === anio && hMes === mes;
  const diasCompletos = mesEnCurso ? Math.max(0, diaActual - 1) : diaActual;
  const acumuladoCompletos = fuenteId
    ? dias
        .filter((d) => d.dia <= diasCompletos)
        .reduce((s, d) => s + (d.porForm[fuenteId]?.valor ?? 0), 0)
    : 0;
  const proyeccion =
    diasCompletos > 0 && acumuladoCompletos > 0
      ? Math.round((acumuladoCompletos / diasCompletos) * nDias)
      : null;

  const resumen: ResumenDashboard = {
    acumulado,
    objetivo,
    pctObjetivo: objetivo ? (acumulado / objetivo) * 100 : null,
    mediaDiaria,
    medianaDiaria,
    proyeccion,
    diasRegistrados: valoresFuente.length,
    diasTranscurridos: diaActual,
    diasCompletos,
    diasMes: nDias,
    kgAcumulados,
  };

  return {
    anio,
    mes,
    diasMes: nDias,
    diaActual,
    dias,
    series,
    fuenteId,
    objetivo,
    objetivoOrigen,
    curva,
    resumen,
    alertas: detectarAlertas({ dias, diaActual, fuente, resumen, objetivo, nDias }),
    hayDatos: submissions.length > 0,
  };
};

// -----------------------------------------------------------------------------
// Detección de desviaciones
//
// La referencia es la **mediana** de los días con producción (no la media): así un
// solo día atípico no arrastra el umbral y las comparaciones siguen siendo justas.
// Hacen falta al menos 3 días con datos para que la referencia signifique algo.
// -----------------------------------------------------------------------------
// OJO: estos umbrales están replicados en la vista SQL `audit_mes_dias`
// (supabase/migrations/006_auditoria_datos_ia.sql), que es la que alimenta el
// informe mensual. Si cambian aquí, hay que cambiarlos allí o el dashboard y el
// informe clasificarán los mismos días de forma distinta.
const UMBRAL_BAJO = 0.75; // por debajo del 75 % de la mediana → merece mirada
const UMBRAL_MUY_BAJO = 0.5; // por debajo de la mitad → prioridad alta
const UMBRAL_PICO = 1.5; // más del 150 % → pico que conviene entender
const MIN_DIAS_REFERENCIA = 3;

const pct = (n: number) => `${Math.round(n)} %`;

const detectarAlertas = (ctx: {
  dias: DiaDashboard[];
  diaActual: number;
  fuente: SerieForm | null;
  resumen: ResumenDashboard;
  objetivo: number | null;
  nDias: number;
}): Alerta[] => {
  const { dias, diaActual, fuente, resumen, objetivo, nDias } = ctx;
  const alertas: Alerta[] = [];
  if (!fuente) return alertas;

  const ref = resumen.medianaDiaria;
  const hayReferencia = resumen.diasRegistrados >= MIN_DIAS_REFERENCIA && ref > 0;

  for (const d of dias) {
    if (d.futuro) continue;
    const reg = d.porForm[fuente.defId];

    // Día pasado sin ningún registro del formulario fuente.
    if (!reg || reg.valor === 0) {
      // Solo se avisa si el mes ya tiene actividad (si no, no hay nada que comparar).
      if (resumen.diasRegistrados > 0 && d.dia < diaActual) {
        alertas.push({
          id: `sin-${d.fecha}`,
          tipo: "sin_registrar",
          severidad: "media",
          fecha: d.fecha,
          dia: d.dia,
          titulo: `Día ${d.dia} sin producción registrada`,
          detalle: `El ${d.fechaLarga} no hay ninguna producción anotada en «${fuente.nombre}». Un hueco en la serie frena el acumulado del mes y hace que el avance hacia la dotación del hotel parezca menor de lo real.`,
          accion: "Comprueba si ese día no hubo actividad o si el parte se quedó sin rellenar.",
        });
      }
      continue;
    }

    if (reg.estado === "borrador" && d.dia < diaActual) {
      alertas.push({
        id: `borrador-${d.fecha}`,
        tipo: "borrador",
        severidad: "info",
        fecha: d.fecha,
        dia: d.dia,
        titulo: `Día ${d.dia} guardado como borrador`,
        detalle: `El parte del ${d.fechaLarga} nunca se marcó como completado, así que sus cifras pueden estar a medias.`,
        accion: "Abre el formulario de ese día y ciérralo si ya está terminado.",
      });
    }

    if (!hayReferencia) continue;
    const ratio = reg.valor / ref;

    if (ratio < UMBRAL_BAJO) {
      const caida = (1 - ratio) * 100;
      alertas.push({
        id: `bajo-${d.fecha}`,
        tipo: "produccion_baja",
        severidad: ratio < UMBRAL_MUY_BAJO ? "alta" : "media",
        fecha: d.fecha,
        dia: d.dia,
        titulo: `Día ${d.dia}: producción ${pct(caida)} por debajo de lo habitual`,
        detalle: `El ${d.fechaLarga} se registraron ${fmtNum(reg.valor)} prendas, frente a las ${fmtNum(ref)} que marca el día típico del mes. Es una caída del ${pct(caida)}: al ritmo normal se habrían quedado sin lavar unas ${fmtNum(Math.max(0, ref - reg.valor))} prendas, que se arrastran al resto del mes.`,
        accion:
          "Revisa si hubo parada de máquina, turno incompleto, menos vales de los normales o prendas anotadas en otro día.",
      });
    } else if (ratio > UMBRAL_PICO) {
      alertas.push({
        id: `pico-${d.fecha}`,
        tipo: "pico",
        severidad: "info",
        fecha: d.fecha,
        dia: d.dia,
        titulo: `Día ${d.dia}: pico de producción`,
        detalle: `El ${d.fechaLarga} se registraron ${fmtNum(reg.valor)} prendas, un ${pct((ratio - 1) * 100)} por encima del día típico (${fmtNum(ref)}). Suele significar que se recuperó trabajo atrasado de días anteriores.`,
        accion: "Confirma que no se haya duplicado un vale ni sumado producción de otra jornada.",
      });
    }
  }

  // Ritmo global frente al objetivo del mes.
  if (objetivo && resumen.proyeccion !== null && diaActual > 0 && diaActual < nDias) {
    const desvio = (resumen.proyeccion / objetivo - 1) * 100;
    if (desvio < -10) {
      const faltan = Math.max(0, objetivo - resumen.acumulado);
      const diasRestantes = nDias - diaActual;
      alertas.push({
        id: "ritmo-bajo",
        tipo: "ritmo_bajo",
        severidad: "alta",
        titulo: "El ritmo actual no llega a la dotación del mes",
        detalle: `Con ${fmtNum(resumen.acumulado)} prendas en ${resumen.diasCompletos} jornadas cerradas, el mes cerraría en torno a ${fmtNum(resumen.proyeccion)} prendas: un ${pct(Math.abs(desvio))} por debajo de las ${fmtNum(objetivo)} del hotel. Quedan ${fmtNum(faltan)} prendas para ${diasRestantes} días, es decir ${fmtNum(Math.ceil(faltan / Math.max(1, diasRestantes)))} al día frente a las ${fmtNum(resumen.mediaDiaria)} que se llevan de media.`,
        accion: "Sube el ritmo diario o revisa si faltan partes por registrar.",
      });
    } else if (desvio > 10) {
      alertas.push({
        id: "ritmo-alto",
        tipo: "ritmo_alto",
        severidad: "info",
        titulo: "El ritmo va por encima de la dotación del mes",
        detalle: `La proyección de cierre (${fmtNum(resumen.proyeccion)} prendas) supera en un ${pct(desvio)} la dotación del hotel (${fmtNum(objetivo)}). Puede ser recuperación de meses anteriores o prendas contadas dos veces.`,
        accion: "Contrasta el inventario de lencería con la producción acumulada.",
      });
    }
  }

  if (!objetivo && resumen.acumulado > 0) {
    alertas.push({
      id: "sin-objetivo",
      tipo: "sin_objetivo",
      severidad: "info",
      titulo: "Sin dotación de referencia",
      detalle:
        "No hay un total de prendas del hotel con el que comparar, así que el avance se muestra solo en valores absolutos.",
      accion: "Rellena el formulario de lencería del mes o fija la dotación a mano.",
    });
  }

  // Primero lo urgente, y dentro de cada nivel por fecha.
  const peso = { alta: 0, media: 1, info: 2 } as const;
  return alertas.sort((a, b) => peso[a.severidad] - peso[b.severidad] || (a.dia ?? 0) - (b.dia ?? 0));
};

/**
 * Clasificación de un día respecto a la referencia, para colorear la gráfica diaria.
 */
export type EstadoDia = "sin_datos" | "bajo" | "muy_bajo" | "alto" | "normal";

export const clasificarDia = (valor: number, referencia: number): EstadoDia => {
  if (valor <= 0) return "sin_datos";
  if (referencia <= 0) return "normal";
  const r = valor / referencia;
  if (r < UMBRAL_MUY_BAJO) return "muy_bajo";
  if (r < UMBRAL_BAJO) return "bajo";
  if (r > UMBRAL_PICO) return "alto";
  return "normal";
};

// Azul Polarier para lo normal, dorado de marca para los picos y la escala
// ámbar/rojo para lo que hay que vigilar.
export const COLOR_ESTADO: Record<EstadoDia, string> = {
  sin_datos: "hsl(var(--muted))",
  muy_bajo: "hsl(var(--destructive))",
  bajo: "hsl(25 90% 52%)",
  alto: "hsl(var(--accent))",
  normal: "hsl(var(--primary))",
};

export const ETIQUETA_ESTADO: Record<EstadoDia, string> = {
  sin_datos: "Sin registrar",
  muy_bajo: "Muy por debajo",
  bajo: "Por debajo",
  alto: "Pico",
  normal: "En línea",
};

/** Meses con actividad en el histórico, más reciente primero. */
export const mesesDisponibles = (
  submissions: { fecha: string }[],
  incluirActual = true
): { anio: number; mes: number; clave: string }[] => {
  const set = new Set<string>();
  for (const s of submissions) set.add(s.fecha.slice(0, 7));
  if (incluirActual) set.add(new Date().toISOString().slice(0, 7));
  return Array.from(set)
    .sort()
    .reverse()
    .map((clave) => {
      const [anio, mes] = clave.split("-").map(Number);
      return { anio, mes, clave };
    });
};
