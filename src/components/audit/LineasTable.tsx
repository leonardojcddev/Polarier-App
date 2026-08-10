import { useMemo } from "react";

// -----------------------------------------------------------------------------
// Tipos de configuración (vienen de form_definitions.config)
// -----------------------------------------------------------------------------
export interface ColumnaDef {
  key: string;
  label: string;
  tipo?: "num" | "text" | "fecha";
  calc?: "total_pmr"; // columna calculada automáticamente
}
export interface GrupoDef {
  label?: string; // cabecera superior que agrupa varias columnas
  cols: ColumnaDef[];
}
export interface CampoCabecera {
  key: string;
  label: string;
  tipo?: "text" | "fecha";
}

export interface Linea {
  id: string;
  prenda: string; // fija (catálogo), no editable al rellenar
  valores: Record<string, number | string>;
  observaciones?: string;
}

export type LineasData = {
  lineas: Linea[];
  cabecera?: Record<string, string>;
};

// Aplana los grupos en una lista de columnas.
export const flattenColumnas = (grupos: GrupoDef[]): ColumnaDef[] =>
  grupos.flatMap((g) => g.cols);

// Total P+M+R de una línea (Producción + manchas m_* + Roturas).
export const totalPMR = (valores: Record<string, number | string>): number => {
  const p = Number(valores.produccion) || 0;
  const m =
    (Number(valores.m_rosa) || 0) +
    (Number(valores.m_negra) || 0) +
    (Number(valores.m_oxido) || 0) +
    (Number(valores.m_varias) || 0);
  const r = Number(valores.roturas) || 0;
  return p + m + r;
};

const valorColumna = (linea: Linea, col: ColumnaDef): number | string => {
  if (col.calc === "total_pmr") return totalPMR(linea.valores);
  return linea.valores?.[col.key] ?? "";
};

export interface LineasTotals {
  porColumna: Record<string, number>;
}

export const computeLineasTotals = (data: LineasData, grupos: GrupoDef[]): LineasTotals => {
  const cols = flattenColumnas(grupos);
  const porColumna: Record<string, number> = {};
  for (const col of cols) {
    if (col.tipo === "text" || col.tipo === "fecha") continue; // no se suman
    let sum = 0;
    for (const l of data.lineas ?? []) {
      sum += col.calc === "total_pmr" ? totalPMR(l.valores) : Number(l.valores?.[col.key]) || 0;
    }
    porColumna[col.key] = sum;
  }
  return { porColumna };
};

// -----------------------------------------------------------------------------
interface Props {
  grupos: GrupoDef[];
  cabecera?: CampoCabecera[];
  conObservaciones?: boolean;
  data: LineasData;
  onChange: (data: LineasData) => void;
  readOnly?: boolean;
}

/**
 * Tabla de líneas "por prenda" para Producción y Cuadrador. Las prendas son un
 * catálogo cerrado precargado (no editables ni añadibles): solo se rellenan sus
 * valores. Soporta columnas agrupadas (cabecera 2 niveles), columna calculada
 * (Total P+M+R), campos de cabecera y observaciones. Estilo Polarier; en móvil
 * se transforma en tarjetas.
 */
