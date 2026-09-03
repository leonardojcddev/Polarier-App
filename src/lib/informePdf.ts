// -----------------------------------------------------------------------------
// Generación del PDF del informe en el cliente (jsPDF + autotable).
//
// Reconstruye el diseño Polarier de InformePreview como PDF vectorial (texto
// seleccionable, no imagen). Consume la misma estructura `Informe` que la vista
// previa, así que ambos comparten la fuente de datos (src/lib/informe.ts).
// -----------------------------------------------------------------------------
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import polarierLogo from "@/assets/polarier-logo.png";
import type { Informe } from "@/lib/informe";
import { nombreArchivoInforme } from "@/lib/informe";

const AZUL: [number, number, number] = [30, 58, 138]; // #1e3a8a
const DORADO_BG: [number, number, number] = [245, 240, 220]; // dorado muy suave para cabeceras
const DORADO_TX: [number, number, number] = [91, 74, 0];
const GRIS: [number, number, number] = [110, 110, 110];

// Carga un asset (URL de Vite) a dataURL PNG para incrustarlo en el PDF.
//
// Se resuelve a `null` si algo va mal: el PDF sale sin logo, que es mejor que no
// salir. El temporizador existe porque si la imagen no dispara ni `onload` ni
// `onerror` (pasa en entornos sin carga real de imágenes, y podría pasar con un
// asset roto) la promesa se quedaría pendiente para siempre y el botón girando.
const LOGO_TIMEOUT_MS = 3000;

const cargarLogo = (): Promise<{ data: string; w: number; h: number } | null> =>
  new Promise((resolve) => {
    let resuelto = false;
    const acabar = (v: { data: string; w: number; h: number } | null) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve(v);
    };
    const temporizador = setTimeout(() => acabar(null), LOGO_TIMEOUT_MS);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return acabar(null);
      ctx.drawImage(img, 0, 0);
      try {
        acabar({ data: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
      } catch {
        acabar(null);
      }
    };
    img.onerror = () => acabar(null);
    img.src = polarierLogo;
  });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Construye el documento PDF del informe (jsPDF) sin descargarlo.
 * Devuelve el `doc` para que el llamador elija: `.save()` (descarga),
 * `.output("datauristring" | "blob")`, etc.
 */
