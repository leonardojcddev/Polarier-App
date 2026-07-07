import { useState, useCallback } from "react";
import { Download, X, FileText, FileSpreadsheet, FileArchive, File } from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import BotAvatar from "@/components/BotAvatar";

const withDownloadParam = (url: string, fileName: string) => {
  try {
    const u = new URL(url);
    u.searchParams.set("download", fileName);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}download=${encodeURIComponent(fileName)}`;
  }
};

interface ChatMessageProps {
  sender: "bot" | "user";
  text: string;
  time: string;
  initial?: string;
  avatarUrl?: string | null;
}

type Parsed =
  | { kind: "text"; text: string }
  | { kind: "audio"; url: string; mime: string }
  | { kind: "image"; url: string; mime: string }
  | { kind: "file"; url: string; ext: string; label: string };

const parseMessage = (raw: string): Parsed => {
  const audioMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)\{\.audio-player\|([^}]+)\}$/);
  if (audioMatch) {
    return { kind: "audio", url: audioMatch[2], mime: audioMatch[3] };
  }
  const imageMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)\{\.image\|([^}]+)\}$/);
  if (imageMatch) {
    return { kind: "image", url: imageMatch[2], mime: imageMatch[3] };
  }
  const fileMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)\{\.file-download\|([^}]+)\}$/);
  if (fileMatch) {
    return { kind: "file", label: fileMatch[1], url: fileMatch[2], ext: fileMatch[3] };
  }
  return { kind: "text", text: raw };
};

const ImageThumb = ({ url }: { url: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block rounded-lg overflow-hidden max-w-[260px] sm:max-w-xs hover:opacity-90 transition-opacity"
      >
        <img src={url} alt="Imagen" className="w-full h-auto object-cover" loading="lazy" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <img
            src={url}
            alt="Imagen ampliada"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

const ChatMessage = ({ sender, text, time, initial = "U", avatarUrl }: ChatMessageProps) => {
  const parsed = parseMessage(text);

  // Audio: burbuja compacta estilo WhatsApp, el avatar va dentro del reproductor.
  if (parsed.kind === "audio") {
    const bubbleClass =
      sender === "bot"
        ? "bg-muted rounded-xl rounded-tl-sm px-3 py-2"
        : "bg-secondary/20 rounded-xl rounded-tr-sm px-3 py-2";
    return (
      <div className={`flex max-w-2xl ${sender === "bot" ? "" : "ml-auto flex-row-reverse"}`}>
        <div className={sender === "bot" ? "" : "text-right"}>
          <div className={bubbleClass}>
            <AudioPlayer
              src={parsed.url}
              sender={sender}
              initial={initial}
              avatarUrl={avatarUrl}
              botAvatarSrc={sender === "bot" ? "bot" : undefined}
            />
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">{time}</span>
        </div>
      </div>
    );
  }

  let body: JSX.Element;
  if (parsed.kind === "file") {
    const ext = parsed.ext.toLowerCase();
    const FileIcon =
      ext === "pdf" ? FileText :
      ext === "xlsx" || ext === "xls" ? FileSpreadsheet :
      ext === "docx" || ext === "doc" ? FileText :
      ext === "zip" || ext === "rar" ? FileArchive :
      File;
    const iconColor =
      ext === "pdf" ? "text-red-400" :
      ext === "xlsx" || ext === "xls" ? "text-green-400" :
      ext === "docx" || ext === "doc" ? "text-blue-400" :
      "text-muted-foreground";
    const fileName = parsed.label;
    const fileUrl = parsed.url;
    const handleDownload = useCallback(() => {
      const downloadUrl = withDownloadParam(fileUrl, fileName);
      window.open(downloadUrl, "_system");
    }, [fileUrl, fileName]);
    body = (
      <button
        type="button"
        onClick={handleDownload}
        className="flex items-center gap-3 min-w-[220px] max-w-[280px] group text-left"
      >
        {/* Icono del tipo de archivo */}
        <div className="w-12 h-12 rounded-xl bg-background/40 border border-border/60 flex items-center justify-center shrink-0">
          <FileIcon size={26} className={iconColor} />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight">{parsed.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase">{parsed.ext}</p>
        </div>
        {/* Botón descarga */}
        <div className="w-8 h-8 rounded-full bg-secondary/60 group-hover:bg-secondary flex items-center justify-center shrink-0 transition-colors">
          <Download size={15} className="text-secondary-foreground" />
        </div>
      </button>
    );
  } else if (parsed.kind === "image") {
    body = <ImageThumb url={parsed.url} />;
  } else {
    body = <span className="whitespace-pre-wrap">{parsed.text}</span>;
  }

  const bubblePadding = parsed.kind === "image" ? "p-1.5" : parsed.kind === "file" ? "p-3" : "px-4 py-3";

  if (sender === "bot") {
    return (
      <div className="flex gap-3 max-w-2xl">
        <div className="w-8 h-8 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center overflow-hidden">
          <BotAvatar className="w-5 h-5" />
        </div>
        <div>
          <div className={`bg-muted rounded-xl rounded-tl-sm text-sm text-foreground ${bubblePadding}`}>
            {body}
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 max-w-2xl ml-auto flex-row-reverse">
      <div className="w-8 h-8 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-xs font-bold text-secondary-foreground overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="text-right">
        <div className={`bg-secondary/20 rounded-xl rounded-tr-sm text-sm text-foreground ${bubblePadding}`}>
          {body}
        </div>
        <span className="text-xs text-muted-foreground mt-1 block">{time}</span>
      </div>
    </div>
  );
};

export default ChatMessage;
