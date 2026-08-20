import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, FileText, Download, CheckCircle2, Circle, ChevronRight, ArrowLeft, Sparkles, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/context/RoleContext";
import {
  getSubmissionsByMonth,
  getFormDefinitions,
  getPrendas,
  getUbicaciones,
  getMonthlyReport,
  getMonthlyReportPdfUrl,
  FormSubmission,
  FormDefinition,
  MonthlyReport,
} from "@/services/audit";
import { buildInforme, Informe } from "@/lib/informe";
import InformePreview from "@/components/audit/InformePreview";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const hoyStr = () => new Date().toISOString().slice(0, 10);

// Catálogo de pesos por prenda (fallback) para el informe del Cuadrador.
const PRENDAS_PESO_DEFAULT = [
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

const AuditMonth = () => {
  const navigate = useNavigate();
  const { anioMes = "" } = useParams(); // "YYYY-MM"
  const { activeHotel, loading: roleLoading } = useRole();
  const [items, setItems] = useState<FormSubmission[]>([]);
  const [defs, setDefs] = useState<Record<string, FormDefinition>>({});
  const [reporte, setReporte] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [informeOpen, setInformeOpen] = useState(false);
  const [informeLoading, setInformeLoading] = useState(false);
  const [informeFecha, setInformeFecha] = useState<string>("");

  const [anio, mes] = anioMes.split("-").map(Number);
  const tituloMes = mes >= 1 && mes <= 12 ? `${NOMBRES_MES[mes - 1]} ${anio}` : anioMes;

  useEffect(() => {
    if (!activeHotel || !anio || !mes) return;
    (async () => {
      setLoading(true);
      try {
        const [subs, definitions, monthly] = await Promise.all([
          getSubmissionsByMonth(activeHotel.id, anio, mes),
          getFormDefinitions(activeHotel.id),
          getMonthlyReport(activeHotel.id, anio, mes),
        ]);
        setItems(subs);
        setDefs(Object.fromEntries(definitions.map((d) => [d.id, d])));
        setReporte(monthly);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeHotel?.id, anio, mes]);

  // Abre la vista previa del informe para una submission (genera el PDF en cliente).
  const verInforme = async (s: FormSubmission) => {
    const def = defs[s.form_definition_id];
    if (!def || !activeHotel) return;
    setInformeOpen(true);
    setInformeLoading(true);
    setInforme(null);
    setInformeFecha(s.fecha);
    try {
      const [prendas, ubicaciones] =
        def.tipo === "lenceria"
          ? await Promise.all([getPrendas(activeHotel.id), getUbicaciones(activeHotel.id)])
          : [[], []];
      const prendasPeso =
        (def.config?.prendas_peso as typeof PRENDAS_PESO_DEFAULT) ?? PRENDAS_PESO_DEFAULT;
      setInforme(
        buildInforme({
          submission: s,
          definition: def,
          hotel: activeHotel.nombre,
          polo: activeHotel.polo?.nombre ?? undefined,
          prendas,
          ubicaciones,
          prendasPeso,
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el informe");
      setInformeOpen(false);
    } finally {
      setInformeLoading(false);
    }
  };

  // Abre el PDF del informe mensual (URL firmada del bucket privado).
  const abrirPdfMensual = async () => {
    if (!reporte?.pdf_url) return;
    setPdfLoading(true);
    try {
      const url = await getMonthlyReportPdfUrl(reporte.pdf_url);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir el informe");
    } finally {
      setPdfLoading(false);
    }
  };

  const fmtFecha = (f: string) =>
    new Date(f + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/auditoria/historico")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Volver a los meses
        </button>
        <h1 className="text-xl font-semibold text-foreground mb-6 capitalize">{tituloMes}</h1>

        {/* Informe de comportamiento mensual (lo genera la routine el día 1). */}
        {reporte && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Informe de comportamiento mensual
              </h2>
              {reporte.estado === "listo" && reporte.pdf_url && (
                <button
                  onClick={abrirPdfMensual}
                  disabled={pdfLoading}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  Abrir PDF
                </button>
              )}
            </div>

            {reporte.estado === "listo" ? (
              <div className="space-y-2 text-sm text-foreground/90">
                {typeof (reporte.resumen as { analisis?: unknown })?.analisis === "string" && (
                  <p className="whitespace-pre-line">{(reporte.resumen as { analisis: string }).analisis}</p>
                )}
                {Array.isArray((reporte.resumen as { valoraciones?: unknown })?.valoraciones) && (
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {((reporte.resumen as { valoraciones: string[] }).valoraciones).map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : reporte.estado === "error" ? (
              <p className="text-sm text-destructive">Hubo un error al generar el informe de este mes.</p>
            ) : (
              <p className="text-sm text-muted-foreground">El informe de este mes se está generando…</p>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay informes en este mes.</p>
        ) : (
          <div className="space-y-3">
            {items.map((s) => {
              const def = defs[s.form_definition_id];
              const total = (s.totales as { general?: number })?.general ?? null;
              const esHoy = s.fecha === hoyStr();
              const abrir = () =>
                navigate(
                  esHoy
                    ? `/auditoria/formulario/${s.form_definition_id}`
                    : `/auditoria/formulario/${s.form_definition_id}?fecha=${s.fecha}`
                );
              return (
                <div
                  key={s.id}
                  onClick={abrir}
                  role="button"
                  className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-secondary hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {def?.nombre ?? "Formulario"}
                          {esHoy && <span className="ml-2 text-[10px] uppercase text-secondary font-medium">Hoy</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtFecha(s.fecha)}
                          {total !== null && <> · Total: <span className="font-medium text-foreground">{total}</span></>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.estado === "completado" ? (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 size={14} /> Completado
                        </span>
                      ) : (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-amber-600">
                          <Circle size={14} /> Borrador
                        </span>
                      )}
                      {/* Ver informe (vista previa + descarga PDF, generado en cliente) */}
                      <button
                        title="Ver informe / Descargar PDF"
                        onClick={(e) => { e.stopPropagation(); verInforme(s); }}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Download size={16} />
                      </button>
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {informeOpen && (
        <InformePreview
          informe={informe}
          fecha={informeFecha}
          loading={informeLoading}
          onClose={() => setInformeOpen(false)}
        />
      )}
    </div>
  );
};

export default AuditMonth;
