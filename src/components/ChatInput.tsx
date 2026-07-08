import { useRef, useState } from "react";
import { Paperclip, Send, Mic } from "lucide-react";
import FilePreviewCard, { PendingFile } from "@/components/FilePreviewCard";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { VoiceRecorder } from "capacitor-voice-recorder";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFileSelect?: (file: File) => void;
  onAudioSend?: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
  pendingFile?: PendingFile | null;
  onRemovePendingFile?: () => void;
  onRetryPendingFile?: () => void;
}

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
];

// ZIP/RAR (y a veces otros) llegan con file.type vacío o genérico:
// aceptamos también por extensión del nombre.
const ALLOWED_EXTENSIONS = /\.(pdf|xlsx|doc|docx|zip|rar)$/i;

const pickAudioMime = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
};

const formatTime = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const ChatInput = ({
  value,
  onChange,
  onSend,
  onFileSelect,
  onAudioSend,
  uploading,
  disabled,
  pendingFile,
  onRemovePendingFile,
  onRetryPendingFile,
}: ChatInputProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_DOC_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
      toast.error("Solo se permiten archivos PDF, XLSX, DOC, DOCX, ZIP y RAR");
      return;
    }
    onFileSelect?.(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const isNative = Capacitor.isNativePlatform();
  const nativeRecordingRef = useRef(false);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= 120) {
          stopRecording();
          return e;
        }
        return e + 1;
      });
    }, 1000);
  };

  const base64ToFile = (base64: string, mimeType: string): File => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mimeType.includes('aac') ? 'aac' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    return new File([bytes], `audio-${Date.now()}.${ext}`, { type: mimeType });
  };

  const startRecording = async () => {
    if (!onAudioSend) return;

    if (isNative) {
      try {
        const can = await VoiceRecorder.canDeviceVoiceRecord();
        if (!can.value) {
          toast.error("Tu dispositivo no soporta grabación de audio");
          return;
        }
        const perm = await VoiceRecorder.hasAudioRecordingPermission();
        if (!perm.value) {
          const req = await VoiceRecorder.requestAudioRecordingPermission();
          if (!req.value) {
            toast.error("Permiso de micrófono denegado");
            return;
          }
        }
        await VoiceRecorder.startRecording();
        nativeRecordingRef.current = true;
        setRecording(true);
        startTimer();
      } catch (err: any) {
        toast.error(err.message || "No se pudo iniciar la grabación");
      }
      return;
    }

    // Web
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Tu navegador no soporta grabación de audio");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stopTracks();
        clearTimer();
        setElapsed(0);
        setRecording(false);
        if (blob.size === 0) return;
        const ext = (recorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a'
          : (recorder.mimeType || 'audio/webm').includes('ogg') ? 'ogg'
          : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
        onAudioSend(file);
      };

      recorder.start();
      setRecording(true);
      startTimer();
    } catch (err: any) {
      toast.error(err.message || "No se pudo acceder al micrófono");
    }
  };

  const stopRecording = async () => {
    if (isNative && nativeRecordingRef.current) {
      try {
        const result = await VoiceRecorder.stopRecording();
        nativeRecordingRef.current = false;
        clearTimer();
        setElapsed(0);
        setRecording(false);
        const { recordDataBase64, mimeType } = result.value || ({} as any);
        if (recordDataBase64) {
          const file = base64ToFile(recordDataBase64, mimeType || 'audio/aac');
          onAudioSend?.(file);
        }
      } catch (err: any) {
        toast.error(err.message || "Error al detener la grabación");
        nativeRecordingRef.current = false;
        clearTimer();
        setElapsed(0);
        setRecording(false);
      }
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = async () => {
    if (isNative && nativeRecordingRef.current) {
      try {
        await VoiceRecorder.stopRecording();
      } catch {}
      nativeRecordingRef.current = false;
      clearTimer();
      setElapsed(0);
      setRecording(false);
      return;
    }
    chunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        stopTracks();
      };
      mediaRecorderRef.current.stop();
    } else {
      stopTracks();
    }
    clearTimer();
    setElapsed(0);
    setRecording(false);
  };

  return (
    <div className="border-t border-border/40 bg-background/70 backdrop-blur-md px-4 py-3 safe-bottom">
      <div className="max-w-3xl mx-auto">
        {pendingFile && (
          <div className="mb-2">
            <FilePreviewCard
              pendingFile={pendingFile}
              onRemove={() => onRemovePendingFile?.()}
              onRetry={() => onRetryPendingFile?.()}
            />
          </div>
        )}

        {recording ? (
          <div className="flex items-center gap-3 bg-card border border-border rounded-full px-4 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-foreground">Grabando {formatTime(elapsed)}</span>
            <div className="flex-1" />
            <button
              onClick={cancelRecording}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={stopRecording}
              className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:opacity-90 transition-opacity"
              title="Enviar audio"
            >
              <Send size={16} className="text-secondary-foreground" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xlsx,.doc,.docx,.zip,.rar"
              className="hidden"
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Adjuntar archivo"
            >
              <Paperclip size={20} />
            </button>
            <input
              type="text"
              placeholder="Escribe tu mensaje o graba un audio..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSend()}
              disabled={disabled}
              className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            {onAudioSend && !value.trim() ? (
              <button
                onClick={startRecording}
                disabled={disabled}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                title="Grabar audio"
              >
                <Mic size={16} className="text-secondary-foreground" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={disabled}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                title="Enviar"
              >
                <Send size={16} className="text-secondary-foreground" />
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-2">
          Formatos soportados: PDF, XLSX, DOC, DOCX, audio
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
