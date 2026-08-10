import { useEffect, useState } from "react";
import { X, Download, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import polarierLogo from "@/assets/polarier-logo.png";
import type { Informe } from "@/lib/informe";
import { descargarInformePdf } from "@/lib/informePdf";
import EnviarCorreoModal from "@/components/audit/EnviarCorreoModal";

interface Props {
  informe: Informe | null;
  fecha: string; // YYYY-MM-DD, para nombrar el archivo
  loading?: boolean;
  onClose: () => void;
}

/**
 * Vista previa del informe a pantalla completa, con formato Polarier.
 * El mismo marcado sirve para pantalla y para PDF: "Descargar PDF" abre el
 * diálogo de impresión del navegador (destino "Guardar como PDF"). El CSS
 * `@media print` de index.css aísla `#informe-print` para imprimir solo esto.
 */
const InformePreview = ({ informe, fecha, loading, onClose }: Props) => {
  const [descargando, setDescargando] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);

  // Cerrar con Escape (salvo si el modal de correo está abierto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !correoOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, correoOpen]);

  const descargar = async () => {
    if (!informe) return;
    setDescargando(true);
    try {
      await descargarInformePdf(informe, fecha);
    } catch (err: any) {
      toast.error(err.message || "No se pudo generar el PDF");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 print:static print:bg-transparent">
      {/* Barra de acciones (no se imprime) */}
      <div className="print:hidden flex items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border shadow-sm">
        <h2 className="text-sm font-semibold text-foreground truncate">Vista previa del informe</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCorreoOpen(true)}
            disabled={loading || !informe}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Mail size={16} /> Enviar por correo
          </button>
          <button
            onClick={descargar}
            disabled={loading || !informe || descargando}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {descargando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Descargar PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <X size={16} /> Cerrar
          </button>
        </div>
      </div>

      {/* Área desplazable con la "hoja" del informe */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 print:overflow-visible print:p-0">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-muted" size={28} />
          </div>
        ) : !informe ? (
          <div className="mx-auto max-w-[820px] rounded-lg bg-white p-10 text-center text-sm text-neutral-500">
            No se pudo generar el informe.
          </div>
        ) : (
          <div
            id="informe-print"
            className="mx-auto max-w-[820px] bg-white text-neutral-900 shadow-xl print:shadow-none print:max-w-none"
          >
            <InformeHoja informe={informe} />
          </div>
        )}
      </div>

      {correoOpen && informe && (
        <EnviarCorreoModal
          informe={informe}
          fecha={fecha}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// La "hoja" del informe. Colores fijos (papel blanco) para impresión fiel,
// independientes del tema de la app.
// -----------------------------------------------------------------------------
const AZUL = "#1e3a8a"; // primary Polarier aproximado
const DORADO = "#c9a227";

const InformeHoja = ({ informe }: { informe: Informe }) => (
  <div className="p-8 sm:p-10">
    {/* Cabecera */}
    <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: AZUL }}>
      <div>
        <img src={polarierLogo} alt="Polarier" className="h-10 mb-3" />
        <h1 className="text-xl font-bold" style={{ color: AZUL }}>
          {informe.titulo}
        </h1>
        <p className="text-sm text-neutral-600 mt-0.5">
          {informe.polo ? `${informe.polo} · ` : ""}
          {informe.hotel}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold capitalize text-neutral-800">{informe.fechaLabel}</p>
        <span
          className="inline-block mt-1 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full"
          style={{ backgroundColor: `${DORADO}22`, color: "#8a6d00" }}
        >
          {informe.estado}
        </span>
      </div>
    </div>

    {/* Datos del parte */}
    {informe.campos.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-5">
        {informe.campos.map((c, i) => (
          <div key={i} className="text-sm">
            <span className="text-neutral-500">{c.label}: </span>
            <span className="font-medium text-neutral-900">{c.valor}</span>
          </div>
        ))}
      </div>
    )}

    {/* Tablas */}
    <div className="mt-6 space-y-6">
      {informe.tablas.length === 0 ? (
        <p className="text-sm text-neutral-500">Este informe no contiene datos.</p>
      ) : (
        informe.tablas.map((t, ti) => (
          <div key={ti} className="informe-tabla">
            {t.titulo && (
              <h3
                className="text-sm font-semibold px-3 py-2 rounded-t-md text-white"
                style={{ backgroundColor: AZUL }}
              >
                {t.titulo}
              </h3>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {t.columnas.map((c, ci) => (
                      <th
                        key={ci}
                        className="border border-neutral-300 px-2 py-1.5 font-semibold text-left"
                        style={{ backgroundColor: `${DORADO}22`, color: "#5b4a00" }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.filas.map((fila, fi) => (
                    <tr key={fi} className={fi % 2 ? "bg-neutral-50" : "bg-white"}>
                      {fila.map((celda, cei) => (
                        <td
                          key={cei}
                          className={`border border-neutral-300 px-2 py-1 ${
                            cei === 0 ? "font-medium text-neutral-900" : "text-center"
                          }`}
                        >
                          {celda === "" || celda === undefined ? "—" : celda}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {t.total && (
                  <tfoot>
                    <tr className="text-white font-semibold" style={{ backgroundColor: AZUL }}>
                      {t.total.map((celda, ci) => (
                        <td
                          key={ci}
                          className={`border px-2 py-1.5 ${ci === 0 ? "text-left" : "text-center"}`}
                          style={{ borderColor: AZUL }}
                        >
                          {celda}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ))
      )}
    </div>

    {/* Pie */}
    <div className="mt-8 pt-3 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-400">
      <span>Polarier · Control de almacén</span>
      <span>Generado el {new Date().toLocaleDateString("es-ES")}</span>
    </div>
  </div>
);

export default InformePreview;
