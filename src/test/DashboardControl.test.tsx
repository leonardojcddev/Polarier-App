import { describe, expect, it, vi, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FormDefinition, FormSubmission } from "@/services/audit";

const HOTEL = { id: "h1", nombre: "Gran Muthu Habana", polo: { nombre: "La Habana" } };

const defs: FormDefinition[] = [
  {
    id: "prod",
    hotel_id: "h1",
    tipo: "produccion",
    nombre: "Control de Producción",
    schema_version: 1,
    config: { layout: "vales" },
    activo: true,
  },
  {
    id: "len",
    hotel_id: "h1",
    tipo: "lenceria",
    nombre: "Control de Lencería",
    schema_version: 1,
    config: {},
    activo: true,
  },
];

// Mes anterior al actual: así todos sus días están cerrados y las alertas aplican.
const anterior = new Date();
anterior.setDate(1);
anterior.setMonth(anterior.getMonth() - 1);
const mes = anterior.toISOString().slice(0, 7);
const dia = (n: number) => `${mes}-${String(n).padStart(2, "0")}`;

const subs: FormSubmission[] = [
  { id: "1", form_definition_id: "prod", fecha: dia(1), estado: "completado", totales: { porColumna: { produccion: 400 } } },
  { id: "2", form_definition_id: "prod", fecha: dia(2), estado: "completado", totales: { porColumna: { produccion: 420 } } },
  { id: "3", form_definition_id: "prod", fecha: dia(3), estado: "completado", totales: { porColumna: { produccion: 120 } } },
  { id: "4", form_definition_id: "len", fecha: dia(1), estado: "completado", totales: { general: 12000 } },
].map((s) => ({ ...s, hotel_id: "h1", user_id: "u1", data: {} }) as unknown as FormSubmission);

vi.mock("@/context/RoleContext", () => ({
  useRole: () => ({ hotels: [HOTEL], activeHotel: HOTEL, loading: false }),
}));

vi.mock("@/services/audit", () => ({
  getFormDefinitions: vi.fn(async () => defs),
  getSubmissionHistory: vi.fn(async () => subs),
  getSubmissionsByMonth: vi.fn(async () => subs),
}));

beforeAll(() => {
  // Recharts necesita un tamaño real para pintar dentro de jsdom.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("DashboardControl", () => {
  it("pinta el avance del mes y avisa del día flojo", async () => {
    const { default: DashboardControl } = await import("@/components/audit/DashboardControl");
    render(
      <MemoryRouter>
        <DashboardControl />
      </MemoryRouter>
    );

    expect(await screen.findByText("Avance hacia la dotación del hotel")).toBeInTheDocument();
    expect(await screen.findByText(/Qué vigilar este mes/)).toBeInTheDocument();

    // El dashboard abre en el mes en curso; nos movemos al mes con datos.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: mes } });

    // El día 3 (120 prendas frente a una mediana de 400) debe salir señalado.
    expect(await screen.findByText(/Día 3: producción/)).toBeInTheDocument();
  });
});
