// -----------------------------------------------------------------------------
// Envío del informe por correo vía webhook de n8n.
//
// La app genera el PDF en el cliente y hace POST (JSON) a un webhook de n8n con
// el PDF en base64 + los datos del correo. El flujo de n8n se encarga del envío
// real (nodo Email/Gmail) con el PDF como adjunto.
//
// Nota: no se envía "desde el correo del usuario logueado" (Supabase Auth no da
// acceso SMTP de su cuenta). `remitente` viaja solo como dato informativo /
// Reply-To; el remitente real lo define la cuenta configurada en n8n.
//
// Config: VITE_N8N_EMAIL_WEBHOOK_URL(_TEST). Ver [[Deploy-Easypanel]].
// -----------------------------------------------------------------------------
import type { Informe } from "@/lib/informe";
import { informePdfBase64, nombrePdf } from "@/lib/informePdf";
import { getN8nEmailWebhookUrl } from "@/lib/n8nMode";

export interface EnvioCorreoParams {
  informe: Informe;
  fecha: string;
  para: string;
  asunto: string;
  mensaje: string;
  remitente: string; // email del usuario logueado (va como Reply-To)
  remitenteNombre?: string; // nombre mostrado del usuario (senderName en Gmail)
}

export const enviarInformePorCorreo = async (params: EnvioCorreoParams): Promise<void> => {
  const url = getN8nEmailWebhookUrl();
  if (!url) {
    throw new Error(
      "Falta configurar el webhook de correo (VITE_N8N_EMAIL_WEBHOOK_URL)."
    );
  }

  const { informe, fecha, para, asunto, mensaje, remitente, remitenteNombre } = params;
  const pdfBase64 = await informePdfBase64(informe);
  const filename = nombrePdf(informe, fecha);

  const payload = {
    para,
    asunto,
    mensaje,
    remitente,
    remitente_nombre: remitenteNombre ?? "",
    // Metadatos útiles para el flujo (asunto por defecto, trazabilidad).
    informe: {
      titulo: informe.titulo,
      hotel: informe.hotel,
      polo: informe.polo ?? null,
      fecha,
      fecha_label: informe.fechaLabel,
      estado: informe.estado,
    },
    // Adjunto: PDF en base64 (sin prefijo data:). En n8n: Convert to File → adjuntar.
    adjunto: {
      filename,
      mime_type: "application/pdf",
      base64: pdfBase64,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("No se pudo contactar con el servicio de correo. Revisa tu conexión.");
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(
      `El servicio de correo respondió con error (${res.status}).${detalle ? " " + detalle.slice(0, 200) : ""}`
    );
  }
};
