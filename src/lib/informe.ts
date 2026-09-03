// -----------------------------------------------------------------------------
// Construcción del "informe" a partir de una submission + su definición.
//
// Transforma los datos crudos de cada layout (lenceria / vales / categorias /
// lineas) en una estructura genérica y neutral de informe: una lista de
// secciones, cada una con una tabla (cabeceras + filas + fila de totales).
// Esta estructura la consume `InformePreview` para renderizar en pantalla y en
// PDF, así que aquí vive toda la lógica; el componente solo pinta.
// -----------------------------------------------------------------------------
import type { FormDefinition, FormSubmission, Prenda, Ubicacion } from "@/services/audit";
import {
  GrupoDef,
  ColumnaDef,
  CampoCabecera,
  flattenColumnas,
  totalPMR,
} from "@/components/audit/LineasTable";
import { MatrixData, computeTotals } from "@/components/audit/LenceriaMatrix";
import { ValesData } from "@/components/audit/ValesForm";
import { CategoriasData } from "@/components/audit/CategoriasForm";
import {
  CuadradorData,
  PrendaPeso,
  prendaProduccion,
  prendaKg,
  computeCuadradorTotals,
} from "@/components/audit/CuadradorForm";
import { LineasData } from "@/components/audit/LineasTable";

const fmtKg2 = (n: number): string =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface InformeCampo {
  label: string;
  valor: string;
}

export interface InformeTabla {
  titulo?: string; // subtítulo de la sección (nombre del vale / categoría)
  columnas: string[]; // encabezados de columna (ya legibles)
  filas: (string | number)[][]; // celdas por fila
  total?: (string | number)[]; // fila de totales (opcional)
}

/**
 * Sección de texto corrido. La usa el informe mensual, que es prosa redactada por
 * la IA en vez de tablas de un parte. Los partes diarios no la rellenan.
 *
 * `bloques` va en el orden del documento original: dentro de una misma sección
 * los párrafos y las viñetas se intercalan, y separarlos en dos listas cambiaría
 * lo que dice el informe.
 */
export interface InformeBloque {
  tipo: "parrafo" | "vineta";
  texto: string;
}

export interface InformeSeccion {
  titulo?: string;
  bloques: InformeBloque[];
}

export interface Informe {
  titulo: string; // nombre del formulario
  hotel: string;
  polo?: string;
  fechaLabel: string; // fecha legible
  estado: string;
  campos: InformeCampo[]; // datos de cabecera del parte
  tablas: InformeTabla[];
  secciones?: InformeSeccion[]; // texto (informe mensual); va antes de las tablas
}

