import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CalendarDays, ChevronRight, FileText, Sparkles } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import {
  getSubmissionHistory,
  getMonthlyReports,
  FormSubmission,
  MonthlyReport,
  MonthlyEstado,
} from "@/services/audit";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface MesResumen {
  anio: number;
  mes: number; // 1..12
  clave: string; // "2026-08"
  nombre: string; // "Agosto 2026"
  total: number; // nº de informes diarios
  estado: MonthlyEstado | null; // estado del informe mensual (si existe)
}

// Etiqueta y color del badge según el estado del informe mensual.
const ESTADO_BADGE: Record<MonthlyEstado, { label: string; clase: string }> = {
  pendiente: { label: "Informe pendiente", clase: "text-amber-600 bg-amber-500/10" },
  generando: { label: "Generando…", clase: "text-blue-600 bg-blue-500/10" },
  listo: { label: "Informe listo", clase: "text-green-600 bg-green-500/10" },
  error: { label: "Error", clase: "text-destructive bg-destructive/10" },
};

const AuditHistory = () => {
  const navigate = useNavigate();
  const { activeHotel, loading: roleLoading } = useRole();
  const [subs, setSubs] = useState<FormSubmission[]>([]);
  const [monthly, setMonthly] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeHotel) return;
    (async () => {
      setLoading(true);
      try {
        const [s, m] = await Promise.all([
          getSubmissionHistory(activeHotel.id),
          getMonthlyReports(activeHotel.id),
        ]);
        setSubs(s);
        setMonthly(m);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeHotel?.id]);

  // Agrupa las submissions por mes y cruza con el estado del informe mensual.
  const meses = useMemo<MesResumen[]>(() => {
    const estadoPorClave = new Map<string, MonthlyEstado>();
    for (const r of monthly) estadoPorClave.set(`${r.anio}-${String(r.mes).padStart(2, "0")}`, r.estado);

    const conteo = new Map<string, number>();
    for (const s of subs) {
      const clave = s.fecha.slice(0, 7); // "YYYY-MM"
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }

    return Array.from(conteo.entries())
      .map(([clave, total]) => {
        const [anio, mes] = clave.split("-").map(Number);
        return {
          anio,
          mes,
          clave,
          nombre: `${NOMBRES_MES[mes - 1]} ${anio}`,
          total,
          estado: estadoPorClave.get(clave) ?? null,
        };
      })
      .sort((a, b) => b.clave.localeCompare(a.clave)); // más reciente primero
  }, [subs, monthly]);

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
        <h1 className="text-xl font-semibold text-foreground mb-1">Histórico por meses</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Elige un mes para ver sus informes y, al cierre, su informe de comportamiento mensual.
        </p>

        {meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has registrado ningún formulario.</p>
        ) : (
          <div className="space-y-3">
            {meses.map((m) => {
              const badge = m.estado ? ESTADO_BADGE[m.estado] : null;
              return (
                <div
                  key={m.clave}
                  onClick={() => navigate(`/auditoria/historico/${m.clave}`)}
                  role="button"
                  className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-secondary hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarDays size={18} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate capitalize">{m.nombre}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText size={12} />
                          {m.total} {m.total === 1 ? "informe" : "informes"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {badge ? (
                        <span className={`hidden sm:flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 ${badge.clase}`}>
                          <Sparkles size={12} /> {badge.label}
                        </span>
                      ) : (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground rounded-full px-2.5 py-1 bg-muted">
                          Sin informe mensual
                        </span>
                      )}
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditHistory;
