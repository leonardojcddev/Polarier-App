import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save, CheckCircle2, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/context/RoleContext";
import { buildInforme } from "@/lib/informe";
import InformePreview from "@/components/audit/InformePreview";
import type { FormSubmission } from "@/services/audit";
import {
  getFormDefinitions,
  getSubmission,
  saveSubmission,
  getPrendas,
  getUbicaciones,
  FormDefinition,
  Prenda,
  Ubicacion,
} from "@/services/audit";
import LenceriaMatrix, { MatrixData, computeTotals } from "@/components/audit/LenceriaMatrix";
import LineasTable, {
  LineasData,
  GrupoDef,
  CampoCabecera,
  computeLineasTotals,
} from "@/components/audit/LineasTable";
import ValesForm, { ValesData, nuevoVale, computeValesTotals } from "@/components/audit/ValesForm";
import CategoriasForm, {
  CategoriasData,
  initCategorias,
  computeCategoriasTotals,
} from "@/components/audit/CategoriasForm";
import CuadradorForm, {
  CuadradorData,
  PrendaPeso,
  initCuadrador,
  computeCuadradorTotals,
} from "@/components/audit/CuadradorForm";
import { ColumnaDef } from "@/components/audit/LineasTable";

// Fallback del catálogo de prendas con peso (kg/prenda) si la definición no lo
// trae en config.prendas_peso. Pesos de pesos_prendas.jpeg.
const PRENDAS_PESO_DEFAULT: PrendaPeso[] = [
  { nombre: "Sábana Personal", peso: 0.75 },
  { nombre: "Sábana King", peso: 1.02 },
  { nombre: "Funda de Almohada", peso: 0.17 },
  { nombre: "Toalla Alfombra", peso: 0.25 },
  { nombre: "Toalla Baño", peso: 0.61 },
  { nombre: "Toalla Cara", peso: 0.27 },
  { nombre: "Toalla Facial", peso: 0.06 },
  { nombre: "Toalla Piscina", peso: 0.94 },
  { nombre: "Cubremantel", peso: 0.75 },
  { nombre: "Mantel", peso: 0.39 },
  { nombre: "Servilleta", peso: 0.08 },
];

const uid = () => Math.random().toString(36).slice(2, 10);

const hoyStr = () => new Date().toISOString().slice(0, 10);

