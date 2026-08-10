import { useMemo } from "react";
import { Plus, Trash2, Sun, Moon } from "lucide-react";
import { ColumnaDef } from "@/components/audit/LineasTable";

export interface CampoCabecera {
  key: string;
  label: string;
  tipo?: "text" | "fecha" | "turno";
}

// -----------------------------------------------------------------------------
// Modelo: 5 categorías fijas, cada una con líneas dinámicas.
// { categorias: [{ nombre, lineas: [{ id, valores:{...} }] }] }
// -----------------------------------------------------------------------------
export interface CatLinea {
  id: string;
  valores: Record<string, number | string>;
}
export interface Categoria {
  nombre: string;
  lineas: CatLinea[];
}
export type CategoriasData = { cabecera?: Record<string, string>; categorias: Categoria[] };

const uid = () => Math.random().toString(36).slice(2, 10);

export const initCategorias = (nombres: string[], cabecera: Record<string, string> = {}): CategoriasData => ({
  cabecera,
  categorias: nombres.map((nombre) => ({ nombre, lineas: [{ id: uid(), valores: {} }] })),
});

export const computeCategoriasTotals = (data: CategoriasData, columnas: ColumnaDef[]) => {
  const porColumna: Record<string, number> = {};
  for (const col of columnas) {
    if (col.tipo === "text" || col.tipo === "fecha") continue;
    let sum = 0;
    for (const cat of data.categorias ?? [])
      for (const l of cat.lineas) sum += Number(l.valores?.[col.key]) || 0;
    porColumna[col.key] = sum;
  }
  return { porColumna };
};

interface Props {
  columnas: ColumnaDef[];
  cabecera?: CampoCabecera[];
  data: CategoriasData;
  onChange: (data: CategoriasData) => void;
  readOnly?: boolean;
}

const CategoriasForm = ({ columnas, cabecera = [], data, onChange, readOnly }: Props) => {
  const categorias = data.categorias ?? [];
  const dataCols = useMemo(() => columnas, [columnas]);

  const update = (categorias: Categoria[]) => onChange({ ...data, categorias });

  const setCabecera = (key: string, val: string) =>
    onChange({ ...data, categorias, cabecera: { ...(data.cabecera || {}), [key]: val } });

  const addLinea = (catIdx: number) =>
    update(
      categorias.map((c, i) => (i === catIdx ? { ...c, lineas: [...c.lineas, { id: uid(), valores: {} }] } : c))
    );

  const removeLinea = (catIdx: number, id: string) =>
    update(
      categorias.map((c, i) =>
        i === catIdx ? { ...c, lineas: c.lineas.filter((l) => l.id !== id) } : c
      )
    );

  const setValor = (catIdx: number, id: string, col: ColumnaDef, raw: string) =>
    update(
      categorias.map((c, i) => {
        if (i !== catIdx) return c;
        const lineas = c.lineas.map((l) => {
          if (l.id !== id) return l;
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
        return { ...c, lineas };
      })
    );

  return (
    <div className="space-y-4">
      {/* Datos del parte (cabecera) */}
      {cabecera.length > 0 && (
        <div className="rounded-2xl border-2 border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-muted px-4 py-2.5 border-b-2 border-border">
            <h2 className="text-sm font-semibold text-foreground">Datos del parte</h2>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 bg-muted-foreground/30 p-1">
            {cabecera.map((c) => (
              <div key={c.key} className="bg-card p-4">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{c.label}</label>
                {c.tipo === "turno" ? (
                  <div className="flex gap-2">
                    {(["Día", "Noche"] as const).map((op) => {
                      const activo = (data.cabecera?.[c.key] ?? "") === op;
                      const Icono = op === "Día" ? Sun : Moon;
                      return (
                        <button
                          key={op}
                          type="button"
                          disabled={readOnly}
                          onClick={() => setCabecera(c.key, op)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                            activo
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icono size={15} /> {op}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type={c.tipo === "fecha" ? "date" : "text"}
                    disabled={readOnly}
                    value={data.cabecera?.[c.key] ?? ""}
                    onChange={(e) => setCabecera(c.key, e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                    placeholder={c.label}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {categorias.map((cat, catIdx) => (
        <div key={cat.nombre} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Cabecera de categoría */}
          <div className="bg-primary text-primary-foreground px-4 py-2.5 font-semibold text-sm border-b-2 border-primary-foreground/25">
            {cat.nombre}
          </div>

          {/* Tabla de líneas (escritorio) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="tbl-head">
                  {dataCols.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep first:border-l-0">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {cat.lineas.map((l, i) => (
                  <tr key={l.id} className={i % 2 ? "bg-muted/30" : "bg-card"}>
                    {dataCols.map((c) => (
                      <td key={c.key} className="px-1.5 py-1.5 border-t border-l-2 border-border first:border-l-0 text-center">
                        <input
                          type={c.tipo === "text" ? "text" : "number"}
                          min={c.tipo === "text" ? undefined : 0}
                          inputMode={c.tipo === "text" ? undefined : "numeric"}
                          disabled={readOnly}
                          value={l.valores?.[c.key] ?? ""}
                          onChange={(e) => setValor(catIdx, l.id, c, e.target.value)}
                          className={`no-spinner ${c.tipo === "text" ? "w-full min-w-[120px]" : "w-20"} text-center rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60`}
                          placeholder={c.tipo === "text" ? "—" : "0"}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 border-t border-border text-center">
                      {!readOnly && cat.lineas.length > 1 && (
                        <button
                          onClick={() => removeLinea(catIdx, l.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Quitar línea"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Líneas (móvil): tarjeta por línea */}
          <div className="lg:hidden divide-y divide-border">
            {cat.lineas.map((l, i) => (
              <div key={l.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Línea {i + 1}</span>
                  {!readOnly && cat.lineas.length > 1 && (
                    <button
                      onClick={() => removeLinea(catIdx, l.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Quitar línea"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {dataCols.map((c) => (
                    <div key={c.key} className={c.key === "observaciones" ? "col-span-2" : ""}>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{c.label}</label>
                      <input
                        type={c.tipo === "text" ? "text" : "number"}
                        min={c.tipo === "text" ? undefined : 0}
                        inputMode={c.tipo === "text" ? undefined : "numeric"}
                        disabled={readOnly}
                        value={l.valores?.[c.key] ?? ""}
                        onChange={(e) => setValor(catIdx, l.id, c, e.target.value)}
                        className="no-spinner w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        placeholder={c.tipo === "text" ? "—" : "0"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Añadir línea a esta categoría */}
          {!readOnly && (
            <div className="p-3 border-t border-border">
              <button
                onClick={() => addLinea(catIdx)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus size={15} /> Añadir línea a {cat.nombre}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CategoriasForm;