const LineasTable = ({ grupos, cabecera = [], conObservaciones, data, onChange, readOnly }: Props) => {
  const lineas = data.lineas ?? [];
  const cols = useMemo(() => flattenColumnas(grupos), [grupos]);
  const totals = useMemo(() => computeLineasTotals(data, grupos), [data, grupos]);
  const hasGrupos = grupos.some((g) => g.label);

  const update = (next: Partial<LineasData>) => onChange({ ...data, lineas, ...next });

  const setObs = (id: string, observaciones: string) =>
    update({ lineas: lineas.map((l) => (l.id === id ? { ...l, observaciones } : l)) });

  const setCabecera = (key: string, val: string) =>
    update({ cabecera: { ...(data.cabecera || {}), [key]: val } });

  const setValor = (id: string, col: ColumnaDef, raw: string) =>
    update({
      lineas: lineas.map((l) => {
        if (l.id !== id) return l;
        const valores = { ...l.valores };
        if (raw === "") delete valores[col.key];
        else if (col.tipo === "text") valores[col.key] = raw;
        else {
          const v = Math.max(0, Math.floor(Number(raw)));
          if (Number.isNaN(v)) return l;
          valores[col.key] = v;
        }
        return { ...l, valores };
      }),
    });

  const colSpanTotal = cols.length + (conObservaciones ? 1 : 0) + 1; // + prenda

  return (
    <div className="space-y-4">
      {/* Cabecera de campos */}
      {cabecera.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          {cabecera.map((c) => (
            <div key={c.key}>
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
      )}

      {/* Tabla de líneas (tablet / escritorio) */}
      <div className="hidden lg:block overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Fila de grupos (2º nivel) solo si hay grupos con label */}
            {hasGrupos && (
              <tr className="tbl-head">
                <th rowSpan={2} className="sticky left-0 z-20 tbl-head text-left font-semibold px-4 py-2.5 min-w-[150px] rounded-tl-2xl align-bottom">
                  Prenda
                </th>
                {grupos.map((g, gi) =>
                  g.label ? (
                    <th key={gi} colSpan={g.cols.length} className="px-3 py-2 font-semibold text-center border-l-2 tbl-head-sep">
                      {g.label}
                    </th>
                  ) : (
                    <th key={gi} rowSpan={2} className="px-3 py-2.5 font-semibold text-center align-bottom min-w-[90px] border-l-2 tbl-head-sep">
                      {g.cols[0].label}
                    </th>
                  )
                )}
                {conObservaciones && <th rowSpan={2} className="px-3 py-2.5 font-semibold text-left align-bottom min-w-[150px] rounded-tr-2xl">Observaciones</th>}
                {!conObservaciones && <th rowSpan={2} className="w-0 rounded-tr-2xl" aria-hidden />}
              </tr>
            )}
            <tr className="tbl-head">
              {!hasGrupos && (
                <th className="sticky left-0 z-20 tbl-head text-left font-semibold px-4 py-3 min-w-[150px] rounded-tl-2xl">Prenda</th>
              )}
              {grupos.map((g, gi) =>
                g.label
                  ? g.cols.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-medium text-center text-xs min-w-[80px] border-l-2 tbl-head-sep">
                        {c.label}
                      </th>
                    ))
                  : !hasGrupos
                  ? (
                    <th key={gi} className="px-3 py-3 font-semibold text-center min-w-[90px] border-l-2 tbl-head-sep">{g.cols[0].label}</th>
                  )
                  : null
              )}
              {!hasGrupos && conObservaciones && <th className="px-3 py-3 font-semibold text-left min-w-[150px] rounded-tr-2xl">Observaciones</th>}
            </tr>
          </thead>

          <tbody>
            {lineas.length === 0 ? (
              <tr>
                <td colSpan={colSpanTotal} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No hay prendas configuradas para este formulario.
                </td>
              </tr>
            ) : (
              lineas.map((l, i) => (
                <tr key={l.id} className={`transition-colors ${i % 2 ? "bg-muted/30" : "bg-card"}`}>
                  <td className={`sticky left-0 z-10 px-4 py-2.5 border-t border-border font-medium text-foreground whitespace-nowrap ${i % 2 ? "bg-muted" : "bg-card"}`}>
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
                          onChange={(e) => setValor(l.id, c, e.target.value)}
                          className={`no-spinner ${c.tipo === "text" ? "w-20" : "w-16"} text-center rounded-lg border border-border bg-background px-1.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60`}
                          placeholder={c.tipo === "text" ? "—" : "0"}
                        />
                      )}
                    </td>
                  ))}
                  {conObservaciones && (
                    <td className="px-1.5 py-1.5 border-t border-border">
                      <input
                        disabled={readOnly}
                        value={l.observaciones ?? ""}
                        onChange={(e) => setObs(l.id, e.target.value)}
                        className="w-full min-w-[150px] rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        placeholder="—"
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>

          {lineas.length > 0 && (
            <tfoot>
              <tr className="bg-primary/90 text-primary-foreground font-semibold">
                <td className="sticky left-0 z-10 bg-primary px-4 py-3 rounded-bl-2xl">Total</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-3 text-center">
                    {c.tipo === "text" || c.tipo === "fecha" ? "" : totals.porColumna[c.key] || 0}
                  </td>
                ))}
                {conObservaciones && <td className="rounded-br-2xl" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Vista de tarjetas (móvil): una tarjeta por prenda */}
      <div className="lg:hidden space-y-3">
        {lineas.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No hay prendas configuradas para este formulario.
          </p>
        ) : (
          lineas.map((l) => (
            <div key={l.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="bg-primary text-primary-foreground px-4 py-2.5 font-semibold text-sm">
                {l.prenda}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4">
                {cols.map((c) => (
                  <div key={c.key} className={c.calc ? "col-span-2" : ""}>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">{c.label}</label>
                    {c.calc ? (
                      <div className="rounded-lg bg-accent/15 px-3 py-2 text-sm font-semibold text-primary">
                        {totalPMR(l.valores)}
                      </div>
                    ) : (
                      <input
                        type={c.tipo === "text" ? "text" : "number"}
                        min={c.tipo === "text" ? undefined : 0}
                        inputMode={c.tipo === "text" ? undefined : "numeric"}
                        disabled={readOnly}
                        value={valorColumna(l, c) as string | number}
                        onChange={(e) => setValor(l.id, c, e.target.value)}
                        className="no-spinner w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        placeholder={c.tipo === "text" ? "—" : "0"}
                      />
                    )}
                  </div>
                ))}
                {conObservaciones && (
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Observaciones</label>
                    <input
                      disabled={readOnly}
                      value={l.observaciones ?? ""}
                      onChange={(e) => setObs(l.id, e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                      placeholder="—"
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LineasTable;
