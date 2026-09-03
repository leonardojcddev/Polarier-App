import { describe, expect, it } from "vitest";
import { buildDashboard, clasificarDia, mesesDisponibles } from "@/lib/dashboard";
import type { FormDefinition, FormSubmission } from "@/services/audit";

const HOTEL = "hotel-1";
const DEF_PROD = "def-prod";
const DEF_LEN = "def-len";

const defs: FormDefinition[] = [
  {
    id: DEF_PROD,
    hotel_id: HOTEL,
    tipo: "produccion",
    nombre: "Control de Producción",
    schema_version: 1,
    config: { layout: "vales" },
    activo: true,
  },
  {
    id: DEF_LEN,
    hotel_id: HOTEL,
    tipo: "lenceria",
    nombre: "Control de Lencería",
    schema_version: 1,
    config: {},
    activo: true,
  },
];

const sub = (
  defId: string,
  fecha: string,
  totales: Record<string, unknown>,
  estado: "borrador" | "completado" = "completado"
): FormSubmission =>
  ({
    id: `${defId}-${fecha}`,
    hotel_id: HOTEL,
    form_definition_id: defId,
    user_id: "u1",
    fecha,
    estado,
    data: {},
    totales,
  }) as FormSubmission;

const prod = (fecha: string, produccion: number, estado?: "borrador" | "completado") =>
  sub(DEF_PROD, fecha, { general: produccion, porColumna: { produccion } }, estado);

describe("buildDashboard", () => {
  it("acumula la producción diaria y la compara con la dotación de lencería", () => {
    const subs = [
      prod("2026-06-01", 100),
      prod("2026-06-02", 100),
      prod("2026-06-03", 100),
      sub(DEF_LEN, "2026-06-01", { general: 3000 }),
    ];
    const d = buildDashboard({
      submissions: subs,
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-04",
    });

    expect(d.diasMes).toBe(30);
    expect(d.diaActual).toBe(4);
    expect(d.fuenteId).toBe(DEF_PROD);
    expect(d.objetivo).toBe(3000);
    expect(d.resumen.acumulado).toBe(300);
    expect(d.resumen.medianaDiaria).toBe(100);
    // La curva no avanza en días futuros.
    expect(d.curva[2].real).toBe(300);
    expect(d.curva[29].real).toBeNull();
    // El ritmo ideal reparte la dotación a lo largo del mes.
    expect(d.curva[29].ideal).toBe(3000);
  });

  it("marca un día claramente flojo y explica la caída", () => {
    const subs = [
      prod("2026-06-01", 100),
      prod("2026-06-02", 100),
      prod("2026-06-03", 100),
      prod("2026-06-04", 30),
    ];
    const d = buildDashboard({
      submissions: subs,
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-05",
    });

    const alerta = d.alertas.find((a) => a.tipo === "produccion_baja");
    expect(alerta).toBeDefined();
    expect(alerta?.dia).toBe(4);
    expect(alerta?.severidad).toBe("alta");
    expect(alerta?.detalle).toContain("70 %");
  });

  it("avisa de días pasados sin parte y de borradores", () => {
    const subs = [prod("2026-06-01", 100), prod("2026-06-03", 100, "borrador")];
    const d = buildDashboard({
      submissions: subs,
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-05",
    });

    expect(d.alertas.some((a) => a.tipo === "sin_registrar" && a.dia === 2)).toBe(true);
    expect(d.alertas.some((a) => a.tipo === "borrador" && a.dia === 3)).toBe(true);
  });

  it("avisa cuando el ritmo no llega a la dotación del mes", () => {
    const subs = [
      ...Array.from({ length: 10 }, (_, i) =>
        prod(`2026-06-${String(i + 1).padStart(2, "0")}`, 50)
      ),
      sub(DEF_LEN, "2026-06-01", { general: 3000 }),
    ];
    const d = buildDashboard({
      submissions: subs,
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-11",
    });

    expect(d.resumen.proyeccion).toBe(1500); // 500 en 10 días → 1500 en 30
    expect(d.alertas.some((a) => a.tipo === "ritmo_bajo")).toBe(true);
  });

  it("suma varias entregas del mismo día y usa el mayor conteo de lencería", () => {
    const subs = [
      prod("2026-06-01", 40),
      { ...prod("2026-06-01", 60), id: "otro", user_id: "u2" } as FormSubmission,
      sub(DEF_LEN, "2026-06-01", { general: 1000 }),
      sub(DEF_LEN, "2026-06-02", { general: 2500 }),
    ];
    const d = buildDashboard({
      submissions: subs,
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-03",
    });

    expect(d.dias[0].porForm[DEF_PROD].valor).toBe(100);
    expect(d.objetivo).toBe(2500);
  });

  it("no inventa objetivo si no hay lencería y lo explica", () => {
    const d = buildDashboard({
      submissions: [prod("2026-06-01", 100)],
      definitions: defs,
      anio: 2026,
      mes: 6,
      hoy: "2026-06-02",
    });
    expect(d.objetivo).toBeNull();
    expect(d.resumen.pctObjetivo).toBeNull();
    expect(d.objetivoOrigen).toContain("lencería");
  });

  it("lee la producción del cuadrador desde totales.prenda y suma kg", () => {
    const defCuad: FormDefinition = {
      id: "def-cuad",
      hotel_id: HOTEL,
      tipo: "cuadrador",
      nombre: "Cuadrador Lavatín",
      schema_version: 1,
      config: { layout: "cuadrador" },
      activo: true,
    };
    const d = buildDashboard({
      submissions: [sub("def-cuad", "2026-06-01", { prenda: 250, kg: 180.5, pendiente: 10 })],
      definitions: [defCuad],
      anio: 2026,
      mes: 6,
      hoy: "2026-06-02",
    });
    expect(d.resumen.acumulado).toBe(250);
    expect(d.resumen.kgAcumulados).toBeCloseTo(180.5);
  });
});

describe("clasificarDia", () => {
  it("clasifica respecto a la referencia", () => {
    expect(clasificarDia(0, 100)).toBe("sin_datos");
    expect(clasificarDia(40, 100)).toBe("muy_bajo");
    expect(clasificarDia(70, 100)).toBe("bajo");
    expect(clasificarDia(100, 100)).toBe("normal");
    expect(clasificarDia(200, 100)).toBe("alto");
  });
});

describe("mesesDisponibles", () => {
  it("devuelve los meses con actividad, más reciente primero", () => {
    const meses = mesesDisponibles(
      [{ fecha: "2026-05-03" }, { fecha: "2026-07-11" }, { fecha: "2026-05-20" }],
      false
    );
    expect(meses.map((m) => m.clave)).toEqual(["2026-07", "2026-05"]);
  });
});
