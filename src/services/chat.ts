import { supabase } from '@/lib/supabaseClient';
import { uploadAssistantBlob, deleteDocumentsByChat } from '@/services/storage';
import { getN8nWebhookUrl } from '@/lib/n8nMode';

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export const getChats = async (): Promise<Chat[]> => {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

export const getLatestChat = async (): Promise<Chat | null> => {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const getChatById = async (chatId: string): Promise<Chat | null> => {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw error;
  return data;
};
export const createChat = async (title: string): Promise<Chat> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  const { data, error } = await supabase
    .from('chats')
    .insert({ user_id: user.id, title })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateChatTitle = async (chatId: string, title: string): Promise<void> => {
  const { error } = await supabase
    .from('chats')
    .update({ title })
    .eq('id', chatId);
  if (error) throw error;
};

export const getMessages = async (chatId: string): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const sendMessage = async (
  chatId: string,
  content: string,
  role: 'user' | 'assistant' = 'user'
): Promise<ChatMessage> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ chat_id: chatId, user_id: user.id, role, content })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteChat = async (chatId: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');

  // 1. Documentos del chat: archivos de Storage + filas en la tabla.
  //    (El cascade de la BD nunca borra archivos de Storage, por eso va explícito.)
  await deleteDocumentsByChat(chatId);

  // 2. Mensajes del chat.
  const { error: msgError } = await supabase
    .from('chat_messages')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', user.id);
  if (msgError) throw msgError;

  // 3. El chat.
  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId)
    .eq('user_id', user.id);
  if (error) throw error;
};

export const updateProfile = async (fullName: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);
  if (error) throw error;
};

export const getProfile = async (): Promise<{ full_name: string | null; avatar_url: string | null } | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return null;
  return data;
};

// Recursively extract text content from n8n JSON responses
const extractTextContent = (data: unknown): string | null => {
  if (typeof data === 'string') return data.trim() || null;
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    // If array, try to extract from first element
    if (data.length === 0) return null;
    return extractTextContent(data[0]);
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Audio keys: si n8n devuelve una URL de audio, la convertimos al marker del reproductor
    const audioKeys = ['audio_url', 'audioUrl', 'audio', 'voice_url', 'voiceUrl'];
    for (const key of audioKeys) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        return `[Audio](${val.trim()}){.audio-player|audio/mpeg}`;
      }
    }
    // Image keys: URL de imagen → marker de imagen
    const imageKeys = ['image_url', 'imageUrl', 'image', 'picture', 'photo', 'photo_url'];
    for (const key of imageKeys) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        return `[Imagen](${val.trim()}){.image|image/png}`;
      }
    }
    // Priority keys for text content
    const keys = ['respuesta', 'response', 'message', 'text', 'content', 'output', 'result', 'answer', 'reply'];
    for (const key of keys) {
      if (obj[key] && typeof obj[key] === 'string') return (obj[key] as string).trim();
    }
    // Check nested objects in priority keys
    for (const key of keys) {
      if (obj[key] && typeof obj[key] === 'object') {
        const nested = extractTextContent(obj[key]);
        if (nested) return nested;
      }
    }
    // Fallback: first string value found
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    }
    // Last resort: recurse into first object value
    for (const val of Object.values(obj)) {
      if (typeof val === 'object') {
        const nested = extractTextContent(val);
        if (nested) return nested;
      }
    }
  }
  return null;
};

