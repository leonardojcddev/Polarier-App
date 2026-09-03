// -----------------------------------------------------------------------------
// Informe mensual → estructura `Informe`.
//
// La routine de Claude deja en `monthly_reports.resumen` prosa en markdown
// (`analisis`) más una lista de `valoraciones`, y en `metricas` los agregados
// que usó. Aquí se traduce todo eso al mismo tipo `Informe` que consumen la
// vista previa, el PDF y el envío por correo, para no duplicar ninguno de los
// tres.
// -----------------------------------------------------------------------------
import type { Informe, InformeCampo, InformeSeccion, InformeTabla } from "@/lib/informe";
import type { MonthlyReport } from "@/services/audit";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const NOMBRES_TIPO: Record<string, string> = {
  lenceria: "Lencería",
  produccion: "Producción",
  cuadrador: "Cuadrador Lavatín",
};

// Quita el marcado inline que no sabemos pintar en el PDF (negritas, cursivas,
// código). El texto sigue siendo legible; solo pierde el énfasis.
const limpiarInline = (s: string): string =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1$2")
    .replace(/`([^`]+?)`/g, "$1")
    .trim();

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const num = (v: unknown): number | null => {
  if (esNumero(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const fmt = (n: number): string => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });

/**
 * Trocea el markdown del análisis en secciones.
 *
 * Reconoce encabezados (`## Título`) y las líneas que son solo negrita
 * (`**Título**`), que es como los escribe la routine. El resto son párrafos o
 * viñetas. El primer encabezado se descarta: repite el título del documento,
 * que el PDF ya pinta en la cabecera.
 */
export const parsearAnalisis = (markdown: string): InformeSeccion[] => {
  const secciones: InformeSeccion[] = [];
  let actual: InformeSeccion | null = null;
  let primerTitulo = true;

  const abrir = (titulo?: string) => {
    actual = { titulo, bloques: [] };
    secciones.push(actual);
  };

  for (const bruta of markdown.split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea) continue;

    const enc = /^#{1,6}\s+(.*)$/.exec(linea);
    const soloNegrita = /^\*\*(.+)\*\*:?$/.exec(linea);

    if (enc || soloNegrita) {
      const titulo = limpiarInline((enc ? enc[1] : soloNegrita![1]).replace(/:$/, ""));
      // El título del documento ya va en la cabecera del PDF.
      if (primerTitulo && secciones.length === 0) {
        primerTitulo = false;
        continue;
      }
      primerTitulo = false;
      abrir(titulo);
      continue;
    }

    if (!actual) abrir();

    const vin = /^[-*+]\s+(.*)$/.exec(linea);
    actual!.bloques.push(
      vin
        ? { tipo: "vineta", texto: limpiarInline(vin[1]) }
        : { tipo: "parrafo", texto: limpiarInline(linea) }
    );
  }

  // Fuera las secciones que quedaron sin contenido.
  return secciones.filter((s) => s.titulo || s.bloques.length);
};

// `metricas.porFormulario` → tabla. Las claves son las que escribe la routine.
const tablaFormularios = (metricas: Record<string, unknown>): InformeTabla[] => {
  const por = metricas.porFormulario;
  if (!Array.isArray(por) || por.length === 0) return [];

  const filas = por.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const tipo = String(o.tipo ?? "");
    const total = num(o.total);
    const kg = num(o.kg);
    const partes = num(o.partes);
    return [
      NOMBRES_TIPO[tipo] ?? tipo ?? "—",
      partes === null ? "—" : fmt(partes),
      total === null ? "—" : fmt(total),
      kg === null ? "—" : fmt(kg),
    ];
  });

  return [{
    titulo: "Resumen por formulario",
    columnas: ["Formulario", "Partes", "Total", "Kg"],
    filas,
  }];
};

const camposMetricas = (metricas: Record<string, unknown>): InformeCampo[] => {
  const campos: InformeCampo[] = [];
  const total = num(metricas.totalPartes);
  const conParte = num(metricas.diasConParte);
  const diasMes = num(metricas.diasMes);
  const dotacion = num(metricas.dotacion);

  if (total !== null) campos.push({ label: "Partes del mes", valor: fmt(total) });
  if (conParte !== null) {
    campos.push({
      label: "Días con parte",
      valor: diasMes !== null ? `${fmt(conParte)} de ${fmt(diasMes)}` : fmt(conParte),
    });
  }
  if (dotacion !== null && dotacion > 0) {
    campos.push({ label: "Dotación", valor: fmt(dotacion) });
  }
  return campos;
};

/**
 * Construye el `Informe` del mes a partir de la fila de `monthly_reports`.
 * Devuelve `null` si el informe todavía no tiene análisis redactado.
 */
export const buildInformeMensual = (params: {
  reporte: MonthlyReport;
  hotel: string;
  polo?: string;
}): Informe | null => {
  const { reporte, hotel, polo } = params;
  const resumen = (reporte.resumen ?? {}) as { analisis?: unknown; valoraciones?: unknown };
  const analisis = typeof resumen.analisis === "string" ? resumen.analisis : "";
  const valoraciones = Array.isArray(resumen.valoraciones)
    ? resumen.valoraciones.filter((v): v is string => typeof v === "string")
    : [];

  if (!analisis && valoraciones.length === 0) return null;

  const metricas = (reporte.metricas ?? {}) as Record<string, unknown>;
  const secciones = analisis ? parsearAnalisis(analisis) : [];
  if (valoraciones.length > 0) {
    secciones.push({
      titulo: "Valoraciones",
      bloques: valoraciones.map((v) => ({ tipo: "vineta" as const, texto: limpiarInline(v) })),
    });
  }

  const nombreMes = reporte.mes >= 1 && reporte.mes <= 12 ? NOMBRES_MES[reporte.mes - 1] : "";

  return {
    titulo: "Informe mensual de auditoría",
    hotel,
    polo,
    fechaLabel: `${nombreMes} ${reporte.anio}`.trim(),
    estado: reporte.estado === "listo" ? "Listo" : reporte.estado,
    campos: camposMetricas(metricas),
    tablas: tablaFormularios(metricas),
    secciones,
  };
};

/** "2026-08", que es lo que usan `nombrePdf` y el modal de correo. */
export const periodoInforme = (reporte: MonthlyReport): string =>
  `${reporte.anio}-${String(reporte.mes).padStart(2, "0")}`;
