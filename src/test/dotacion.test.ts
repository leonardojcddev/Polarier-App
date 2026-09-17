import { describe, expect, it } from "vitest";
import {
  compararConDotacion,
  fmtDiferencia,
  hayDotacion,
  precargarDesdeDotacion,
  totalDotacion,
} from "@/lib/dotacion";
import { buildInforme } from "@/lib/informe";
import type { FormDefinition, FormSubmission, Prenda, Ubicacion } from "@/services/audit";

const ubicaciones: Ubicacion[] = [
  { id: "lav", nombre: "Lavandería", orden: 1 },
  { id: "p24", nombre: "Piso 24", orden: 2 },
];
const prendas: Prenda[] = [
  { id: "sp", codigo: "SP", nombre: "Sábana personal", orden: 1 },
  { id: "tp", codigo: "TP", nombre: "Toalla piscina", orden: 2 },
];

// Dotación: 41 + 35 en lavandería, 52 en el piso 24 → 128 prendas.
const dotacion = { lav: { sp: 41, tp: 35 }, p24: { sp: 52, tp: 0 } };

describe("dotación de lencería", () => {
  it("suma la dotación y detecta si hay alguna", () => {
    expect(totalDotacion(dotacion)).toBe(128);
    expect(hayDotacion(dotacion)).toBe(true);
    expect(hayDotacion({})).toBe(false);
    expect(hayDotacion(null)).toBe(false);
  });

  it("precarga el formulario con una copia sin ceros", () => {
    const data = precargarDesdeDotacion(dotacion);
    expect(data).toEqual({ lav: { sp: 41, tp: 35 }, p24: { sp: 52 } });
    // Es una copia: editar el parte no toca la dotación.
    data.lav.sp = 1;
    expect(dotacion.lav.sp).toBe(41);
  });

  it("compara el conteo con la dotación por prenda, ubicación y total", () => {
    // Se movieron 10 sábanas del piso 24 a lavandería y se perdieron 3 toallas.
    const contado = { lav: { sp: 51, tp: 32 }, p24: { sp: 42 } };
    const cmp = compararConDotacion(contado, dotacion, ubicaciones, prendas);

    expect(cmp.general).toEqual({ dotacion: 128, contado: 125, diferencia: -3 });
    expect(cmp.cuadra).toBe(false);
    expect(cmp.porPrenda.sp.diferencia).toBe(0); // solo cambiaron de sitio
    expect(cmp.porPrenda.tp.diferencia).toBe(-3);
    expect(cmp.porUbicacion.lav.diferencia).toBe(7);
    expect(cmp.porUbicacion.p24.diferencia).toBe(-10);
  });

  it("cuadra cuando el conteo es la dotación tal cual", () => {
    const cmp = compararConDotacion(precargarDesdeDotacion(dotacion), dotacion, ubicaciones, prendas);
    expect(cmp.cuadra).toBe(true);
    expect(cmp.general.diferencia).toBe(0);
  });

  it("formatea las diferencias con signo", () => {
    expect(fmtDiferencia(0)).toBe("0");
    expect(fmtDiferencia(12)).toBe("+12");
    expect(fmtDiferencia(-12)).toBe("−12");
  });
});

describe("informe de lencería con dotación", () => {
  const definition: FormDefinition = {
    id: "def-len",
    hotel_id: "h1",
    tipo: "lenceria",
    nombre: "Control de Lencería",
    schema_version: 1,
    config: { layout: "matriz" },
    activo: true,
  };
  const submission = {
    fecha: "2026-09-17",
    estado: "completado",
    data: { lav: { sp: 51, tp: 32 }, p24: { sp: 42 } },
    totales: {},
  } as unknown as FormSubmission;

  it("añade la columna Dif., las filas Dotación/Diferencia y los datos de cabecera", () => {
    const informe = buildInforme({
      submission,
      definition,
      hotel: "Gran Muthu Habana",
      ubicaciones,
      prendas,
      dotacion,
    });

    const [tabla] = informe.tablas;
    expect(tabla.columnas).toEqual(["Ubicación", "Sábana personal", "Toalla piscina", "Total", "Dif."]);
    expect(tabla.filas[0]).toEqual(["Lavandería", 51, 32, 83, "+7"]);
    expect(tabla.filas[1]).toEqual(["Piso 24", 42, "", 42, "−10"]);
    expect(tabla.total).toEqual(["Total", 93, 32, 125, "−3"]);
    expect(tabla.extras).toEqual([
      ["Dotación", 93, 35, 128, ""],
      ["Diferencia", "0", "−3", "−3", ""],
    ]);
    expect(informe.campos).toEqual([
      { label: "Dotación del hotel", valor: "128" },
      { label: "Contado", valor: "125" },
      { label: "Diferencia", valor: "−3 (faltan)" },
    ]);
  });

  it("sin dotación el informe queda como antes", () => {
    const informe = buildInforme({ submission, definition, hotel: "Gran Muthu Habana", ubicaciones, prendas });
    const [tabla] = informe.tablas;
    expect(tabla.columnas).toEqual(["Ubicación", "Sábana personal", "Toalla piscina", "Total"]);
    expect(tabla.extras).toBeUndefined();
    expect(informe.campos).toEqual([]);
  });
});