export const sendToN8n = async (
  chatId: string,
  userId: string,
  message: string,
  role: string,
  fileInfo?: { id: string; file_name: string; file_path: string; mime_type: string; size_bytes: number },
  userName?: string,
  userEmail?: string
): Promise<string | null> => {
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      user_id: userId,
      user_name: userName ?? null,
      user_email: userEmail ?? null,
      message,
      role,
      timestamp: new Date().toISOString(),
    };
    if (fileInfo) {
      payload.file = fileInfo;
    }
    const res = await fetch(getN8nWebhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    
    // Audio response → guardar en Supabase y devolver marker con URL firmada.
    if (contentType.startsWith('audio/')) {
      const blob = await res.blob();
      try {
        const { signedUrl, mime_type } = await uploadAssistantBlob(blob, chatId, contentType);
        return `[Audio](${signedUrl}){.audio-player|${mime_type}}`;
      } catch {
        // Fallback: URL efímera si la subida falla
        const url = URL.createObjectURL(blob);
        return `[Audio](${url}){.audio-player|${contentType}}`;
      }
    }

    // Imagen → guardar en Supabase y devolver marker de imagen
    if (contentType.startsWith('image/')) {
      const blob = await res.blob();
      try {
        const { signedUrl, mime_type } = await uploadAssistantBlob(blob, chatId, contentType);
        return `[Imagen](${signedUrl}){.image|${mime_type}}`;
      } catch {
        const url = URL.createObjectURL(blob);
        return `[Imagen](${url}){.image|${contentType}}`;
      }
    }

    // If response is a file (not JSON/text), save to Supabase and return a download link
    if (contentType.includes('application/pdf') ||
        contentType.includes('application/vnd') ||
        contentType.includes('application/octet-stream')) {
      const blob = await res.blob();
      const ext = contentType.includes('pdf') ? 'pdf' :
                  contentType.includes('spreadsheet') || contentType.includes('xlsx') ? 'xlsx' :
                  contentType.includes('word') || contentType.includes('docx') ? 'docx' : 'file';
      const disposition = res.headers.get('content-disposition') || '';
      const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)["']?/i);
      const fileName = nameMatch?.[1]?.trim() || `archivo.${ext}`;
      try {
        const { signedUrl } = await uploadAssistantBlob(blob, chatId, contentType, fileName);
        return `[${fileName}](${signedUrl}){.file-download|${ext}}`;
      } catch {
        const url = URL.createObjectURL(blob);
        return `[${fileName}](${url}){.file-download|${ext}}`;
      }
    }

    // Leemos el cuerpo como texto primero: así una respuesta 200 con cuerpo
    // vacío (o content-type json sin body) no revienta en res.json().
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(trimmed);
        const extracted = extractTextContent(json);
        return resolveUrlResponse(extracted, chatId);
      } catch {
        // content-type dice json pero el cuerpo no lo es: tratarlo como texto
        return resolveUrlResponse(trimmed, chatId);
      }
    }
    return resolveUrlResponse(trimmed, chatId);
  } catch {
    return null;
  }
};

async function resolveUrlResponse(text: string | null, chatId: string): Promise<string | null> {
  if (!text || !/^https?:\/\/\S+$/.test(text.trim())) return text;
  try {
    const fileRes = await fetch(text.trim());
    if (!fileRes.ok) return text;
    const fileCt = fileRes.headers.get('content-type') || 'application/octet-stream';
    const blob = await fileRes.blob();
    const disposition = fileRes.headers.get('content-disposition') || '';
    const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)["']?/i);
    const urlFileName = text.trim().split('/').pop()?.split('?')[0] || 'archivo';
    const fileName = nameMatch?.[1]?.trim() || urlFileName;
    if (fileCt.startsWith('audio/')) {
      const { signedUrl, mime_type } = await uploadAssistantBlob(blob, chatId, fileCt, fileName);
      return `[Audio](${signedUrl}){.audio-player|${mime_type}}`;
    }
    if (fileCt.startsWith('image/')) {
      const { signedUrl, mime_type } = await uploadAssistantBlob(blob, chatId, fileCt, fileName);
      return `[Imagen](${signedUrl}){.image|${mime_type}}`;
    }
    const { signedUrl } = await uploadAssistantBlob(blob, chatId, fileCt, fileName);
    const ext = fileName.includes('.') ? fileName.split('.').pop()! :
      fileCt.includes('pdf') ? 'pdf' :
      fileCt.includes('xlsx') || fileCt.includes('spreadsheet') ? 'xlsx' :
      fileCt.includes('docx') || fileCt.includes('word') ? 'docx' : 'file';
    return `[${fileName}](${signedUrl}){.file-download|${ext}}`;
  } catch {
    return text;
  }
}
