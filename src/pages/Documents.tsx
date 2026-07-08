import { useState, useEffect } from "react";
import { FileText, FileSpreadsheet, File, Download, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import { getDocuments, downloadDocument, getSignedDownloadUrl, deleteDocument } from "@/services/storage";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Documents = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getDocuments()
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id, deleteTarget.file_path);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success("Documento eliminado");
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el documento");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleDownload = async (doc: any) => {
    setDownloadingId(doc.id);
    try {
      const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
      if (isNative) {
        const url = await getSignedDownloadUrl(doc.file_path, doc.file_name);
        await (window as any).Capacitor.Plugins.Downloader.download({ url, fileName: doc.file_name });
      } else {
        await downloadDocument(doc.file_path, doc.file_name);
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error("Error al descargar el documento");
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="El agente no te ha enviado documentos aún"
        subtitle="Los archivos que te envíe el agente aparecerán aquí."
        buttonLabel="Ir al chat"
        onButtonClick={() => navigate("/chat")}
      />
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return <FileText size={20} className="text-red-400 shrink-0" />;
    if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={20} className="text-green-400 shrink-0" />;
    if (['docx', 'doc'].includes(ext)) return <FileText size={20} className="text-blue-400 shrink-0" />;
    return <File size={20} className="text-muted-foreground shrink-0" />;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold text-foreground mb-6">Mis Documentos</h1>
      <div className="max-w-3xl mx-auto space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {getFileIcon(doc.file_name)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc.id}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="Descargar"
              >
                {downloadingId === doc.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
              </button>
              <button
                onClick={() => setDeleteTarget(doc)}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará "{deleteTarget?.file_name}" de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Documents;
