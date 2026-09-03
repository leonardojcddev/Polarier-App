import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Eye,
  Info,
  Layers,
  Loader2,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import polarierLogo from "@/assets/polarier-logo.png";
import { useRole } from "@/context/RoleContext";
import {
  getFormDefinitions,
  getSubmissionHistory,
  getSubmissionsByMonth,
  FormDefinition,
  FormSubmission,
} from "@/services/audit";
import {
  Alerta,
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  buildDashboard,
  clasificarDia,
  etiquetaMes,
  fmtKg,
  fmtNum,
  mesesDisponibles,
} from "@/lib/dashboard";

// -----------------------------------------------------------------------------
// Dashboard de control: avance del mes hacia la dotación del hotel, comportamiento
// diario de cada formulario y avisos de días que se salen de lo normal.
//
// Identidad visual Polarier, la misma del informe (`InformePreview`): cabecera
// azul con el logo, franjas de sección azules con acento dorado y gráficas en
// azul primario + dorado. Toda la lógica vive en `src/lib/dashboard.ts`.
// -----------------------------------------------------------------------------

const claveMesActual = () => new Date().toISOString().slice(0, 7);

const selectCls =
  "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

// --- Piezas de UI ------------------------------------------------------------

/** Tarjeta de sección con la franja azul de cabecera (formato Polarier). */
const Panel = ({
  titulo,
  icon: Icon,
  extra,
  children,
}: {
  titulo: string;
  icon: typeof Target;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2.5 polarier-head">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent" />
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      {extra}
    </header>
    <div className="p-4">{children}</div>
  </section>
);

const Kpi = ({
  label,
  valor,
  pie,
  icon: Icon,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  pie?: string;
  icon: typeof Target;
  tono?: "neutro" | "bien" | "aviso" | "malo";
}) => {
  const color =
    tono === "bien"
      ? "text-emerald-600 dark:text-emerald-400"
      : tono === "aviso"
        ? "text-amber-600 dark:text-amber-400"
        : tono === "malo"
          ? "text-destructive"
          : "text-primary";
  return (
    <div className="relative bg-card border border-border rounded-xl p-4 pt-5 overflow-hidden shadow-sm">
      {/* Filete dorado superior: sello de marca de las tarjetas Polarier. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-accent" />
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-6 h-6 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
          <Icon size={13} className="text-accent-foreground dark:text-accent" />
        </span>
        <span className={labelCls}>{label}</span>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {pie && <p className="text-xs text-muted-foreground mt-1 leading-snug">{pie}</p>}
    </div>
  );
};

const ICONO_ALERTA = {
  alta: AlertTriangle,
  media: TrendingDown,
  info: Info,
} as const;

const AlertaCard = ({ a, onClick }: { a: Alerta; onClick?: () => void }) => {
  const Icon = ICONO_ALERTA[a.severidad];
  // Barra lateral de color: rojo / ámbar para lo que hay que mirar, dorado
  // Polarier para lo meramente informativo.
  const barra =
    a.severidad === "alta"
      ? "bg-destructive"
      : a.severidad === "media"
        ? "bg-amber-500"
        : "bg-accent";
  const fondo =
    a.severidad === "alta"
      ? "bg-destructive/5 border-destructive/30"
      : a.severidad === "media"
        ? "bg-amber-500/5 border-amber-500/30"
        : "bg-muted/40 border-border";
  const color =
    a.severidad === "alta"
      ? "text-destructive"
      : a.severidad === "media"
        ? "text-amber-600 dark:text-amber-400"
        : "text-accent-foreground dark:text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full text-left flex gap-3 rounded-xl border p-3.5 pl-4 overflow-hidden transition-colors ${fondo} ${
        onClick ? "hover:border-secondary cursor-pointer" : "cursor-default"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${barra}`} />
      <Icon size={18} className={`${color} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{a.titulo}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.detalle}</p>
        {a.accion && (
          <p className="text-xs mt-1.5 leading-relaxed">
            <span className="font-medium text-foreground">Qué revisar: </span>
            <span className="text-muted-foreground">{a.accion}</span>
          </p>
        )}
      </div>
    </button>
  );
};

/** Nota explicativa bajo la cabecera de cada gráfica. */
const Nota = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{children}</p>
);

// Tooltip de la gráfica diaria: muestra todos los formularios de ese día.
const TooltipDia = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: Record<string, unknown> }[];
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as {
    fechaLarga: string;
    valor: number;
    estado: keyof typeof ETIQUETA_ESTADO;
    desvio: number | null;
    otros: { nombre: string; valor: number }[];
  };
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-popover-foreground capitalize border-b border-border pb-1 mb-1.5">
        {p.fechaLarga}
      </p>
      <p className="text-popover-foreground">
        <span className="font-semibold tabular-nums">{fmtNum(p.valor)}</span> prendas{" "}
        <span className="text-muted-foreground">({ETIQUETA_ESTADO[p.estado]})</span>
      </p>
      {p.desvio !== null && (
        <p className="text-muted-foreground">
          {p.desvio >= 0 ? "+" : ""}
          {Math.round(p.desvio)} % frente al día típico
        </p>
      )}
      {p.otros.map((o) => (
        <p key={o.nombre} className="text-muted-foreground mt-0.5">
          {o.nombre}: {fmtNum(o.valor)}
        </p>
      ))}
    </div>
  );
};

