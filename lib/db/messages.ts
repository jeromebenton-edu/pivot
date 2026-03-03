import { randomUUID } from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('messages');

export interface StoredMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chart_config: Record<string, unknown> | null;
  sources: Record<string, unknown>[] | null;
  created_at: string;
}

// In-memory fallback — capped to prevent OOM (#R8-8)
const MAX_MEMORY_MESSAGES = 10000;
const memoryMessages: StoredMessage[] = [];

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  chartConfig?: Record<string, unknown> | null,
  sources?: Record<string, unknown>[] | null,
): Promise<StoredMessage | null> {
  if (!isSupabaseConfigured()) {
    const msg: StoredMessage = {
      id: randomUUID(), // Cryptographic IDs to prevent enumeration (#R9-8)
      session_id: sessionId,
      role,
      content,
      chart_config: chartConfig || null,
      sources: sources || null,
      created_at: new Date().toISOString(),
    };
    // Evict oldest if at capacity (#R8-8)
    if (memoryMessages.length >= MAX_MEMORY_MESSAGES) {
      memoryMessages.shift();
    }
    memoryMessages.push(msg);
    return msg;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from('messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      chart_config: chartConfig || null,
      sources: sources || null,
    })
    .select()
    .single();

  if (error) { log.error('saveMessage error', { error: error.message }); return null; }
  return data;
}

// Max messages per session to prevent unbounded queries (#R8-4)
const MAX_MESSAGES_PER_SESSION = 500;

// userId scopes queries to the owning user for defense-in-depth (#R10-1)
export async function getSessionMessages(sessionId: string, userId?: string): Promise<StoredMessage[]> {
  if (!isSupabaseConfigured()) {
    return memoryMessages
      .filter(m => m.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, MAX_MESSAGES_PER_SESSION);
  }

  const db = getSupabaseAdmin();
  if (!db) return [];

  // Verify session belongs to user before returning messages
  if (userId) {
    const { data: session } = await db
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();
    if (!session) return [];
  }

  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES_PER_SESSION);

  if (error) { log.error('getSessionMessages error', { error: error.message }); return []; }
  return data || [];
}
