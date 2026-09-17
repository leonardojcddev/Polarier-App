// -----------------------------------------------------------------------------
// Dotación de lencería del hotel.
//
// La cantidad de lencería de un hotel es una y no cambia: a lo largo del mes va
// circulando entre ubicaciones (pisos, offices, almacén sucio, lavandería…) y al
// cierre debe volver a sumar lo mismo. Esa cifra fija, desglosada por ubicación
// × prenda, vive en la tabla `dotacion_lenceria` y aquí se convierte en:
//
//   - la precarga del formulario de lencería (para no teclearla cada día),
//   - la comparación conteo ↔ dotación que muestran el formulario y el informe,
//   - el total que usa el dashboard como objetivo del mes.
//
// Lógica pura, sin React ni Supabase, igual que `dashboard.ts` e `informe.ts`.
// No importa nada en tiempo de ejecución de `LenceriaMatrix` (solo el tipo)
// para no crear un ciclo: la matriz sí importa de aquí.
// -----------------------------------------------------------------------------
import type { Prenda, Ubicacion } from "@/services/audit";
import type { MatrixData } from "@/components/audit/LenceriaMatrix";

/** Misma forma que `MatrixData`: { [ubicacionId]: { [prendaId]: cantidad } }. */
export type Dotacion = MatrixData;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Suma de toda la dotación (todas las ubicaciones y prendas). */
export const totalDotacion = (dotacion: Dotacion | null | undefined): number => {
  if (!dotacion) return 0;
  let total = 0;
  for (const fila of Object.values(dotacion)) {
    for (const v of Object.values(fila ?? {})) total += num(v);
  }
  return total;
};

/** ¿Hay alguna cantidad definida? Una dotación vacía no sirve de referencia. */
export const hayDotacion = (dotacion: Dotacion | null | undefined): boolean =>
  totalDotacion(dotacion) > 0;

/**
 * Datos iniciales del formulario de lencería a partir de la dotación: copia
 * profunda, sin ceros (la matriz trata "sin valor" como 0 y muestra el hueco).
 * Devuelve un objeto nuevo, así editar el formulario nunca toca la dotación.
 */
export const precargarDesdeDotacion = (dotacion: Dotacion | null | undefined): MatrixData => {
  const data: MatrixData = {};
  if (!dotacion) return data;
  for (const [uId, fila] of Object.entries(dotacion)) {
    const copia: Record<string, number> = {};
    for (const [pId, v] of Object.entries(fila ?? {})) {
      const n = num(v);
      if (n > 0) copia[pId] = n;
    }
    if (Object.keys(copia).length) data[uId] = copia;
  }
  return data;
};

export interface Comparacion {
  dotacion: number;
  contado: number;
  /** contado − dotación: negativo = faltan prendas, positivo = sobran. */
  diferencia: number;
}

export interface ComparacionDotacion {
  general: Comparacion;
  porPrenda: Record<string, Comparacion>;
  porUbicacion: Record<string, Comparacion>;
  /** true si el conteo cuadra exactamente con la dotación. */
  cuadra: boolean;
}

// Totales de una matriz recorriendo solo las ubicaciones y prendas indicadas
// (las del catálogo y las añadidas a mano). Mismo criterio que `computeTotals`.
const totales = (m: MatrixData, ubicaciones: Ubicacion[], prendas: Prenda[]) => {
  const porUbicacion: Record<string, number> = {};
  const porPrenda: Record<string, number> = {};
  let general = 0;
  for (const u of ubicaciones) {
    let fila = 0;
    for (const p of prendas) {
      const v = num(m?.[u.id]?.[p.id]);
      fila += v;
      porPrenda[p.id] = (porPrenda[p.id] ?? 0) + v;
    }
    porUbicacion[u.id] = fila;
    general += fila;
  }
  return { porUbicacion, porPrenda, general };
};

/**
 * Compara el conteo de la matriz con la dotación, por prenda, por ubicación y
 * en total.
 */
export const compararConDotacion = (
  data: MatrixData,
  dotacion: Dotacion,
  ubicaciones: Ubicacion[],
  prendas: Prenda[]
): ComparacionDotacion => {
  const contado = totales(data ?? {}, ubicaciones, prendas);
  const esperado = totales(dotacion ?? {}, ubicaciones, prendas);

  const cmp = (c: number, d: number): Comparacion => ({ dotacion: d, contado: c, diferencia: c - d });

  const porPrenda: Record<string, Comparacion> = {};
  for (const p of prendas) porPrenda[p.id] = cmp(contado.porPrenda[p.id] ?? 0, esperado.porPrenda[p.id] ?? 0);

  const porUbicacion: Record<string, Comparacion> = {};
  for (const u of ubicaciones) {
    porUbicacion[u.id] = cmp(contado.porUbicacion[u.id] ?? 0, esperado.porUbicacion[u.id] ?? 0);
  }

  const general = cmp(contado.general, esperado.general);
  return { general, porPrenda, porUbicacion, cuadra: general.diferencia === 0 };
};

/** "+12", "−12" o "0", para pintar diferencias. */
export const fmtDiferencia = (n: number): string => {
  if (n === 0) return "0";
  const abs = Math.abs(n).toLocaleString("es-ES", { maximumFractionDigits: 0 });
  return n > 0 ? `+${abs}` : `−${abs}`;
};