const AuditForm = () => {
  const { defId } = useParams<{ defId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeHotel } = useRole();

  // Fecha objetivo: la del query (?fecha=) o hoy. Solo se puede editar la de hoy.
  const fecha = searchParams.get("fecha") || hoyStr();
  const readOnly = fecha !== hoyStr();

  const [def, setDef] = useState<FormDefinition | null>(null);
  const [prendas, setPrendas] = useState<Prenda[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [informeOpen, setInformeOpen] = useState(false);

  useEffect(() => {
    if (!activeHotel || !defId) return;
    (async () => {
      setLoading(true);
      try {
        const defs = await getFormDefinitions(activeHotel.id);
        const found = defs.find((d) => d.id === defId) ?? null;
        setDef(found);

        const [pr, ub, sub] = await Promise.all([
          getPrendas(activeHotel.id),
          getUbicaciones(activeHotel.id),
          getSubmission(defId, fecha),
        ]);
        setPrendas(pr);

        // Ubicaciones añadidas manualmente por el supervisor se guardan dentro de
        // data._ubicaciones (la BD solo tiene las fijas). Las fusionamos al cargar.
        const extra = (sub?.data?._ubicaciones as Ubicacion[]) ?? [];
        setUbicaciones([...ub, ...extra]);

        // Datos existentes → cargar. Formulario nuevo → precargar según layout.
        if (sub?.data && Object.keys(sub.data).length > 0) {
          setData(sub.data);
        } else if (found) {
          const layout = found.config?.layout as string | undefined;
          const cabeceraInicial: Record<string, string> = {};
          const campos = (found.config?.cabecera as CampoCabecera[]) ?? [];
          for (const c of campos) if (c.tipo === "fecha") cabeceraInicial[c.key] = fecha;

          if (layout === "vales") {
            const prendasCfg = (found.config?.prendas as string[]) ?? [];
            setData({ cabecera: cabeceraInicial, vales: [nuevoVale(prendasCfg, "Vale 1")] } as ValesData);
          } else if (layout === "categorias") {
            const cats = (found.config?.categorias as string[]) ?? [];
            setData(initCategorias(cats, cabeceraInicial));
          } else if (layout === "cuadrador") {
            const pp = (found.config?.prendas_peso as PrendaPeso[]) ?? PRENDAS_PESO_DEFAULT;
            setData(initCuadrador(cabeceraInicial, pp));
          } else if (layout === "lineas") {
            const precargadas = (found.config?.prendas_precargadas as string[]) ?? [];
            setData({
              cabecera: cabeceraInicial,
              lineas: precargadas.map((p) => ({ id: uid(), prenda: p, valores: {} })),
            } as LineasData);
          } else {
            setData({});
          }
        } else {
          setData({});
        }
      } catch (err: any) {
        toast.error(err.message || "Error cargando el formulario");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeHotel?.id, defId, fecha]);

  const grupos = useMemo<GrupoDef[]>(
    () => ((def?.config?.grupos as GrupoDef[]) ?? []),
    [def]
  );
  const cabecera = useMemo<CampoCabecera[]>(
    () => ((def?.config?.cabecera as CampoCabecera[]) ?? []),
    [def]
  );
  const layout = def?.config?.layout as string | undefined;

  // Catálogo de prendas con peso para el Cuadrador (config o fallback).
  const prendasPeso = useMemo<PrendaPeso[]>(
    () => (def?.config?.prendas_peso as PrendaPeso[]) ?? PRENDAS_PESO_DEFAULT,
    [def]
  );

  const calcularTotales = (): Record<string, unknown> => {
    if (!def) return {};
    if (def.tipo === "lenceria") {
      return computeTotals(data as MatrixData, ubicaciones, prendas) as unknown as Record<string, unknown>;
    }
    if (layout === "vales") {
      return computeValesTotals(data as ValesData, grupos) as unknown as Record<string, unknown>;
    }
    if (layout === "categorias") {
      const columnas = (def.config?.columnas as ColumnaDef[]) ?? [];
      return computeCategoriasTotals(data as CategoriasData, columnas) as unknown as Record<string, unknown>;
    }
    if (layout === "cuadrador") {
      return computeCuadradorTotals(data as CuadradorData, prendasPeso) as unknown as Record<string, unknown>;
    }
    return computeLineasTotals(data as LineasData, grupos) as unknown as Record<string, unknown>;
  };

  // Informe a partir del estado actual en pantalla (refleja ediciones sin guardar).
  const informeActual = useMemo(() => {
    if (!def || !activeHotel || !informeOpen) return null;
    const submission = {
      fecha,
      estado: readOnly ? "completado" : "borrador",
      data,
      totales: calcularTotales(),
    } as unknown as FormSubmission;
    return buildInforme({
      submission,
      definition: def,
      hotel: activeHotel.nombre,
      polo: activeHotel.polo?.nombre ?? undefined,
      prendas,
      ubicaciones,
      prendasPeso,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [informeOpen, def, activeHotel, data, prendas, ubicaciones, prendasPeso, fecha, readOnly]);

  const persist = async (estado: "borrador" | "completado") => {
    if (!activeHotel || !def) return;
    setSaving(true);
    try {
      await saveSubmission({
        hotelId: activeHotel.id,
        formDefinitionId: def.id,
        fecha,
        estado,
        data,
        totales: calcularTotales(),
      });
      toast.success(estado === "completado" ? "Formulario completado" : "Borrador guardado");
      if (estado === "completado") navigate("/auditoria");
    } catch (err: any) {
      toast.error(err.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (!def) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Formulario no encontrado.</p>
      </div>
    );
  }

  const fechaLabel = new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Volver
        </button>

        <div className="mb-5 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold">{def.nombre}</h1>
              <p className="text-sm text-primary-foreground/80">
                {activeHotel?.nombre} · {fechaLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {readOnly && (
                <span className="flex items-center gap-1.5 text-xs bg-primary-foreground/15 px-3 py-1.5 rounded-full">
                  <Eye size={14} /> Solo lectura
                </span>
              )}
              <button
                onClick={() => setInformeOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 px-3 py-1.5 rounded-full transition-colors"
              >
                <FileText size={14} /> Ver informe
              </button>
            </div>
          </div>
        </div>

        {def.tipo === "lenceria" ? (
          <LenceriaMatrix
            ubicaciones={ubicaciones}
            prendas={prendas}
            data={data as MatrixData}
            onChange={setData}
            readOnly={readOnly}
            onAddUbicacion={() => {
              const nueva = { id: uid(), nombre: "", orden: -1 };
              setUbicaciones((prev) => {
                const next = [...prev, nueva];
                setData((d: Record<string, unknown>) => ({ ...d, _ubicaciones: next.filter((u) => u.orden < 0) }));
                return next;
              });
            }}
            onRenameUbicacion={(id, nombre) =>
              setUbicaciones((prev) => {
                const next = prev.map((u) => (u.id === id ? { ...u, nombre } : u));
                setData((d: Record<string, unknown>) => ({ ...d, _ubicaciones: next.filter((u) => u.orden < 0) }));
                return next;
              })
            }
            onRemoveUbicacion={(id) =>
              setUbicaciones((prev) => {
                const next = prev.filter((u) => u.id !== id);
                setData((d: Record<string, unknown>) => {
                  const { [id]: _drop, ...rest } = d as Record<string, unknown>;
                  return { ...rest, _ubicaciones: next.filter((u) => u.orden < 0) };
                });
                return next;
              })
            }
          />
        ) : layout === "vales" ? (
          <ValesForm
            grupos={grupos}
            cabecera={cabecera}
            prendas={(def.config?.prendas as string[]) ?? []}
            data={(data as ValesData)?.vales ? (data as ValesData) : { vales: [] }}
            onChange={setData}
            readOnly={readOnly}
          />
        ) : layout === "categorias" ? (
          <CategoriasForm
            columnas={(def.config?.columnas as ColumnaDef[]) ?? []}
            cabecera={cabecera}
            data={(data as CategoriasData)?.categorias ? (data as CategoriasData) : { categorias: [] }}
            onChange={setData}
            readOnly={readOnly}
          />
        ) : layout === "cuadrador" ? (
          <CuadradorForm
            prendas={prendasPeso}
            cabecera={cabecera}
            data={(data as CuadradorData)?.lineas ? (data as CuadradorData) : { lineas: [] }}
            onChange={setData}
            readOnly={readOnly}
          />
        ) : (
          <LineasTable
            grupos={grupos}
            cabecera={cabecera}
            conObservaciones={Boolean(def.config?.campo_observaciones)}
            data={(data as LineasData)?.lineas ? (data as LineasData) : { lineas: [] }}
            onChange={setData}
            readOnly={readOnly}
          />
        )}

        {!readOnly && (
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={() => persist("borrador")}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Save size={16} /> Guardar borrador
            </button>
            <button
              onClick={() => persist("completado")}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Completar
            </button>
          </div>
        )}
      </div>

      {informeOpen && (
        <InformePreview informe={informeActual} fecha={fecha} onClose={() => setInformeOpen(false)} />
      )}
    </div>
  );
};

export default AuditForm;
