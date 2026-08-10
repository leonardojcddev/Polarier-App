import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  GrupoDef,
  CampoCabecera,
  ColumnaDef,
  flattenColumnas,
  totalPMR,
} from "@/components/audit/LineasTable";

// -----------------------------------------------------------------------------
// Modelo de datos: un vale = bloque con todas las prendas fijas.
// { cabecera, vales: [{ id, nombre, prendas: [{ prenda, valores }] }] }
// -----------------------------------------------------------------------------
export interface PrendaLinea {
  prenda: string;
  valores: Record<string, number | string>;
}
export interface Vale {
  id: string;
  nombre: string;
  prendas: PrendaLinea[];
}
export type ValesData = {
  cabecera?: Record<string, string>;
  vales: Vale[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const nuevoVale = (prendas: string[], nombre: string): Vale => ({
  id: uid(),
  nombre,
  prendas: prendas.map((p) => ({ prenda: p, valores: {} })),
});

const valorColumna = (linea: PrendaLinea, col: ColumnaDef): number | string => {
  if (col.calc === "total_pmr") return totalPMR(linea.valores);
  return linea.valores?.[col.key] ?? "";
};

// Totales generales (sumados sobre todas las prendas de todos los vales).
export const computeValesTotals = (data: ValesData, grupos: GrupoDef[]) => {
  const cols = flattenColumnas(grupos);
  const porColumna: Record<string, number> = {};
  let general = 0;
  for (const col of cols) {
    if (col.tipo === "text" || col.tipo === "fecha") continue;
    let sum = 0;
    for (const v of data.vales ?? [])
      for (const l of v.prendas)
        sum += col.calc === "total_pmr" ? totalPMR(l.valores) : Number(l.valores?.[col.key]) || 0;
    porColumna[col.key] = sum;
    if (col.calc === "total_pmr") general = sum;
  }
  return { porColumna, general };
};

interface Props {
  grupos: GrupoDef[];
  cabecera?: CampoCabecera[];
  prendas: string[];
  data: ValesData;
  onChange: (data: ValesData) => void;
  readOnly?: boolean;
}

const ValesForm = ({ grupos, cabecera = [], prendas, data, onChange, readOnly }: Props) => {
  const vales = data.vales ?? [];
  const cols = useMemo(() => flattenColumnas(grupos), [grupos]);
  const hasGrupos = grupos.some((g) => g.label);

  const update = (next: Partial<ValesData>) => onChange({ ...data, vales, ...next });

  const setCabecera = (key: string, val: string) =>
    update({ cabecera: { ...(data.cabecera || {}), [key]: val } });

  const addVale = () =>
    update({ vales: [...vales, nuevoVale(prendas, `Vale ${vales.length + 1}`)] });

  const removeVale = (id: string) => update({ vales: vales.filter((v) => v.id !== id) });

  const setValeNombre = (id: string, nombre: string) =>
    update({ vales: vales.map((v) => (v.id === id ? { ...v, nombre } : v)) });

  const setValor = (valeId: string, prendaIdx: number, col: ColumnaDef, raw: string) =>
    update({
      vales: vales.map((v) => {
        if (v.id !== valeId) return v;
        const prendas = v.prendas.map((l, i) => {
          if (i !== prendaIdx) return l;
          const valores = { ...l.valores };
          if (raw === "") delete valores[col.key];
          else if (col.tipo === "text") valores[col.key] = raw;
          else {
            const n = Math.max(0, Math.floor(Number(raw)));
            if (Number.isNaN(n)) return l;
            valores[col.key] = n;
          }
          return { ...l, valores };
        });
        return { ...v, prendas };
      }),
    });

  return (
    <div className="space-y-4">
      {/* Datos generales del parte (cabecera) */}
      {cabecera.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted px-4 py-2.5 border-b-2 border-border">
            <h2 className="text-sm font-semibold text-foreground">Datos del parte</h2>
          </div>
          {/* gap con fondo = líneas gruesas y visibles entre celdas */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-muted-foreground/30 p-1">
            {cabecera.map((c) => (
              <div key={c.key} className="bg-card p-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{c.label}</label>
                <input
                  type={c.tipo === "fecha" ? "date" : "text"}
                  disabled={readOnly}
                  value={data.cabecera?.[c.key] ?? ""}
                  onChange={(e) => setCabecera(c.key, e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                  placeholder={c.label}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {vales.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay vales. Pulsa “Añadir vale” para registrar el primero.
        </p>
      )}

      {/* Un bloque por vale */}
      {vales.map((vale) => (
        <div key={vale.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Cabecera del vale (mismo azul que la tabla) */}
          <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 border-b-2 border-primary-foreground/25">
            <span className="text-sm font-semibold shrink-0">Vale</span>
            <input
              disabled={readOnly}
              value={vale.nombre}
              onChange={(e) => setValeNombre(vale.id, e.target.value)}
              className="flex-1 min-w-0 rounded-lg bg-primary-foreground/15 px-2.5 py-1.5 text-sm font-medium outline-none placeholder:text-primary-foreground/60 focus:ring-2 focus:ring-primary-foreground/40 disabled:opacity-70"
              placeholder="Nº / identificador del vale"
            />
            {!readOnly && (
              <button
                onClick={() => removeVale(vale.id)}
                className="shrink-0 p-1.5 rounded-lg text-primary-foreground/80 hover:bg-primary-foreground/15 transition-colors"
                title="Quitar vale"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Tabla de prendas del vale (escritorio) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                {hasGrupos && (
                  <tr className="tbl-head">
                    <th rowSpan={2} className="sticky left-0 z-20 tbl-head text-left font-semibold px-4 py-2.5 min-w-[150px] align-bottom">Prenda</th>
                    {grupos.map((g, gi) =>
                      g.label ? (
                        <th key={gi} colSpan={g.cols.length} className="px-3 py-2 font-semibold text-center border-l-2 tbl-head-sep">{g.label}</th>
                      ) : (
                        <th key={gi} rowSpan={2} className="px-3 py-2.5 font-semibold text-center align-bottom min-w-[90px] border-l-2 tbl-head-sep">{g.cols[0].label}</th>
                      )
                    )}
                  </tr>
                )}
                <tr className="tbl-head">
                  {!hasGrupos && <th className="sticky left-0 z-20 tbl-head text-left font-semibold px-4 py-3 min-w-[150px]">Prenda</th>}
                  {grupos.map((g, gi) =>
                    g.label
                      ? g.cols.map((c) => (
                          <th key={c.key} className="px-2 py-2 font-medium text-center text-xs min-w-[80px] border-l-2 tbl-head-sep">{c.label}</th>
                        ))
                      : !hasGrupos
                      ? <th key={gi} className="px-3 py-3 font-semibold text-center min-w-[90px] border-l-2 tbl-head-sep">{g.cols[0].label}</th>
                      : null
                  )}
                </tr>
              </thead>
              <tbody>
                {vale.prendas.map((l, idx) => (
                  <tr key={idx} className={idx % 2 ? "bg-muted/30" : "bg-card"}>
                    <td className={`sticky left-0 z-10 px-4 py-2.5 border-t border-border font-medium text-foreground whitespace-nowrap ${idx % 2 ? "bg-muted" : "bg-card"}`}>
                      {l.prenda}
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-1.5 py-1.5 border-t border-l-2 border-border text-center">
                        {c.calc ? (
                          <span className="inline-block w-16 font-semibold text-primary">{totalPMR(l.valores)}</span>
                        ) : (
                          <input
                            type={c.tipo === "text" ? "text" : "number"}
                            min={c.tipo === "text" ? undefined : 0}
                            inputMode={c.tipo === "text" ? undefined : "numeric"}
                            disabled={readOnly}
                            value={valorColumna(l, c) as string | number}
                            onChange={(e) => setValor(vale.id, idx, c, e.target.value)}
                            className={`no-spinner ${c.tipo === "text" ? "w-20" : "w-16"} text-center rounded-lg border border-border bg-background px-1.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60`}
                            placeholder={c.tipo === "text" ? "—" : "0"}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Prendas del vale (móvil): tarjeta por prenda */}
          <div className="lg:hidden divide-y divide-border">
            {vale.prendas.map((l, idx) => (
              <div key={idx} className="p-4">
                <p className="text-sm font-semibold text-foreground mb-2">{l.prenda}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {cols.map((c) => (
                    <div key={c.key} className={c.calc ? "col-span-2" : ""}>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{c.label}</label>
                      {c.calc ? (
                        <div className="rounded-lg bg-accent/15 px-3 py-2 text-sm font-semibold text-primary">{totalPMR(l.valores)}</div>
                      ) : (
                        <input
                          type={c.tipo === "text" ? "text" : "number"}
                          min={c.tipo === "text" ? undefined : 0}
                          inputMode={c.tipo === "text" ? undefined : "numeric"}
                          disabled={readOnly}
                          value={valorColumna(l, c) as string | number}
                          onChange={(e) => setValor(vale.id, idx, c, e.target.value)}
                          className="no-spinner w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                          placeholder={c.tipo === "text" ? "—" : "0"}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!readOnly && (
        <button
          onClick={addVale}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus size={16} /> Añadir vale
        </button>
      )}
    </div>
  );
};

export default ValesForm;
