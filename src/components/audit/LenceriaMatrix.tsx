import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Prenda, Ubicacion } from "@/services/audit";

// data: { [ubicacionId]: { [prendaId]: number } }
export type MatrixData = Record<string, Record<string, number>>;

export interface MatrixTotals {
  porUbicacion: Record<string, number>;
  porPrenda: Record<string, number>;
  general: number;
}

export const computeTotals = (
  data: MatrixData,
  ubicaciones: Ubicacion[],
  prendas: Prenda[]
): MatrixTotals => {
  const porUbicacion: Record<string, number> = {};
  const porPrenda: Record<string, number> = {};
  let general = 0;
  for (const u of ubicaciones) {
    let fila = 0;
    for (const p of prendas) {
      const val = Number(data?.[u.id]?.[p.id]) || 0;
      fila += val;
      porPrenda[p.id] = (porPrenda[p.id] || 0) + val;
    }
    porUbicacion[u.id] = fila;
    general += fila;
  }
  return { porUbicacion, porPrenda, general };
};

interface Props {
  ubicaciones: Ubicacion[];
  prendas: Prenda[];
  data: MatrixData;
  onChange: (data: MatrixData) => void;
  readOnly?: boolean;
  onAddUbicacion?: () => void;
  onRenameUbicacion?: (id: string, nombre: string) => void;
  onRemoveUbicacion?: (id: string) => void;
}

// Las ubicaciones añadidas por el supervisor se marcan con orden < 0.
// Su nombre es editable (vacío al crearse) mientras el formulario no sea readOnly.
const esEditable = (u: Ubicacion) => u.orden < 0;

/**
 * Matriz ubicación × prenda con totales de fila/columna calculados en vivo.
 * Rediseño nativo del control de lencería (no reproduce Excel visualmente).
 */
