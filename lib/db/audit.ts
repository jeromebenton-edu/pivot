import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('audit');

export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// In-memory fallback — capped to prevent OOM (#R9-1)
const MAX_MEMORY_AUDIT = 5000;
const memoryAudit: AuditEntry[] = [];
let auditCounter = 0;

export async function logAuditEvent(
  userId: string,
  action: string,
  details?: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    // Evict oldest if at capacity (#R9-1)
    if (memoryAudit.length >= MAX_MEMORY_AUDIT) {
      memoryAudit.shift();
    }
    memoryAudit.push({
      id: String(++auditCounter),
      user_id: userId,
      action,
      details: details || null,
      ip_address: ipAddress || null,
      created_at: new Date().toISOString(),
    });
    // Log action only — avoid leaking PII from details to stdout (#R10-2)
    log.info(`${userId} - ${action}`);
    return;
  }

  const db = getSupabaseAdmin();
  if (!db) return;

  const { error } = await db
    .from('audit_log')
    .insert({
      user_id: userId,
      action,
      details: details || null,
      ip_address: ipAddress || null,
    });

  if (error) log.error('logAuditEvent error', { error: error.message });
}

export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  if (!isSupabaseConfigured()) {
    return memoryAudit.slice(-limit).reverse();
  }

  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { log.error('getAuditLog error', { error: error.message }); return []; }
  return data || [];
}
