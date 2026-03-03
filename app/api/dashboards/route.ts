import { NextRequest, NextResponse } from 'next/server';
import { auth, requirePermission } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import {
  createDashboard,
  listDashboards,
  getDashboard,
  updateDashboard,
  deleteDashboard,
} from '@/lib/db/dashboards';
import type { DashboardWidget } from '@/lib/types';

const log = createLogger('dashboards-api');

// GET — list dashboards or get a single dashboard by id query param
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dashboardId = req.nextUrl.searchParams.get('id');

  if (dashboardId) {
    const dashboard = await getDashboard(dashboardId, session.user.id);
    if (!dashboard) {
      return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
    }
    return NextResponse.json(dashboard);
  }

  const dashboards = await listDashboards(session.user.id);
  return NextResponse.json(dashboards);
}

// POST — create a new dashboard
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = requirePermission(session, 'export');
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, widgets } = body;
  if (!title || typeof title !== 'string' || title.length > 200) {
    return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
  }

  // Validate widgets array if provided
  if (widgets && !Array.isArray(widgets)) {
    return NextResponse.json({ error: 'Widgets must be an array' }, { status: 400 });
  }

  const dashboard = await createDashboard(
    session.user.id,
    title.trim(),
    widgets as DashboardWidget[] || [],
  );

  if (!dashboard) {
    return NextResponse.json({ error: 'Failed to create dashboard' }, { status: 500 });
  }

  log.info('Dashboard created', { dashboardId: dashboard.id, userId: session.user.id });
  return NextResponse.json(dashboard, { status: 201 });
}

// PUT — update a dashboard
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, title, widgets } = body;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Dashboard ID required' }, { status: 400 });
  }

  const updates: { title?: string; widgets?: DashboardWidget[] } = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || title.length > 200) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }
    updates.title = title.trim();
  }
  if (widgets !== undefined) {
    if (!Array.isArray(widgets)) {
      return NextResponse.json({ error: 'Widgets must be an array' }, { status: 400 });
    }
    updates.widgets = widgets as DashboardWidget[];
  }

  const updated = await updateDashboard(id, updates, session.user.id);
  if (!updated) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE — delete a dashboard
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dashboardId = req.nextUrl.searchParams.get('id');
  if (!dashboardId) {
    return NextResponse.json({ error: 'Dashboard ID required' }, { status: 400 });
  }

  const deleted = await deleteDashboard(dashboardId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
