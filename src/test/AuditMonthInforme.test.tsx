import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MonthlyReport } from "@/services/audit";

const HOTEL = { id: "h1", nombre: "Gran Muthu Habana", polo: { nombre: "La Habana" } };

const reporteListo = {
  id: "r1", hotel_id: "h1", user_id: "u1", anio: 2026, mes: 8, estado: "listo",
  resumen: {
    analisis: "## Informe\n\n**Volumen del mes**\n\nSe registraron 4 partes.",
    valoraciones: ["Cerrar los partes a diario."],
  },
  metricas: { totalPartes: 4, diasConParte: 4, diasMes: 31 },
  pdf_url: null, generado_at: "2026-09-03T15:56:19Z", solicitado_at: "2026-09-03T15:54:44Z",
  created_at: "", updated_at: "",
} as unknown as MonthlyReport;

// El mes tiene partes: si no, el botón de generar sale deshabilitado.
const subs = [{ id: "s1", form_definition_id: "d1", fecha: "2026-08-07", estado: "completado", hotel_id: "h1", user_id: "u1", data: {}, totales: {} }];

let reporteActual: MonthlyReport | null = reporteListo;

vi.mock("@/context/RoleContext", () => ({
  useRole: () => ({ hotels: [HOTEL], activeHotel: HOTEL, loading: false }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { email: "auditor@polarier.com" }, profile: { full_name: "Auditor" } }),
}));
vi.mock("@/services/audit", () => ({
  getSubmissionsByMonth: vi.fn(async () => subs),
  getFormDefinitions: vi.fn(async () => [{ id: "d1", hotel_id: "h1", tipo: "produccion", nombre: "Control de Producción", schema_version: 1, config: {}, activo: true }]),
  getMonthlyReport: vi.fn(async () => reporteActual),
  getMonthlyReportPdfUrl: vi.fn(async () => "https://example.test/x.pdf"),
  getPrendas: vi.fn(async () => []),
  getUbicaciones: vi.fn(async () => []),
  solicitarInformeMensual: vi.fn(async () => ({ reporte: reporteListo, disparada: true })),
}));

const pintar = async () => {
  const { default: AuditMonth } = await import("@/pages/audit/AuditMonth");
  render(
    <MemoryRouter initialEntries={["/auditoria/historico/2026-08"]}>
      <Routes>
        <Route path="/auditoria/historico/:anioMes" element={<AuditMonth />} />
      </Routes>
    </MemoryRouter>
  );
};

describe("AuditMonth · botonera del informe mensual", () => {
  it("con el informe hecho, los tres botones activos y el de generar dice Regenerar", async () => {
    reporteActual = reporteListo;
    await pintar();

    expect(await screen.findByRole("button", { name: "Regenerar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descargar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enviar por correo" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Generar informe" })).not.toBeInTheDocument();
  });

  it("«Enviar por correo» abre el modal con el informe del mes", async () => {
    reporteActual = reporteListo;
    await pintar();

    fireEvent.click(await screen.findByRole("button", { name: "Enviar por correo" }));
    expect(await screen.findByText("Enviar informe por correo")).toBeInTheDocument();
    // El asunto se rellena con el título y el mes, no con una fecha de parte.
    expect(screen.getByDisplayValue(/Informe mensual de auditoría · Agosto 2026/)).toBeInTheDocument();
  });

  it("sin informe todavía, los tres están a la vista pero solo se puede generar", async () => {
    reporteActual = null;
    await pintar();

    expect(await screen.findByRole("button", { name: "Generar informe" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descargar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar por correo" })).toBeDisabled();
  });

  it("si el estado dice listo pero no hay texto, no se puede descargar ni enviar", async () => {
    reporteActual = { ...reporteListo, resumen: {} } as MonthlyReport;
    await pintar();

    expect(await screen.findByRole("button", { name: "Regenerar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descargar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar por correo" })).toBeDisabled();
  });
});

describe("AuditMonth · el informe en pantalla", () => {
  it("pinta secciones y viñetas, no el markdown crudo", async () => {
    reporteActual = reporteListo;
    await pintar();

    // El encabezado en negrita del análisis pasa a ser un título de sección.
    expect(await screen.findByText("Volumen del mes")).toBeInTheDocument();
    expect(screen.getByText("Se registraron 4 partes.")).toBeInTheDocument();
    expect(screen.getByText("Valoraciones")).toBeInTheDocument();
    expect(screen.getByText("Cerrar los partes a diario.")).toBeInTheDocument();

    // Las métricas acompañan al texto, como en el PDF.
    expect(screen.getByText(/Días con parte/)).toBeInTheDocument();

    // Y no queda marcado de markdown a la vista.
    const caja = screen.getByText("Volumen del mes").closest("div");
    expect(caja!.textContent).not.toContain("**");
    expect(caja!.textContent).not.toContain("##");
  });
});
