import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, FileText, Download, CheckCircle2, Circle, ChevronRight, ArrowLeft, Sparkles, FileDown, Wand2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/context/RoleContext";
import {
  getSubmissionsByMonth,
  getFormDefinitions,
  getPrendas,
  getUbicaciones,
  getMonthlyReport,
  getMonthlyReportPdfUrl,
  solicitarInformeMensual,
  FormSubmission,
  FormDefinition,
  MonthlyReport,
} from "@/services/audit";
import { buildInforme, Informe } from "@/lib/informe";
import { buildInformeMensual, periodoInforme } from "@/lib/informeMensual";
import { descargarInformePdf } from "@/lib/informePdf";
import InformePreview from "@/components/audit/InformePreview";
import EnviarCorreoModal from "@/components/audit/EnviarCorreoModal";
import InformeMensualTexto from "@/components/audit/InformeMensualTexto";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const hoyStr = () => new Date().toISOString().slice(0, 10);

const SIN_INFORME = "Disponible cuando el informe del mes esté generado";

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
  const [pidiendo, setPidiendo] = useState(false);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [informeOpen, setInformeOpen] = useState(false);
  const [informeLoading, setInformeLoading] = useState(false);
  const [informeFecha, setInformeFecha] = useState<string>("");
  const [descargandoMensual, setDescargandoMensual] = useState(false);
  const [correoMensualOpen, setCorreoMensualOpen] = useState(false);

  const [anio, mes] = anioMes.split("-").map(Number);
  const tituloMes = mes >= 1 && mes <= 12 ? `${NOMBRES_MES[mes - 1]} ${anio}` : anioMes;

  // El informe mensual traducido a la misma estructura `Informe` que usan el PDF
  // y el envío por correo, para no duplicar ninguno de los dos.
  const informeMensual = useMemo(
    () =>
      reporte && activeHotel
        ? buildInformeMensual({
            reporte,
            hotel: activeHotel.nombre,
            polo: activeHotel.polo?.nombre ?? undefined,
          })
        : null,
    [reporte, activeHotel]
  );
  // Si el estado dice "listo" pero no hay texto que enviar, se sigue ofreciendo
  // generarlo en vez de dejar la caja sin ningún botón.
  const mensualListo = reporte?.estado === "listo" && informeMensual !== null;

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

  // La routine de Claude no escribe en la app: escribe en `monthly_reports`. Así
  // que mientras el informe esté en cola o generándose hay que ir preguntando.
  // Se corta a los 15 minutos para no dejar un intervalo colgado si algo falla.
  const enCurso = reporte?.estado === "pendiente" || reporte?.estado === "generando";
  useEffect(() => {
    if (!enCurso || !activeHotel || !anio || !mes) return;
    const limite = Date.now() + 15 * 60 * 1000;
    const id = setInterval(async () => {
      if (Date.now() > limite) {
        clearInterval(id);
        return;
      }
      try {
        const r = await getMonthlyReport(activeHotel.id, anio, mes);
        if (r) setReporte(r);
      } catch {
        /* si falla una consulta, se reintenta en el siguiente tick */
      }
    }, 15000);
    return () => clearInterval(id);
  }, [enCurso, activeHotel?.id, anio, mes]);

  // Pide el informe del mes: encola la solicitud y despierta a la routine.
  const pedirInforme = async () => {
    if (!activeHotel || !anio || !mes) return;
    setPidiendo(true);
    try {
      const { reporte: r, disparada } = await solicitarInformeMensual(activeHotel.id, anio, mes);
      setReporte(r);
      toast.success(
        disparada
          ? "Informe solicitado. Tarda un par de minutos en escribirse."
          : "Informe encolado. Se generará en la próxima pasada de la routine."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo solicitar el informe");
    } finally {
      setPidiendo(false);
    }
  };

  // Descarga el informe mensual como PDF, generado en el cliente igual que el
  // de los partes diarios (no depende de `pdf_url` ni de n8n).
  const descargarMensual = async () => {
    if (!informeMensual || !reporte) return;
    setDescargandoMensual(true);
    try {
      await descargarInformePdf(informeMensual, periodoInforme(reporte));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF");
    } finally {
      setDescargandoMensual(false);
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

        {/* Informe de comportamiento mensual: lo redacta la routine de Claude en la
            nube, el día 1 de cada mes o cuando se pide desde aquí. */}
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles size={16} className="text-primary" /> Informe de comportamiento mensual
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {reporte?.estado === "listo" && reporte.pdf_url && (
                <button
                  onClick={abrirPdfMensual}
                  disabled={pdfLoading}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  Abrir PDF
                </button>
              )}
              {/* Los tres botones están siempre a la vista; descargar y enviar
                  se activan cuando hay un informe redactado que mandar. */}
              {!enCurso && (
                <>
                  <button
                    onClick={pedirInforme}
                    disabled={pidiendo || items.length === 0}
                    title={
                      items.length === 0
                        ? "Este mes no tiene ningún parte que analizar"
                        : undefined
                    }
                    className="flex items-center gap-1.5 text-xs font-medium rounded-lg border border-primary/40 text-primary px-3 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    {pidiendo ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {reporte?.estado === "listo" ? "Regenerar" : "Generar informe"}
                  </button>
                  <button
                    onClick={descargarMensual}
                    disabled={!mensualListo || descargandoMensual}
                    title={mensualListo ? undefined : SIN_INFORME}
                    className="flex items-center gap-1.5 text-xs font-medium rounded-lg border border-primary/40 text-primary px-3 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    {descargandoMensual ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Descargar
                  </button>
                  <button
                    onClick={() => setCorreoMensualOpen(true)}
                    disabled={!mensualListo}
                    title={mensualListo ? undefined : SIN_INFORME}
                    className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:hover:opacity-50"
                  >
                    <Mail size={14} />
                    Enviar por correo
                  </button>
                </>
              )}
            </div>
          </div>

          {!reporte ? (
            <p className="text-sm text-muted-foreground">
              Este mes todavía no tiene informe. Genéralo cuando quieras: se escribe a partir
              de los partes diarios del mes.
            </p>
          ) : reporte.estado === "listo" ? (
            informeMensual ? (
              <InformeMensualTexto informe={informeMensual} />
            ) : (
              <p className="text-sm text-muted-foreground">
                El informe consta como generado, pero no tiene texto. Vuelve a generarlo.
              </p>
            )
          ) : reporte.estado === "error" ? (
            <p className="text-sm text-destructive">
              Hubo un error al generar el informe de este mes. Puedes volver a pedirlo.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Redactando el informe… suele tardar un par de minutos.
            </p>
          )}
        </div>

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

      {correoMensualOpen && informeMensual && reporte && (
        <EnviarCorreoModal
          informe={informeMensual}
          fecha={periodoInforme(reporte)}
          onClose={() => setCorreoMensualOpen(false)}
        />
      )}

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