// Estilo común de los tooltips de recharts.
const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.35)",
} as const;

const ejeX = {
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  tickLine: false,
  axisLine: { stroke: "hsl(var(--border))" },
} as const;

const ejeY = {
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  tickLine: false,
  axisLine: false,
} as const;

// -----------------------------------------------------------------------------

const DashboardControl = () => {
  const navigate = useNavigate();
  const { hotels, activeHotel, loading: roleLoading } = useRole();

  const [hotelId, setHotelId] = useState<string>("");
  const [mesClave, setMesClave] = useState<string>(claveMesActual());
  const [fuenteId, setFuenteId] = useState<string | null>(null);
  const [objetivoManual, setObjetivoManual] = useState<string>("");
  const [diaSel, setDiaSel] = useState<number | null>(null);

  const [defs, setDefs] = useState<FormDefinition[]>([]);
  const [historico, setHistorico] = useState<FormSubmission[]>([]);
  const [subs, setSubs] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMes, setLoadingMes] = useState(false);

  const hotel = hotels.find((h) => h.id === hotelId) ?? activeHotel ?? null;

  useEffect(() => {
    if (!activeHotel) return;
    setHotelId((prev) => prev || activeHotel.id);
  }, [activeHotel?.id]);

  // Definiciones + histórico del hotel (para saber qué meses tienen actividad).
  useEffect(() => {
    if (!hotel) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const [d, h] = await Promise.all([
          getFormDefinitions(hotel.id),
          getSubmissionHistory(hotel.id, 500),
        ]);
        if (!vivo) return;
        setDefs(d);
        setHistorico(h);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [hotel?.id]);

  // Submissions del mes seleccionado.
  useEffect(() => {
    if (!hotel) return;
    const [anio, mes] = mesClave.split("-").map(Number);
    if (!anio || !mes) return;
    let vivo = true;
    (async () => {
      setLoadingMes(true);
      try {
        const s = await getSubmissionsByMonth(hotel.id, anio, mes);
        if (vivo) {
          setSubs(s);
          setDiaSel(null);
        }
      } finally {
        if (vivo) setLoadingMes(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [hotel?.id, mesClave]);

  const meses = useMemo(() => mesesDisponibles(historico), [historico]);

  const dash = useMemo(() => {
    const [anio, mes] = mesClave.split("-").map(Number);
    return buildDashboard({
      submissions: subs,
      definitions: defs,
      anio,
      mes,
      fuenteId,
      objetivoManual: Number(objetivoManual) || null,
    });
  }, [subs, defs, mesClave, fuenteId, objetivoManual]);

  const fuente = dash.series.find((s) => s.defId === dash.fuenteId) ?? null;
  const ref = dash.resumen.medianaDiaria;

  // Datos de la gráfica diaria (fuente + resto de formularios como contexto).
  const datosDia = useMemo(
    () =>
      dash.dias.map((d) => {
        const valor = dash.fuenteId ? (d.porForm[dash.fuenteId]?.valor ?? 0) : 0;
        const fila: Record<string, unknown> = {
          etiqueta: d.etiqueta,
          dia: d.dia,
          fecha: d.fecha,
          fechaLarga: d.fechaLarga,
          futuro: d.futuro,
          valor: d.futuro ? null : valor,
          estado: d.futuro ? "sin_datos" : clasificarDia(valor, ref),
          desvio: ref > 0 && valor > 0 ? (valor / ref - 1) * 100 : null,
          otros: dash.series
            .filter((s) => s.defId !== dash.fuenteId && d.porForm[s.defId])
            .map((s) => ({ nombre: s.nombre, valor: d.porForm[s.defId].valor })),
        };
        for (const s of dash.series) fila[`f_${s.defId}`] = d.porForm[s.defId]?.valor ?? null;
        return fila;
      }),
    [dash, ref]
  );

  // En la comparativa solo entran los formularios de producción: el inventario de
  // lencería es un orden de magnitud mayor y aplastaría las demás líneas.
  const seriesComparables = dash.series.filter((s) => s.esProduccion && s.diasConDatos > 0);

  const seleccion = diaSel ? (dash.dias.find((d) => d.dia === diaSel) ?? null) : null;

  const pct = dash.resumen.pctObjetivo;
  const pctIdeal = dash.diasMes > 0 ? (dash.resumen.diasTranscurridos / dash.diasMes) * 100 : 0;
  const tonoAvance =
    pct === null ? "neutro" : pct >= pctIdeal - 5 ? "bien" : pct >= pctIdeal - 15 ? "aviso" : "malo";

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (!hotel) {
    return (
      <p className="text-sm text-muted-foreground py-10">
        No hay ningún hotel asignado a tu usuario.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* --- Cabecera de marca --------------------------------------------- */}
      <div className="rounded-xl polarier-band px-5 py-4 shadow-sm border-b-4 border-accent">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src={polarierLogo} alt="Polarier" className="h-9 shrink-0" />
            <div className="h-9 w-px bg-white/25 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">Dashboard de control</h2>
              <p className="text-xs text-white/70 truncate">
                {hotel.polo?.nombre ? `${hotel.polo.nombre} · ` : ""}
                {hotel.nombre}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
            {etiquetaMes(dash.anio, dash.mes)}
          </span>
        </div>
      </div>

      {/* --- Filtros -------------------------------------------------------- */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        {hotels.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Hotel</span>
            <select className={selectCls} value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Mes</span>
          <select className={selectCls} value={mesClave} onChange={(e) => setMesClave(e.target.value)}>
            {meses.map((m) => (
              <option key={m.clave} value={m.clave}>
                {etiquetaMes(m.anio, m.mes)}
              </option>
            ))}
          </select>
        </label>

        {dash.series.filter((s) => s.esProduccion).length > 1 && (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Fuente de producción</span>
            <select
              className={selectCls}
              value={dash.fuenteId ?? ""}
              onChange={(e) => setFuenteId(e.target.value || null)}
            >
              {dash.series
                .filter((s) => s.esProduccion)
                .map((s) => (
                  <option key={s.defId} value={s.defId}>
                    {s.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Dotación del hotel</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder={dash.objetivo ? fmtNum(dash.objetivo) : "auto"}
            className={`${selectCls} no-spinner w-32`}
            value={objetivoManual}
            onChange={(e) => setObjetivoManual(e.target.value)}
          />
        </label>

        {loadingMes && <Loader2 className="animate-spin text-muted-foreground mb-2" size={16} />}
      </div>

      {!dash.hayDatos ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
          <CalendarDays className="mx-auto text-accent mb-3" size={28} />
          <p className="text-sm font-medium text-foreground">
            Sin datos en {etiquetaMes(dash.anio, dash.mes)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            En cuanto se guarden formularios de ese mes, el dashboard mostrará el avance diario.
          </p>
        </div>
      ) : (
        <>
          {/* --- KPIs ------------------------------------------------------- */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Target}
              label="Avance del mes"
              valor={pct === null ? "—" : `${Math.round(pct)} %`}
              pie={
                pct === null
                  ? "Falta la dotación del hotel"
                  : `${fmtNum(dash.resumen.acumulado)} de ${fmtNum(dash.objetivo ?? 0)} prendas`
              }
              tono={tonoAvance as "neutro" | "bien" | "aviso" | "malo"}
            />
            <Kpi
              icon={TrendingUp}
              label="Día típico"
              valor={fmtNum(ref)}
              pie={`Mediana de ${dash.resumen.diasRegistrados} días con producción (media ${fmtNum(
                dash.resumen.mediaDiaria
              )})`}
            />
            <Kpi
              icon={ArrowRight}
              label="Cierre previsto"
              valor={dash.resumen.proyeccion === null ? "—" : fmtNum(dash.resumen.proyeccion)}
              pie={
                dash.objetivo && dash.resumen.proyeccion !== null
                  ? `${
                      dash.resumen.proyeccion >= dash.objetivo ? "Llega" : "No llega"
                    } a la dotación manteniendo este ritmo`
                  : "Proyección al ritmo actual"
              }
              tono={
                dash.objetivo && dash.resumen.proyeccion !== null
                  ? dash.resumen.proyeccion >= dash.objetivo * 0.95
                    ? "bien"
                    : "malo"
                  : "neutro"
              }
            />
            <Kpi
              icon={CalendarDays}
              label="Días registrados"
              valor={`${dash.resumen.diasRegistrados}/${
                dash.resumen.diasTranscurridos || dash.diasMes
              }`}
              pie={
                dash.resumen.kgAcumulados > 0
                  ? `${fmtKg(dash.resumen.kgAcumulados)} kg acumulados`
                  : "Días transcurridos con parte de producción"
              }
              tono={
                dash.resumen.diasTranscurridos > 0 &&
                dash.resumen.diasRegistrados < dash.resumen.diasTranscurridos
                  ? "aviso"
                  : "bien"
              }
            />
          </div>

          {/* --- Barra de avance -------------------------------------------- */}
          <Panel
            titulo="Avance hacia la dotación del hotel"
            icon={Target}
            extra={
              <span className="text-xs font-medium tabular-nums text-white/85">
                {fmtNum(dash.resumen.acumulado)}
                {dash.objetivo ? ` / ${fmtNum(dash.objetivo)}` : ""} prendas
              </span>
            }
          >
            <div className="relative h-3.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  tonoAvance === "malo"
                    ? "bg-destructive"
                    : tonoAvance === "aviso"
                      ? "bg-amber-500"
                      : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, pct ?? 0)}%` }}
              />
            </div>
            {dash.objetivo !== null && (
              <div className="relative h-4">
                {/* Marca de dónde debería ir hoy si el ritmo fuese constante. */}
                <div
                  className="absolute -top-4 h-3.5 w-0.5 bg-accent"
                  style={{ left: `${Math.min(100, pctIdeal)}%` }}
                />
                <span
                  className="absolute top-0 text-[10px] font-medium text-muted-foreground -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${Math.min(94, Math.max(8, pctIdeal))}%` }}
                >
                  ritmo ideal hoy ({Math.round(pctIdeal)} %)
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              {dash.objetivoOrigen} El mes empieza en 0 y debería terminar en el 100 %: cada día que
              la barra se queda por detrás de la marca dorada del ritmo ideal, quedan prendas del
              hotel sin pasar por lavandería.
            </p>
          </Panel>

          {/* --- Gráfica acumulada ------------------------------------------ */}
          <Panel titulo="Acumulado del mes" icon={TrendingUp}>
            <Nota>
              La línea sólida es lo lavado hasta cada día; la discontinua, el ritmo que llevaría
              justo a la dotación el último día. Si la sólida cae por debajo, se acumula retraso.
            </Nota>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dash.curva} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="etiqueta" interval={2} {...ejeX} />
                <YAxis tickFormatter={(v: number) => fmtNum(v)} {...ejeY} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => `Día ${l}`}
                  formatter={(v: number, n: string) => [fmtNum(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {dash.objetivo !== null && (
                  <ReferenceLine
                    y={dash.objetivo}
                    stroke="hsl(var(--accent))"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{
                      value: `Dotación ${fmtNum(dash.objetivo)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="real"
                  name="Acumulado real"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fill="url(#gradAcum)"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  name="Ritmo ideal"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          {/* --- Gráfica diaria --------------------------------------------- */}
          <Panel
            titulo={`Producción por día${fuente ? ` · ${fuente.nombre}` : ""}`}
            icon={BarChart3}
            extra={
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/85">
                {(["normal", "bajo", "muy_bajo", "alto", "sin_datos"] as const).map((e) => (
                  <span key={e} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-white/30"
                      style={{ background: COLOR_ESTADO[e] }}
                    />
                    {ETIQUETA_ESTADO[e]}
                  </span>
                ))}
              </div>
            }
          >
            <Nota>
              Cada barra es un día. La línea horizontal marca el día típico del mes (mediana). Las
              barras naranjas y rojas son los días que se quedaron claramente por debajo:{" "}
              <strong className="text-foreground">esos son los que hay que vigilar</strong>. Pulsa
              una barra para ver el detalle.
            </Nota>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart
                data={datosDia}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                onClick={(e: { activePayload?: { payload?: { dia?: number } }[] }) => {
                  const dia = e?.activePayload?.[0]?.payload?.dia;
                  if (dia) setDiaSel((prev) => (prev === dia ? null : dia));
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="etiqueta" interval={1} {...ejeX} />
                <YAxis tickFormatter={(v: number) => fmtNum(v)} {...ejeY} />
                <Tooltip content={<TooltipDia />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                {ref > 0 && (
                  <ReferenceLine
                    y={ref}
                    stroke="hsl(var(--foreground))"
                    strokeOpacity={0.45}
                    strokeDasharray="4 4"
                    label={{
                      value: `Día típico ${fmtNum(ref)}`,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                )}
                {/* Sin animación de entrada: con 31 barras no aporta y evita
                    que queden sin pintar si la pestaña se monta en segundo plano. */}
                <Bar
                  dataKey="valor"
                  name="Prendas"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                >
                  {datosDia.map((d, i) => (
                    <Cell
                      key={i}
                      fill={COLOR_ESTADO[(d.estado as keyof typeof COLOR_ESTADO) ?? "normal"]}
                      fillOpacity={diaSel === null || diaSel === d.dia ? 1 : 0.3}
                      cursor="pointer"
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          {/* --- Comparativa entre formularios ------------------------------ */}
          {seriesComparables.length > 1 && (
            <Panel titulo="Comportamiento por formulario" icon={Layers}>
              <Nota>
                Cada línea es un formulario de producción. Cuando dos líneas que suelen ir juntas se
                separan en un día, normalmente falta un parte o hay un descuadre entre lo declarado y
                lo producido. (El inventario de lencería no entra aquí: es un conteo de existencias,
                no una producción diaria.)
              </Nota>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={datosDia} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="etiqueta" interval={2} {...ejeX} />
                  <YAxis tickFormatter={(v: number) => fmtNum(v)} {...ejeY} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(l) => `Día ${l}`}
                    formatter={(v: number, n: string) => [fmtNum(v), n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {seriesComparables.map((s) => (
                    <Line
                      key={s.defId}
                      type="monotone"
                      dataKey={`f_${s.defId}`}
                      name={s.nombre}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* --- Detalle del día seleccionado -------------------------------- */}
          {seleccion && (
            <Panel
              titulo={seleccion.fechaLarga}
              icon={Eye}
              extra={
                <button
                  onClick={() => setDiaSel(null)}
                  className="text-xs text-white/80 hover:text-white underline underline-offset-2"
                >
                  Cerrar
                </button>
              }
            >
              <Nota>Pulsa cualquier formulario para abrir el parte de ese día.</Nota>
              <div className="grid gap-2 sm:grid-cols-2">
                {dash.series.map((s) => {
                  const reg = seleccion.porForm[s.defId];
                  return (
                    <button
                      key={s.defId}
                      onClick={() =>
                        navigate(`/auditoria/formulario/${s.defId}?fecha=${seleccion.fecha}`)
                      }
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-secondary hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-1.5 h-8 rounded-full shrink-0"
                          style={{ background: s.color }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{s.nombre}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {reg
                              ? reg.estado === "completado"
                                ? "Completado"
                                : "Borrador"
                              : "Sin registrar"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-primary">
                          {reg ? fmtNum(reg.valor) : "—"}
                        </p>
                        {reg && reg.kg > 0 && (
                          <p className="text-[11px] text-muted-foreground">{fmtKg(reg.kg)} kg</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* --- Alertas ----------------------------------------------------- */}
          <Panel
            titulo="Qué vigilar este mes"
            icon={AlertTriangle}
            extra={
              dash.alertas.length > 0 && (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                  {dash.alertas.length}
                </span>
              )
            }
          >
            <Nota>
              Comparamos cada día con el día típico del mes (la mediana, para que un solo día raro no
              desvirtúe la referencia). Aquí solo aparece lo que se sale de ese patrón.
            </Nota>
            {dash.alertas.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-4">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  Sin desviaciones destacables: la producción diaria se mantiene estable y no faltan
                  partes.
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {dash.alertas.map((a) => (
                  <AlertaCard
                    key={a.id}
                    a={a}
                    onClick={a.dia ? () => setDiaSel(a.dia ?? null) : undefined}
                  />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

export default DashboardControl;
