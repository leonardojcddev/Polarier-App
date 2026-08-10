import { useState } from "react";
import { X, Mail, Send, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type { Informe } from "@/lib/informe";
import { enviarInformePorCorreo } from "@/services/informeCorreo";

interface Props {
  informe: Informe;
  fecha: string;
  onClose: () => void;
}

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Modal para enviar el informe por correo. Captura destinatario, asunto y
 * mensaje; el envío lo hace `enviarInformePorCorreo` (POST a webhook n8n con el
 * PDF en base64). Requiere VITE_N8N_EMAIL_WEBHOOK_URL configurada.
 */
const EnviarCorreoModal = ({ informe, fecha, onClose }: Props) => {
  const { user, profile } = useAuth();
  const remitente = user?.email ?? "";
  const remitenteNombre = profile?.full_name || remitente.split("@")[0] || "";

  const [para, setPara] = useState("");
  const [asunto, setAsunto] = useState(`Informe · ${informe.titulo} · ${informe.fechaLabel}`);
  const [mensaje, setMensaje] = useState(
    `Adjunto el informe "${informe.titulo}" de ${informe.hotel} correspondiente al ${informe.fechaLabel}.`
  );
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!emailValido(para)) {
      toast.error("Introduce un correo destino válido");
      return;
    }
    setEnviando(true);
    try {
      await enviarInformePorCorreo({
        informe,
        fecha,
        para: para.trim(),
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        remitente,
        remitenteNombre,
      });
      toast.success("Informe enviado");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "No se pudo enviar el informe");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card shadow-xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail size={16} className="text-primary" /> Enviar informe por correo
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
            <input
              value={remitente}
              disabled
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Para</label>
            <input
              type="email"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="destinatario@correo.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Asunto</label>
            <input
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensaje</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted border border-border px-3 py-2 text-xs text-muted-foreground">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>El informe se adjunta en PDF automáticamente. El correo se envía a tu nombre y las respuestas llegarán a tu dirección ({remitente}).</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || !emailValido(para)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnviarCorreoModal;
