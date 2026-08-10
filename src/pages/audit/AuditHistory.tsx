import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, Download, CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/context/RoleContext";
import {
  getSubmissionHistory,
  getFormDefinitions,
  getPrendas,
  getUbicaciones,
  FormSubmission,
  FormDefinition,
} from "@/services/audit";
import { buildInforme, Informe } from "@/lib/informe";
import InformePreview from "@/components/audit/InformePreview";

const hoyStr = () => new Date().toISOString().slice(0, 10);

const AuditHistory = () => {
  const navigate = useNavigate();
  const { activeHotel, loading: roleLoading } = useRole();
  const [items, setItems] = useState<FormSubmission[]>([]);
  const [defs, setDefs] = useState<Record<string, FormDefinition>>({});
  const [loading, setLoading] = useState(true);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [informeOpen, setInformeOpen] = useState(false);
  const [informeLoading, setInformeLoading] = useState(false);
  const [informeFecha, setInformeFecha] = useState<string>("");

  useEffect(() => {
    if (!activeHotel) return;
    (async () => {
      setLoading(true);
      try {
        const [subs, definitions] = await Promise.all([
          getSubmissionHistory(activeHotel.id),
          getFormDefinitions(activeHotel.id),
        ]);
        setItems(subs);
        setDefs(Object.fromEntries(definitions.map((d) => [d.id, d])));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeHotel?.id]);

  // Abre la vista previa del informe para una submission (genera el PDF en cliente).
  const verInforme = async (s: FormSubmission) => {
    const def = defs[s.form_definition_id];
    if (!def || !activeHotel) return;
    setInformeOpen(true);
    setInformeLoading(true);
    setInforme(null);
    setInformeFecha(s.fecha);
    try {
      // La lencería necesita catálogos para nombrar filas/columnas.
      const [prendas, ubicaciones] =
        def.tipo === "lenceria"
          ? await Promise.all([getPrendas(activeHotel.id), getUbicaciones(activeHotel.id)])
          : [[], []];
      setInforme(
        buildInforme({
          submission: s,
          definition: def,
          hotel: activeHotel.nombre,
          polo: activeHotel.polo?.nombre ?? undefined,
          prendas,
          ubicaciones,
        })
      );
    } catch (err: any) {
      toast.error(err.message || "No se pudo generar el informe");
      setInformeOpen(false);
    } finally {
      setInformeLoading(false);
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
        <h1 className="text-xl font-semibold text-foreground mb-6">Histórico de formularios</h1>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has registrado ningún formulario.</p>
        ) : (
          <div className="space-y-3">
            {items.map((s) => {
              const def = defs[s.form_definition_id];
              const total = (s.totales as any)?.general ?? null;
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

export default AuditHistory;