const fmtFecha = (f: string): string =>
  new Date(f + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const cel = (v: number | string | undefined): string | number =>
  v === undefined || v === null || v === "" ? "" : (v as string | number);

// Cabecera del parte → lista de {label, valor}, respetando el orden definido.
const camposCabecera = (
  cabecera: CampoCabecera[] | undefined,
  data: Record<string, string> | undefined
): InformeCampo[] => {
  if (!cabecera?.length) return [];
  return cabecera.map((c) => ({ label: c.label, valor: (data?.[c.key] ?? "").toString() || "—" }));
};

// -----------------------------------------------------------------------------
// Layout: lencería (matriz ubicación × prenda)
// -----------------------------------------------------------------------------
const buildLenceria = (
  data: MatrixData,
  ubicaciones: Ubicacion[],
  prendas: Prenda[]
): InformeTabla[] => {
  const totals = computeTotals(data, ubicaciones, prendas);
  const columnas = ["Ubicación", ...prendas.map((p) => p.nombre), "Total"];
  const filas: (string | number)[][] = ubicaciones.map((u) => [
    u.nombre,
    ...prendas.map((p) => cel(data?.[u.id]?.[p.id])),
    totals.porUbicacion[u.id] || 0,
  ]);
  const total: (string | number)[] = [
    "Total",
    ...prendas.map((p) => totals.porPrenda[p.id] || 0),
    totals.general,
  ];
  return [{ columnas, filas, total }];
};

// -----------------------------------------------------------------------------
// Columnas aplanadas de grupos → encabezados legibles + claves.
// -----------------------------------------------------------------------------
const colsDeGrupos = (grupos: GrupoDef[]): ColumnaDef[] => flattenColumnas(grupos);

const valorDeColumna = (
  valores: Record<string, number | string>,
  col: ColumnaDef
): string | number => (col.calc === "total_pmr" ? totalPMR(valores) : cel(valores?.[col.key]));

// -----------------------------------------------------------------------------
// Layout: vales (una tabla por vale, prendas fijas × columnas)
// -----------------------------------------------------------------------------
const buildVales = (data: ValesData, grupos: GrupoDef[]): InformeTabla[] => {
  const cols = colsDeGrupos(grupos);
  const columnas = ["Prenda", ...cols.map((c) => c.label)];
  return (data.vales ?? []).map((vale) => {
    const filas = vale.prendas.map((l) => [
      l.prenda,
      ...cols.map((c) => valorDeColumna(l.valores, c)),
    ]);
    const total: (string | number)[] = [
      "Total",
      ...cols.map((c) => {
        if (c.tipo === "text" || c.tipo === "fecha") return "";
        return vale.prendas.reduce(
          (s, l) => s + (c.calc === "total_pmr" ? totalPMR(l.valores) : Number(l.valores?.[c.key]) || 0),
          0
        );
      }),
    ];
    return { titulo: `Vale ${vale.nombre || ""}`.trim(), columnas, filas, total };
  });
};

// -----------------------------------------------------------------------------
// Layout: categorías (una tabla por categoría, líneas dinámicas)
// -----------------------------------------------------------------------------
const buildCategorias = (data: CategoriasData, columnas: ColumnaDef[]): InformeTabla[] => {
  const heads = columnas.map((c) => c.label);
  return (data.categorias ?? []).map((cat) => {
    const filas = cat.lineas.map((l) => columnas.map((c) => cel(l.valores?.[c.key])));
    const total: (string | number)[] = columnas.map((c, idx) => {
      if (idx === 0) return "Total";
      if (c.tipo === "text" || c.tipo === "fecha") return "";
      return cat.lineas.reduce((s, l) => s + (Number(l.valores?.[c.key]) || 0), 0);
    });
    return { titulo: cat.nombre, columnas: heads, filas, total };
  });
};

// -----------------------------------------------------------------------------
// Layout: cuadrador (tabla única de líneas; 2 columnas calculadas)
// -----------------------------------------------------------------------------
const buildCuadrador = (data: CuadradorData, prendas: PrendaPeso[]): InformeTabla[] => {
  const columnas = [
    "Vale",
    "Prenda",
    "Cant. Declaración Jurada de Sucio",
    "Pendiente",
    "Producción (prenda)",
    "Producción (kg)",
    "Observaciones",
  ];
  const filas = (data.lineas ?? []).map((l) => [
    cel(l.valores?.vale as string),
    l.prenda || "",
    cel(l.valores?.declaracion as number),
    cel(l.valores?.pendiente as number),
    prendaProduccion(l),
    fmtKg2(prendaKg(l, prendas)),
    cel(l.valores?.observaciones as string),
  ]);
  const t = computeCuadradorTotals(data, prendas);
  const total: (string | number)[] = ["Total", "", t.declaracion, t.pendiente, t.prenda, fmtKg2(t.kg), ""];
  return [{ columnas, filas, total }];
};

// -----------------------------------------------------------------------------
// Layout: lineas (tabla única por prenda)
// -----------------------------------------------------------------------------
const buildLineas = (
  data: LineasData,
  grupos: GrupoDef[],
  conObservaciones: boolean
): InformeTabla[] => {
  const cols = colsDeGrupos(grupos);
  const columnas = ["Prenda", ...cols.map((c) => c.label), ...(conObservaciones ? ["Observaciones"] : [])];
  const filas = (data.lineas ?? []).map((l) => [
    l.prenda,
    ...cols.map((c) => valorDeColumna(l.valores, c)),
    ...(conObservaciones ? [l.observaciones ?? ""] : []),
  ]);
  const total: (string | number)[] = [
    "Total",
    ...cols.map((c) => {
      if (c.tipo === "text" || c.tipo === "fecha") return "";
      return (data.lineas ?? []).reduce(
        (s, l) => s + (c.calc === "total_pmr" ? totalPMR(l.valores) : Number(l.valores?.[c.key]) || 0),
        0
      );
    }),
    ...(conObservaciones ? [""] : []),
  ];
  return [{ columnas, filas, total }];
};

// -----------------------------------------------------------------------------
// Punto de entrada: submission + definición (+ catálogos) → Informe.
// -----------------------------------------------------------------------------
export const buildInforme = (params: {
  submission: FormSubmission;
  definition: FormDefinition;
  hotel: string;
  polo?: string;
  ubicaciones?: Ubicacion[];
  prendas?: Prenda[];
  prendasPeso?: PrendaPeso[];
}): Informe => {
  const { submission, definition, hotel, polo, ubicaciones = [], prendas = [], prendasPeso = [] } = params;
  const config = definition.config ?? {};
  const layout = config.layout as string | undefined;
  const cabecera = config.cabecera as CampoCabecera[] | undefined;
  const grupos = (config.grupos as GrupoDef[]) ?? [];
  const data = submission.data ?? {};

  let tablas: InformeTabla[] = [];
  if (definition.tipo === "lenceria") {
    tablas = buildLenceria(data as MatrixData, ubicaciones, prendas);
  } else if (layout === "vales") {
    tablas = buildVales(data as ValesData, grupos);
  } else if (layout === "categorias") {
    const columnas = (config.columnas as ColumnaDef[]) ?? [];
    tablas = buildCategorias(data as CategoriasData, columnas);
  } else if (layout === "cuadrador") {
    tablas = buildCuadrador(data as CuadradorData, prendasPeso);
  } else {
    tablas = buildLineas(data as LineasData, grupos, Boolean(config.campo_observaciones));
  }

  return {
    titulo: definition.nombre,
    hotel,
    polo,
    fechaLabel: fmtFecha(submission.fecha),
    estado: submission.estado === "completado" ? "Completado" : "Borrador",
    campos: camposCabecera(cabecera, (data as { cabecera?: Record<string, string> }).cabecera),
    tablas,
  };
};

// Nombre de archivo sugerido para el PDF.
export const nombreArchivoInforme = (informe: Informe, fecha: string): string => {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita tildes/diacriticos
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  return `${slug(informe.titulo)}-${fecha}`;
};