const LenceriaMatrix = ({ ubicaciones, prendas, data, onChange, readOnly, onAddUbicacion, onRenameUbicacion, onRemoveUbicacion }: Props) => {
  const totals = useMemo(
    () => computeTotals(data, ubicaciones, prendas),
    [data, ubicaciones, prendas]
  );

  const setCell = (uId: string, pId: string, raw: string) => {
    const fila = { ...(data[uId] || {}) };
    if (raw === "") {
      // Vacío = sin valor (no un 0 real). Muestra el placeholder y cuenta como 0.
      delete fila[pId];
    } else {
      const val = Math.max(0, Math.floor(Number(raw)));
      if (Number.isNaN(val)) return;
      fila[pId] = val;
    }
    onChange({ ...data, [uId]: fila });
  };

  return (
    <>
    <div className="hidden lg:block overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="tbl-head">
            <th className="sticky left-0 z-20 tbl-head text-left font-semibold px-4 py-3.5 min-w-[150px] rounded-tl-2xl">
              Ubicación
            </th>
            {prendas.map((p) => (
              <th key={p.id} className="px-3 py-3.5 font-semibold text-center min-w-[76px] border-l-2 tbl-head-sep">
                <span className="block leading-tight text-xs">{p.nombre}</span>
                {p.codigo && <span className="text-[10px] font-normal opacity-70">{p.codigo}</span>}
              </th>
            ))}
            <th className={`px-4 py-3.5 font-semibold text-center min-w-[80px] border-l-2 tbl-head-sep ${readOnly ? "rounded-tr-2xl" : ""}`}>
              Total
            </th>
            {!readOnly && <th className="px-2 py-3.5 w-10 rounded-tr-2xl" aria-label="Acciones"></th>}
          </tr>
        </thead>
        <tbody>
          {ubicaciones.map((u, i) => (
            <tr key={u.id} className={`transition-colors ${i % 2 ? "bg-muted/30" : "bg-card"}`}>
              <td className={`sticky left-0 z-10 font-medium text-foreground px-4 py-2 border-t border-border whitespace-nowrap ${i % 2 ? "bg-muted" : "bg-card"}`}>
                {esEditable(u) && !readOnly ? (
                  <input
                    type="text"
                    value={u.nombre}
                    onChange={(e) => onRenameUbicacion?.(u.id, e.target.value)}
                    className="w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-medium outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/30"
                    placeholder="Nombre de la ubicación"
                  />
                ) : (
                  u.nombre
                )}
              </td>
              {prendas.map((p) => (
                <td key={p.id} className="px-1.5 py-1.5 border-t border-border text-center">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    disabled={readOnly}
                    value={data?.[u.id]?.[p.id] || ""}
                    onChange={(e) => setCell(u.id, p.id, e.target.value)}
                    className="no-spinner w-16 text-center rounded-lg border border-border bg-background px-1.5 py-1.5 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="0"
                  />
                </td>
              ))}
              <td className="px-4 py-2 border-t border-border text-center font-semibold text-primary bg-accent/10">
                {totals.porUbicacion[u.id] || 0}
              </td>
              {!readOnly && (
                <td className="px-2 py-2 border-t border-border text-center">
                  {esEditable(u) && (
                    <button
                      type="button"
                      onClick={() => onRemoveUbicacion?.(u.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Eliminar ubicación"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-primary/90 text-primary-foreground font-semibold">
            <td className="sticky left-0 z-10 bg-primary px-4 py-3 rounded-bl-2xl">Total</td>
            {prendas.map((p) => (
              <td key={p.id} className="px-3 py-3 text-center">
                {totals.porPrenda[p.id] || 0}
              </td>
            ))}
            <td className={`px-4 py-3 text-center bg-accent text-accent-foreground ${readOnly ? "rounded-br-2xl" : ""}`}>
              {totals.general}
            </td>
            {!readOnly && <td className="px-2 py-3 bg-primary rounded-br-2xl"></td>}
          </tr>
        </tfoot>
      </table>
    </div>

    {!readOnly && onAddUbicacion && (
      <button
        type="button"
        onClick={onAddUbicacion}
        className="hidden lg:inline-flex items-center gap-2 mt-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        Añadir ubicación
      </button>
    )}

    {/* Vista de tarjetas (móvil): una tarjeta por ubicación */}
    <div className="lg:hidden space-y-3">
      {ubicaciones.map((u) => (
        <div key={u.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 bg-primary text-primary-foreground px-4 py-2.5">
            {esEditable(u) && !readOnly ? (
              <input
                type="text"
                value={u.nombre}
                onChange={(e) => onRenameUbicacion?.(u.id, e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-sm font-semibold text-primary-foreground placeholder:text-primary-foreground/60 outline-none focus:ring-2 focus:ring-primary-foreground/40"
                placeholder="Nombre de la ubicación"
              />
            ) : (
              <span className="font-semibold text-sm">{u.nombre}</span>
            )}
            <span className="shrink-0 text-xs bg-accent text-accent-foreground rounded-full px-2.5 py-0.5 font-semibold">
              Total: {totals.porUbicacion[u.id] || 0}
            </span>
            {esEditable(u) && !readOnly && (
              <button
                type="button"
                onClick={() => onRemoveUbicacion?.(u.id)}
                className="shrink-0 p-1 rounded-lg text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/15 transition-colors"
                title="Eliminar ubicación"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4">
            {prendas.map((p) => (
              <div key={p.id}>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{p.nombre}</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  disabled={readOnly}
                  value={data?.[u.id]?.[p.id] || ""}
                  onChange={(e) => setCell(u.id, p.id, e.target.value)}
                  className="no-spinner w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {!readOnly && onAddUbicacion && (
        <button
          type="button"
          onClick={onAddUbicacion}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
          Añadir ubicación
        </button>
      )}
      {/* Totales por prenda (resumen inferior en móvil) */}
      <div className="rounded-2xl border border-border bg-primary/90 text-primary-foreground shadow-sm p-4">
        <p className="text-sm font-semibold mb-2">Totales por prenda</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {prendas.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span className="text-primary-foreground/80">{p.nombre}</span>
              <span className="font-semibold">{totals.porPrenda[p.id] || 0}</span>
            </div>
          ))}
          <div className="col-span-2 flex justify-between border-t border-primary-foreground/20 pt-1.5 mt-1">
            <span className="font-semibold">Total general</span>
            <span className="font-bold">{totals.general}</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default LenceriaMatrix;
