import { useMemo } from "react";
import { Plus, Trash2, Sun, Moon } from "lucide-react";

export interface CampoCabecera {
  key: string;
  label: string;
  tipo?: "text" | "fecha" | "turno";
}

// Prenda del catálogo del cuadrador, con su peso (kg por prenda).
export interface PrendaPeso {
  nombre: string;
  peso: number;
}

// -----------------------------------------------------------------------------
// Modelo del Cuadrador Lavatín (tabla de líneas dinámicas):
//   { cabecera?, lineas: [{ id, prenda, valores:{ vale, declaracion, pendiente, observaciones } }] }
//
// Columnas calculadas (no se guardan, se derivan en vivo):
//   produccion_prenda = declaracion − pendiente   (mínimo 0)
//   produccion_kg      = produccion_prenda × peso(prenda)
// -----------------------------------------------------------------------------
export interface CuadradorLinea {
  id: string;
  prenda: string;
  valores: Record<string, number | string>;
}
export type CuadradorData = {
  cabecera?: Record<string, string>;
  lineas: CuadradorLinea[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const nuevaLinea = (prenda = ""): CuadradorLinea => ({ id: uid(), prenda, valores: {} });

// Arranca con una línea por cada prenda del catálogo (filas por defecto). El
// usuario puede añadir más líneas (p. ej. otro vale de la misma prenda) o quitarlas.
export const initCuadrador = (
  cabecera: Record<string, string> = {},
  prendas: PrendaPeso[] = []
): CuadradorData => ({
  cabecera,
  lineas: prendas.length > 0 ? prendas.map((p) => nuevaLinea(p.nombre)) : [nuevaLinea()],
});

// Producción por prenda de una línea = declaración − pendiente (nunca negativa).
export const prendaProduccion = (l: CuadradorLinea): number => {
  const dec = Number(l.valores?.declaracion) || 0;
  const pen = Number(l.valores?.pendiente) || 0;
  return Math.max(0, dec - pen);
};

const pesoDe = (prendas: PrendaPeso[], nombre: string): number =>
  prendas.find((p) => p.nombre === nombre)?.peso ?? 0;

// Producción en kg de una línea = producción prenda × peso de la prenda.
export const prendaKg = (l: CuadradorLinea, prendas: PrendaPeso[]): number =>
  prendaProduccion(l) * pesoDe(prendas, l.prenda);

export interface CuadradorTotals {
  prenda: number;
  kg: number;
  declaracion: number;
  pendiente: number;
}

export const computeCuadradorTotals = (
  data: CuadradorData,
  prendas: PrendaPeso[]
): CuadradorTotals => {
  let prenda = 0,
    kg = 0,
    declaracion = 0,
    pendiente = 0;
  for (const l of data.lineas ?? []) {
    declaracion += Number(l.valores?.declaracion) || 0;
    pendiente += Number(l.valores?.pendiente) || 0;
    prenda += prendaProduccion(l);
    kg += prendaKg(l, prendas);
  }
  return { prenda, kg, declaracion, pendiente };
};

const fmtKg = (n: number): string =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  prendas: PrendaPeso[];
  cabecera?: CampoCabecera[];
  data: CuadradorData;
  onChange: (data: CuadradorData) => void;
  readOnly?: boolean;
}

const CuadradorForm = ({ prendas, cabecera = [], data, onChange, readOnly }: Props) => {
  const lineas = data.lineas ?? [];
  const totals = useMemo(() => computeCuadradorTotals(data, prendas), [data, prendas]);

  const update = (lineas: CuadradorLinea[]) => onChange({ ...data, lineas });

  const setCabecera = (key: string, val: string) =>
    onChange({ ...data, lineas, cabecera: { ...(data.cabecera || {}), [key]: val } });

  const addLinea = () => update([...lineas, nuevaLinea()]);

  const removeLinea = (id: string) => update(lineas.filter((l) => l.id !== id));

  const setPrenda = (id: string, prenda: string) =>
    update(lineas.map((l) => (l.id === id ? { ...l, prenda } : l)));

  const setValor = (id: string, key: string, tipo: "num" | "text", raw: string) =>
    update(
      lineas.map((l) => {
        if (l.id !== id) return l;
        const valores = { ...l.valores };
        if (raw === "") delete valores[key];
        else if (tipo === "text") valores[key] = raw;
        else {
          const n = Math.max(0, Math.floor(Number(raw)));
          if (Number.isNaN(n)) return l;
          valores[key] = n;
        }
        return { ...l, valores };
      })
    );

  const selectPrenda = (l: CuadradorLinea, extraClass = "") => (
    <select
      disabled={readOnly}
      value={l.prenda}
      onChange={(e) => setPrenda(l.id, e.target.value)}
      className={`rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${extraClass}`}
    >
      <option value="">— Prenda —</option>
      {prendas.map((p) => (
        <option key={p.nombre} value={p.nombre}>
          {p.nombre}
        </option>
      ))}
    </select>
  );

  const numInput = (l: CuadradorLinea, key: string, extraClass = "") => (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      disabled={readOnly}
      value={l.valores?.[key] ?? ""}
      onChange={(e) => setValor(l.id, key, "num", e.target.value)}
      className={`no-spinner text-center rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${extraClass}`}
      placeholder="0"
    />
  );

  const textInput = (l: CuadradorLinea, key: string, extraClass = "") => (
    <input
      type="text"
      disabled={readOnly}
      value={l.valores?.[key] ?? ""}
      onChange={(e) => setValor(l.id, key, "text", e.target.value)}
      className={`rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${extraClass}`}
      placeholder="—"
    />
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

      {/* Tabla (escritorio) */}
      <div className="hidden lg:block rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tbl-head">
                <th className="px-3 py-2.5 font-medium text-center text-xs">Vale</th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep">Prenda</th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep">
                  Cant. Declaración<br />Jurada de Sucio
                </th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep">Pendiente</th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep bg-primary/10">
                  Producción<br />(prenda)
                </th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep bg-primary/10">
                  Producción<br />(kg)
                </th>
                <th className="px-3 py-2.5 font-medium text-center text-xs border-l-2 tbl-head-sep">Observaciones</th>
                {!readOnly && <th className="px-2 py-2.5 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.id} className={i % 2 ? "bg-muted/30" : "bg-card"}>
                  <td className="px-1.5 py-1.5 border-t border-border text-center">
                    {textInput(l, "vale", "w-24 text-center")}
                  </td>
                  <td className="px-1.5 py-1.5 border-t border-l-2 border-border text-center">
                    {selectPrenda(l, "w-full min-w-[150px]")}
                  </td>
                  <td className="px-1.5 py-1.5 border-t border-l-2 border-border text-center">
                    {numInput(l, "declaracion", "w-24")}
                  </td>
                  <td className="px-1.5 py-1.5 border-t border-l-2 border-border text-center">
                    {numInput(l, "pendiente", "w-24")}
                  </td>
                  <td className="px-3 py-1.5 border-t border-l-2 border-border text-center font-semibold text-primary bg-primary/5">
                    {prendaProduccion(l)}
                  </td>
                  <td className="px-3 py-1.5 border-t border-l-2 border-border text-center font-semibold text-primary bg-primary/5">
                    {fmtKg(prendaKg(l, prendas))}
                  </td>
                  <td className="px-1.5 py-1.5 border-t border-l-2 border-border text-center">
                    {textInput(l, "observaciones", "w-full min-w-[140px]")}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-1.5 border-t border-border text-center">
                      {lineas.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLinea(l.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Quitar línea"
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
                <td className="px-3 py-3" colSpan={2}>Total</td>
                <td className="px-3 py-3 text-center border-l-2 border-primary-foreground/20">{totals.declaracion}</td>
                <td className="px-3 py-3 text-center border-l-2 border-primary-foreground/20">{totals.pendiente}</td>
                <td className="px-3 py-3 text-center border-l-2 border-primary-foreground/20 bg-accent text-accent-foreground">{totals.prenda}</td>
                <td className="px-3 py-3 text-center border-l-2 border-primary-foreground/20 bg-accent text-accent-foreground">{fmtKg(totals.kg)}</td>
                <td className="px-3 py-3 border-l-2 border-primary-foreground/20"></td>
                {!readOnly && <td className="px-2 py-3"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Líneas (móvil): tarjeta por línea */}
      <div className="lg:hidden space-y-3">
        {lineas.map((l, i) => (
          <div key={l.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between bg-muted px-4 py-2 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Línea {i + 1}</span>
              {!readOnly && lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLinea(l.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Quitar línea"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Vale</label>
                {textInput(l, "vale", "w-full")}
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Prenda</label>
                {selectPrenda(l, "w-full")}
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Cant. Dec. Jurada Sucio</label>
                {numInput(l, "declaracion", "w-full")}
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Pendiente</label>
                {numInput(l, "pendiente", "w-full")}
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-[11px] font-medium text-muted-foreground block">Producción (prenda)</span>
                <span className="text-base font-semibold text-primary">{prendaProduccion(l)}</span>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-[11px] font-medium text-muted-foreground block">Producción (kg)</span>
                <span className="text-base font-semibold text-primary">{fmtKg(prendaKg(l, prendas))}</span>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Observaciones</label>
                {textInput(l, "observaciones", "w-full")}
              </div>
            </div>
          </div>
        ))}
        {/* Totales (resumen móvil) */}
        <div className="rounded-2xl border border-border bg-primary/90 text-primary-foreground shadow-sm p-4">
          <p className="text-sm font-semibold mb-2">Totales</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-primary-foreground/80">Declaración</span><span className="font-semibold">{totals.declaracion}</span></div>
            <div className="flex justify-between"><span className="text-primary-foreground/80">Pendiente</span><span className="font-semibold">{totals.pendiente}</span></div>
            <div className="flex justify-between"><span className="text-primary-foreground/80">Producción (prenda)</span><span className="font-bold">{totals.prenda}</span></div>
            <div className="flex justify-between"><span className="text-primary-foreground/80">Producción (kg)</span><span className="font-bold">{fmtKg(totals.kg)}</span></div>
          </div>
        </div>
      </div>

      {/* Añadir línea */}
      {!readOnly && (
        <button
          type="button"
          onClick={addLinea}
          className="inline-flex w-full lg:w-auto items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" /> Añadir línea
        </button>
      )}
    </div>
  );
};

export default CuadradorForm;
