import { supabase } from '@/lib/supabaseClient';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB

export const uploadAvatar = async (file: File): Promise<string> => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Solo se permiten imágenes (JPG, PNG, WebP, GIF)');
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('La imagen no puede superar 2MB');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const ext = file.name.split('.').pop() || 'png';
  const filePath = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (profileError) throw profileError;

  return avatarUrl;
};

export const uploadDocument = async (
  file: File,
  chatId?: string,
  role: 'user' | 'assistant' = 'user'
): Promise<{
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  role: 'user' | 'assistant';
}> => {
  const isAudio = file.type.startsWith('audio/');
  const isImage = file.type.startsWith('image/');
  if (!isAudio && !isImage && !ALLOWED_DOC_TYPES.includes(file.type)) {
    throw new Error('Solo se permiten archivos PDF, XLSX, DOC, DOCX, audio o imagen');
  }
  const maxSize = isAudio ? MAX_AUDIO_SIZE : MAX_DOC_SIZE;
  if (file.size > maxSize) {
    throw new Error(isAudio ? 'El audio no puede superar 15MB' : 'El archivo no puede superar 20MB');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = role === 'assistant' ? 'assistant' : user.id;
  const filePath = `${prefix === 'assistant' ? `${user.id}/assistant` : user.id}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      chat_id: chatId || null,
      file_name: file.name,
      file_path: filePath,
      mime_type: file.type,
      size_bytes: file.size,
      status: 'uploaded',
      role,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  return data;
};

/**
 * Sube un blob devuelto por el asistente (p. ej. audio TTS, imagen) a Supabase
 * vinculado al chat. Devuelve URL firmada lista para el marker.
 */
export const uploadAssistantBlob = async (
  blob: Blob,
  chatId: string,
  mimeType: string,
  originalName?: string
): Promise<{ id: string; file_path: string; signedUrl: string; mime_type: string; fileName: string }> => {
  const ext = mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('aac') ? 'aac'
    : mimeType.includes('mp4') && mimeType.startsWith('audio/') ? 'm4a'
    : mimeType.includes('png') ? 'png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg'
    : mimeType.includes('webp') ? 'webp'
    : mimeType.includes('gif') ? 'gif'
    : mimeType.includes('pdf') ? 'pdf'
    : mimeType.includes('spreadsheet') || mimeType.includes('xlsx') ? 'xlsx'
    : mimeType.includes('word') || mimeType.includes('docx') ? 'docx'
    : 'bin';
  const fileName = originalName || `assistant-${Date.now()}.${ext}`;
  const file = new File([blob], fileName, { type: mimeType });
  const doc = await uploadDocument(file, chatId, 'assistant');
  const signedUrl = await getSignedDocumentUrl(doc.file_path, 60 * 60 * 24 * 365);
  return { id: doc.id, file_path: doc.file_path, signedUrl, mime_type: doc.mime_type, fileName };
};

export const getDocuments = async (): Promise<any[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('role', 'assistant')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

/**
 * URL firmada de un archivo del bucket 'documents' (privado). Vale 1 hora por defecto.
 */
export const getSignedDocumentUrl = async (filePath: string, expiresInSec = 3600): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, expiresInSec);
  if (error || !data) throw new Error('No se pudo generar URL del archivo');
  return data.signedUrl;
};

export const getSignedDownloadUrl = async (filePath: string, fileName: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 300, { download: fileName });
  if (error || !data) throw new Error('No se pudo generar URL de descarga');
  return data.signedUrl;
};

export const downloadDocument = async (filePath: string, fileName: string): Promise<void> => {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(filePath);
  if (error || !data) throw new Error('No se pudo descargar el documento');

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Borra un documento concreto: primero el archivo del bucket 'documents'
 * y luego su fila en la tabla. Idempotente respecto a Storage (si el archivo
 * ya no existe, la BD igual se limpia).
 */
export const deleteDocument = async (id: string, filePath: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  if (filePath) {
    await supabase.storage.from('documents').remove([filePath]);
  }

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
};

/**
 * Borra todos los documentos (archivos de Storage + filas) asociados a un chat.
 * Usado al eliminar un chat completo.
 */
export const deleteDocumentsByChat = async (chatId: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('chat_id', chatId)
    .eq('user_id', user.id);
  if (error) throw error;
  if (!docs || docs.length === 0) return;

  const filePaths = docs.map((d: any) => d.file_path).filter(Boolean);
  if (filePaths.length > 0) {
    await supabase.storage.from('documents').remove(filePaths);
  }

  const ids = docs.map((d: any) => d.id);
  const { error: delError } = await supabase
    .from('documents')
    .delete()
    .in('id', ids);
  if (delError) throw delError;
};

export const cleanupOldDocuments = async (): Promise<void> => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: oldDocs, error } = await supabase
    .from('documents')
    .select('id, file_path')
    .lt('created_at', sevenDaysAgo.toISOString());

  if (error || !oldDocs || oldDocs.length === 0) return;

  // Delete files from Storage
  const filePaths = oldDocs.map((doc: any) => doc.file_path);
  await supabase.storage.from('documents').remove(filePaths);

  // Delete records from DB
  const ids = oldDocs.map((doc: any) => doc.id);
  await supabase.from('documents').delete().in('id', ids);
};