export const construirInformePdf = async (informe: Informe): Promise<jsPDF> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // --- Cabecera: logo + título ------------------------------------------------
  const logo = await cargarLogo();
  if (logo) {
    const w = 34;
    const h = (logo.h / logo.w) * w;
    doc.addImage(logo.data, "PNG", margin, y, w, h);
    y += h + 3;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...AZUL);
  doc.text(informe.titulo, margin, y + 4);

  // Fecha + estado alineados a la derecha
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(cap(informe.fechaLabel), pageW - margin, y - (logo ? 4 : 0), { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DORADO_TX);
  doc.text(informe.estado, pageW - margin, y + 1, { align: "right" });

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  const sub = `${informe.polo ? informe.polo + " · " : ""}${informe.hotel}`;
  doc.text(sub, margin, y);
  y += 3;

  // Línea separadora azul
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // --- Datos del parte --------------------------------------------------------
  if (informe.campos.length > 0) {
    doc.setFontSize(9);
    const colW = (pageW - margin * 2) / 3;
    informe.campos.forEach((c, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = margin + col * colW;
      const yy = y + row * 5.5;
      doc.setTextColor(...GRIS);
      doc.setFont("helvetica", "normal");
      const label = `${c.label}: `;
      doc.text(label, x, yy);
      const lw = doc.getTextWidth(label);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.text(c.valor, x + lw, yy);
    });
    y += Math.ceil(informe.campos.length / 3) * 5.5 + 3;
  }

  // --- Secciones de texto -----------------------------------------------------
  // Solo las usa el informe mensual (prosa de la IA). Los partes diarios no
  // traen `secciones`, así que este bloque no les afecta.
  if (informe.secciones?.length) {
    const anchoUtil = pageW - margin * 2;
    const altoPag = doc.internal.pageSize.getHeight();
    // Salta de página si no cabe, dejando hueco al pie.
    const asegurar = (necesario: number) => {
      if (y + necesario > altoPag - 16) {
        doc.addPage();
        y = margin;
      }
    };

    for (const sec of informe.secciones) {
      if (sec.titulo) {
        asegurar(11);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...AZUL);
        doc.text(sec.titulo, margin, y + 4);
        y += 7;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(40, 40, 40);

      for (const parrafo of sec.parrafos ?? []) {
        for (const linea of doc.splitTextToSize(parrafo, anchoUtil) as string[]) {
          asegurar(5);
          doc.text(linea, margin, y + 3.5);
          y += 4.6;
        }
        y += 2;
      }

      for (const vineta of sec.vinetas ?? []) {
        const lineas = doc.splitTextToSize(vineta, anchoUtil - 5) as string[];
        lineas.forEach((linea, i) => {
          asegurar(5);
          if (i === 0) {
            doc.setTextColor(...AZUL);
            doc.text("•", margin + 1, y + 3.5);
            doc.setTextColor(40, 40, 40);
          }
          doc.text(linea, margin + 5, y + 3.5);
          y += 4.6;
        });
        y += 1.5;
      }

      y += 3;
    }
  }

  // --- Tablas -----------------------------------------------------------------
  for (const tabla of informe.tablas) {
    if (tabla.titulo) {
      // Barra de título de sección (vale / categoría)
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        body: [[tabla.titulo]],
        theme: "plain",
        styles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9, cellPadding: 1.6 },
      });
      // @ts-expect-error lastAutoTable lo añade el plugin
      y = doc.lastAutoTable.finalY;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [tabla.columnas],
      body: tabla.filas.map((f) => f.map((c) => (c === "" || c === undefined ? "—" : String(c)))),
      foot: tabla.total ? [tabla.total.map((c) => (c === "" || c === undefined ? "" : String(c)))] : undefined,
      theme: "grid",
      headStyles: { fillColor: DORADO_BG, textColor: DORADO_TX, fontStyle: "bold", fontSize: 8, halign: "center" },
      footStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center" },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
      styles: { cellPadding: 1.4, lineColor: [210, 210, 210], lineWidth: 0.1, overflow: "linebreak" },
      // La primera columna alineada a la izquierda; el resto centrado.
      didParseCell: (data) => {
        if (data.column.index !== 0) data.cell.styles.halign = "center";
      },
    });
    // @ts-expect-error lastAutoTable lo añade el plugin
    y = doc.lastAutoTable.finalY + 5;
  }

  if (informe.tablas.length === 0 && !informe.secciones?.length) {
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text("Este informe no contiene datos.", margin, y + 4);
  }

  // --- Pie en todas las páginas ----------------------------------------------
  const total = doc.getNumberOfPages();
  const generado = new Date().toLocaleDateString("es-ES");
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.setFont("helvetica", "normal");
    doc.text("Polarier · Control de almacén", margin, ph - 8);
    doc.text(`Generado el ${generado}  ·  Página ${p}/${total}`, pageW - margin, ph - 8, { align: "right" });
  }

  return doc;
};

// Nombre de archivo con extensión .pdf.
export const nombrePdf = (informe: Informe, fecha: string): string =>
  `${nombreArchivoInforme(informe, fecha)}.pdf`;

/**
 * Genera el PDF y lanza la descarga directa (el navegador abre su "Guardar
 * como" / lo baja a la carpeta de descargas).
 */
export const descargarInformePdf = async (informe: Informe, fecha: string): Promise<void> => {
  const doc = await construirInformePdf(informe);
  doc.save(nombrePdf(informe, fecha));
};

/**
 * Genera el PDF y lo devuelve como base64 puro (sin el prefijo data:...),
 * listo para enviarlo en JSON a un webhook.
 */
export const informePdfBase64 = async (informe: Informe): Promise<string> => {
  const doc = await construirInformePdf(informe);
  const dataUri = doc.output("datauristring"); // "data:application/pdf;filename=...;base64,XXXX"
  const base64 = dataUri.substring(dataUri.indexOf("base64,") + "base64,".length);
  return base64;
};
