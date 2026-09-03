import { describe, expect, it } from "vitest";
import { buildInformeMensual, parsearAnalisis, periodoInforme } from "@/lib/informeMensual";
import type { MonthlyReport } from "@/services/audit";

// Markdown tal y como lo escribió la routine para agosto de 2026.
const ANALISIS = `## Informe de auditoría — Gran Muthu Habana — Agosto 2026

**Volumen del mes**

Del 1 al 31 de agosto se registraron en total 4 partes en los tres formularios.

**Borradores sin cerrar**

Tres de los cuatro partes del mes quedaron en borrador.
- Cuadrador Lavatín del 10 de agosto
- Control de Lencería del 7 de agosto`;

const reporteBase: MonthlyReport = {
  id: "r1",
  hotel_id: "h1",
  user_id: "u1",
  anio: 2026,
  mes: 8,
  estado: "listo",
  resumen: { analisis: ANALISIS, valoraciones: ["Cerrar los partes a diario.", "Revisar la dotación."] },
  metricas: {
    totalPartes: 4,
    diasConParte: 4,
    diasMes: 31,
    dotacion: 0,
    porFormulario: [
      { tipo: "lenceria", partes: 1, total: 0, kg: 0 },
      { tipo: "cuadrador", partes: 2, total: 0, kg: 0 },
    ],
  },
  pdf_url: null,
  generado_at: "2026-09-03T15:56:19Z",
  solicitado_at: "2026-09-03T15:54:44Z",
  created_at: "2026-08-27T17:16:59Z",
  updated_at: "2026-09-03T15:56:19Z",
};

describe("parsearAnalisis", () => {
  it("descarta el título del documento y trocea por encabezados en negrita", () => {
    const secciones = parsearAnalisis(ANALISIS);
    expect(secciones.map((s) => s.titulo)).toEqual(["Volumen del mes", "Borradores sin cerrar"]);
  });

  it("separa párrafos de viñetas y limpia el marcado inline", () => {
    const [volumen, borradores] = parsearAnalisis(ANALISIS);
    expect(volumen.parrafos).toHaveLength(1);
    expect(volumen.vinetas).toHaveLength(0);
    expect(borradores.vinetas).toEqual([
      "Cuadrador Lavatín del 10 de agosto",
      "Control de Lencería del 7 de agosto",
    ]);
    // Nada de asteriscos sueltos en el texto que va al PDF.
    expect(JSON.stringify(parsearAnalisis(ANALISIS))).not.toContain("**");
  });

  it("aguanta texto sin ningún encabezado", () => {
    const secciones = parsearAnalisis("Un párrafo suelto.\n\nY otro.");
    expect(secciones).toHaveLength(1);
    expect(secciones[0].titulo).toBeUndefined();
    expect(secciones[0].parrafos).toEqual(["Un párrafo suelto.", "Y otro."]);
  });
});

describe("buildInformeMensual", () => {
  it("arma el Informe con cabecera, métricas y valoraciones", () => {
    const informe = buildInformeMensual({ reporte: reporteBase, hotel: "Gran Muthu Habana", polo: "La Habana" });
    expect(informe).not.toBeNull();
    expect(informe!.titulo).toBe("Informe mensual de auditoría");
    expect(informe!.fechaLabel).toBe("Agosto 2026");
    expect(informe!.hotel).toBe("Gran Muthu Habana");
    expect(informe!.campos).toEqual([
      { label: "Partes del mes", valor: "4" },
      { label: "Días con parte", valor: "4 de 31" },
    ]);
    // Las valoraciones cierran el documento como última sección.
    expect(informe!.secciones!.at(-1)).toEqual({
      titulo: "Valoraciones",
      vinetas: ["Cerrar los partes a diario.", "Revisar la dotación."],
    });
  });

  it("traduce los tipos de formulario a nombres legibles", () => {
    const informe = buildInformeMensual({ reporte: reporteBase, hotel: "H" });
    expect(informe!.tablas[0].columnas).toEqual(["Formulario", "Partes", "Total", "Kg"]);
    expect(informe!.tablas[0].filas.map((f) => f[0])).toEqual(["Lencería", "Cuadrador Lavatín"]);
  });

  it("devuelve null si el informe todavía no tiene texto", () => {
    const vacio = { ...reporteBase, resumen: {}, metricas: {} };
    expect(buildInformeMensual({ reporte: vacio, hotel: "H" })).toBeNull();
  });

  it("no se rompe con métricas ausentes o con formas raras", () => {
    const raro = { ...reporteBase, metricas: { totalPartes: "no-es-numero", porFormulario: "tampoco" } };
    const informe = buildInformeMensual({ reporte: raro, hotel: "H" });
    expect(informe!.campos).toEqual([]);
    expect(informe!.tablas).toEqual([]);
  });

  it("compone el periodo que usan el nombre del PDF y el correo", () => {
    expect(periodoInforme(reporteBase)).toBe("2026-08");
    expect(periodoInforme({ ...reporteBase, mes: 12 })).toBe("2026-12");
  });
});
