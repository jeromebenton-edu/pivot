import { randomUUID } from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';
import type { Dashboard, DashboardWidget } from '@/lib/types';

const log = createLogger('dashboards');

// In-memory fallback when Supabase is not configured
const MAX_MEMORY_DASHBOARDS = 200;
const memoryStore: { dashboards: Dashboard[] } = { dashboards: [] };

export async function createDashboard(
  userId: string,
  title: string,
  widgets: DashboardWidget[] = [],
): Promise<Dashboard | null> {
  const now = new Date().toISOString();
  const dashboard: Dashboard = {
    id: randomUUID(),
    user_id: userId,
    title,
    widgets,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured()) {
    if (memoryStore.dashboards.length >= MAX_MEMORY_DASHBOARDS) {
      memoryStore.dashboards.shift();
    }
    memoryStore.dashboards.push(dashboard);
    return dashboard;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from('dashboards')
    .insert({
      user_id: userId,
      title,
      widgets: JSON.stringify(widgets),
    })
    .select()
    .single();

  if (error) {
    log.error('createDashboard error', { error: error.message });
    return null;
  }
  return { ...data, widgets: JSON.parse(data.widgets || '[]') };
}

export async function listDashboards(userId: string): Promise<Dashboard[]> {
  if (!isSupabaseConfigured()) {
    return memoryStore.dashboards
      .filter(d => d.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data, error } = await db
    .from('dashboards')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    log.error('listDashboards error', { error: error.message });
    return [];
  }
  return (data || []).map(d => ({ ...d, widgets: JSON.parse(d.widgets || '[]') }));
}

export async function getDashboard(dashboardId: string, userId?: string): Promise<Dashboard | null> {
  if (!isSupabaseConfigured()) {
    return memoryStore.dashboards.find(
      d => d.id === dashboardId && (!userId || d.user_id === userId)
    ) || null;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  let query = db.from('dashboards').select('*').eq('id', dashboardId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.single();

  if (error) {
    log.error('getDashboard error', { error: error.message });
    return null;
  }
  return { ...data, widgets: JSON.parse(data.widgets || '[]') };
}

export async function updateDashboard(
  dashboardId: string,
  updates: { title?: string; widgets?: DashboardWidget[] },
  userId?: string,
): Promise<Dashboard | null> {
  if (!isSupabaseConfigured()) {
    const dash = memoryStore.dashboards.find(
      d => d.id === dashboardId && (!userId || d.user_id === userId)
    );
    if (!dash) return null;
    if (updates.title !== undefined) dash.title = updates.title;
    if (updates.widgets !== undefined) dash.widgets = updates.widgets;
    dash.updated_at = new Date().toISOString();
    return dash;
  }

  const db = getSupabaseAdmin();
  if (!db) return null;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.widgets !== undefined) updateData.widgets = JSON.stringify(updates.widgets);

  let query = db.from('dashboards').update(updateData).eq('id', dashboardId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.select().single();

  if (error) {
    log.error('updateDashboard error', { error: error.message });
    return null;
  }
  return { ...data, widgets: JSON.parse(data.widgets || '[]') };
}

export async function deleteDashboard(dashboardId: string, userId?: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const before = memoryStore.dashboards.length;
    memoryStore.dashboards = memoryStore.dashboards.filter(
      d => !(d.id === dashboardId && (!userId || d.user_id === userId))
    );
    return memoryStore.dashboards.length < before;
  }

  const db = getSupabaseAdmin();
  if (!db) return false;

  let query = db.from('dashboards').delete().eq('id', dashboardId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;

  if (error) {
    log.error('deleteDashboard error', { error: error.message });
    return false;
  }
  return true;
}
