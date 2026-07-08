import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderOpen,
  Clock,
  Settings,
  Paperclip,
  Send,
  Upload,
  ArrowRight,
  Search,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getLatestChat, createChat, Chat } from "@/services/chat";
import { getDocuments } from "@/services/storage";
import polarierLogo from "@/assets/polarier-logo.png";

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/octet-stream",
];

// ZIP/RAR llegan con file.type vacío o genérico: aceptamos también por extensión.
const ALLOWED_EXTENSIONS = /\.(pdf|xlsx|doc|docx|zip|rar)$/i;

interface GridOption {
  label: string;
  description: string;
  icon: typeof Search;
  action?: "upload";
  path?: string;
}

const gridOptions: GridOption[] = [
  {
    label: "Analizar documento",
    description: "Sube y analiza con IA",
    icon: Search,
    action: "upload",
  },
  {
    label: "Mis Documentos",
    description: "Gestiona tus archivos",
    icon: FolderOpen,
    path: "/documents",
  },
  {
    label: "Historial",
    description: "Conversaciones anteriores",
    icon: Clock,
    path: "/history",
  },
  {
    label: "Configuración",
    description: "Perfil y preferencias",
    icon: Settings,
    path: "/settings",
  },
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "📄";
  if (ext === "xlsx" || ext === "xls") return "📊";
  if (ext === "doc" || ext === "docx") return "📝";
  return "📎";
};

const Lobby = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [latestChat, setLatestChat] = useState<Chat | null>(null);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const userName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Usuario";

  useEffect(() => {
    getLatestChat().then(setLatestChat).catch(() => {});
    getDocuments()
      .then((docs) => setRecentDocs(docs.slice(0, 5)))
      .catch(() => {});
    // Auto-focus input
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = query.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const chat = await createChat("Nueva conversación");
      navigate(`/chat/${chat.id}`, { state: { initialMessage: trimmed } });
    } catch {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSend();
  };

  const openFilePicker = () => {
    fileRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_DOC_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
      alert("Solo se permiten archivos PDF, XLSX, DOC, DOCX, ZIP y RAR");
      return;
    }
    setSending(true);
    try {
      const chat = await createChat("Nueva conversación");
      navigate(`/chat/${chat.id}`, { state: { initialFile: file } });
    } catch {
      setSending(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleGridClick = (opt: (typeof gridOptions)[number]) => {
    if (opt.action === "upload") {
      openFilePicker();
    } else if (opt.path) {
      navigate(opt.path);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.xlsx,.doc,.docx,.zip,.rar"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="max-w-2xl mx-auto px-4 pt-16 pb-10 flex flex-col gap-8">
        {/* ── HERO ── */}
        <section className="flex flex-col items-center text-center gap-2">
          <img src={polarierLogo} alt="Polarier" className="h-16" />
          <p
            className="text-[11px] sm:text-xs mt-1 flex flex-wrap justify-center items-center gap-x-1.5 gap-y-0.5 max-w-md"
            style={{ fontFamily: "'Poppins', sans-serif", fontStyle: "italic", fontWeight: 300, color: 'hsl(39 76% 60%)' }}
          >
            <span>Excelencia</span>
            <span className="text-base leading-none" style={{ color: 'hsl(39 76% 60%)' }}>·</span>
            <span>Proactividad</span>
            <span className="text-base leading-none" style={{ color: 'hsl(39 76% 60%)' }}>·</span>
            <span>Innovación</span>
            <span className="text-base leading-none" style={{ color: 'hsl(39 76% 60%)' }}>·</span>
            <span>Compromiso</span>
            <span className="text-base leading-none" style={{ color: 'hsl(39 76% 60%)' }}>·</span>
            <span>Orientación al Cliente</span>
            <span className="text-base leading-none" style={{ color: 'hsl(39 76% 60%)' }}>·</span>
            <span>Responsabilidad Ambiental</span>
          </p>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-6">
            ¿Qué quieres hacer hoy?
          </h1>
          <p className="text-sm text-muted-foreground">
            Analiza documentos o haz cualquier pregunta
          </p>
        </section>

        {/* ── INPUT PRINCIPAL (dominante) ── */}
        <section className="w-full mt-2">
          <div className="relative flex items-center bg-card border-2 border-border rounded-2xl shadow-lg focus-within:border-ring focus-within:shadow-xl transition-all">
            <button
              onClick={openFilePicker}
              disabled={sending}
              className="pl-3 sm:pl-5 pr-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Adjuntar archivo"
            >
              <Paperclip size={20} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Escribe tu pregunta..."
              className="flex-1 min-w-0 bg-transparent py-3.5 sm:py-5 px-2 sm:px-3 text-sm sm:text-base outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!query.trim() || sending}
              className="mr-2 sm:mr-3 w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-secondary flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              <Send size={20} className="text-secondary-foreground" />
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Pulsa Enter para enviar · Formatos: PDF, XLSX, DOC, DOCX
          </p>
        </section>

        {/* ── GRID DE OPCIONES (terciario) ── */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {gridOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleGridClick(opt)}
                className="flex flex-col items-center gap-1 p-3 bg-card/70 rounded-lg border border-border/60 hover:bg-card hover:shadow-sm hover:border-secondary/30 transition-all text-center"
              >
                <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                  <opt.icon size={15} className="text-secondary" />
                </div>
                <span className="text-[11px] font-medium text-foreground leading-tight">
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── CONTINUAR DONDE LO DEJASTE ── */}
        {latestChat && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Continuar donde lo dejaste
            </h2>
            <button
              onClick={() => navigate(`/chat/${latestChat.id}`)}
              className="w-full flex items-center justify-between gap-3 p-3.5 bg-card rounded-xl border border-border hover:shadow-md hover:border-secondary/40 transition-all text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare size={14} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {latestChat.title || "Sin título"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(latestChat.created_at).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-secondary shrink-0">
                Continuar <ArrowRight size={14} />
              </span>
            </button>
          </section>
        )}

        {/* ── DOCUMENTOS RECIENTES ── */}
        {recentDocs.length > 0 && (
          <section className="pb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Documentos recientes
              </h2>
              <button
                onClick={() => navigate("/documents")}
                className="text-xs text-secondary hover:underline"
              >
                Ver todos
              </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="min-w-[150px] max-w-[180px] shrink-0 flex flex-col gap-1 p-3 bg-card rounded-lg border border-border hover:shadow-sm transition-shadow"
                >
                  <span className="text-lg leading-none">{fileIcon(doc.file_name)}</span>
                  <p className="text-[11px] font-medium text-foreground truncate">
                    {doc.file_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(doc.size_bytes)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Lobby;
