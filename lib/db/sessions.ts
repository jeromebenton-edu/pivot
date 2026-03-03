import { randomUUID } from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('sessions');

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

// In-memory fallback when Supabase is not configured
// Capped to prevent OOM (#R8-8)
const MAX_MEMORY_SESSIONS = 1000;
const memoryStore: { sessions: Session[]; counter: number } = { sessions: [], counter: 0 };

export async function createSession(userId: string, title?: string): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    const session: Session = {
      id: randomUUID(), // Use cryptographic IDs to prevent enumeration (#R8-21)
      user_id: userId,
      title: title || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Evict oldest if at capacity (#R8-8)
    if (memoryStore.sessions.length >= MAX_MEMORY_SESSIONS) {
      memoryStore.sessions.shift();
    }
    memoryStore.sessions.push(session);
    return session;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from('sessions')
    .insert({ user_id: userId, title: title || null })
    .select()
    .single();

  if (error) { log.error('createSession error', { error: error.message }); return null; }
  return data;
}

export async function listSessions(userId: string): Promise<Session[]> {
  if (!isSupabaseConfigured()) {
    return memoryStore.sessions
      .filter(s => s.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) { log.error('listSessions error', { error: error.message }); return []; }
  return data || [];
}

// userId param for defense-in-depth ownership check at DB layer (#R9-4)
export async function getSession(sessionId: string, userId?: string): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    return memoryStore.sessions.find(s => s.id === sessionId && (!userId || s.user_id === userId)) || null;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  let query = db
    .from('sessions')
    .select('*')
    .eq('id', sessionId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.single();

  if (error) { log.error('getSession error', { error: error.message }); return null; }
  return data;
}

// userId param for defense-in-depth ownership check at DB layer (#R8-6)
export async function updateSessionTitle(sessionId: string, title: string, userId?: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const session = memoryStore.sessions.find(s => s.id === sessionId && (!userId || s.user_id === userId));
    if (session) { session.title = title; session.updated_at = new Date().toISOString(); }
    return;
  }

  const db = getSupabaseAdmin();
  if (!db) return;

  let query = db
    .from('sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;

  if (error) log.error('updateSessionTitle error', { error: error.message });
}

// userId param for defense-in-depth ownership check at DB layer (#R8-7)
export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    memoryStore.sessions = memoryStore.sessions.filter(s => !(s.id === sessionId && (!userId || s.user_id === userId)));
    return;
  }

  const db = getSupabaseAdmin();
  if (!db) return;

  let query = db
    .from('sessions')
    .delete()
    .eq('id', sessionId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;

  if (error) log.error('deleteSession error', { error: error.message });
}
