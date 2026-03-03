import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listSessions, createSession, deleteSession, getSession } from '@/lib/db/sessions';
import { getSessionMessages } from '@/lib/db/messages';
import { createRateLimiter } from '@/lib/rate-limit';

// Rate limiter for session operations (#R8)
const sessionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many session requests. Please wait a moment.',
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await sessionRateLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: rl.message }, { status: 429 });
  }

  const sessions = await listSessions(session.user.id);
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await sessionRateLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: rl.message }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  let { title } = body;
  // Validate title: must be string or undefined, max 200 chars (#R8-5)
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string') {
      return NextResponse.json({ error: 'Title must be a string' }, { status: 400 });
    }
    title = title.slice(0, 200);
  }
  const chatSession = await createSession(session.user.id, title);
  return NextResponse.json({ session: chatSession });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await sessionRateLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: rl.message }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('id');
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  // Verify session ownership before deleting (#7 R7)
  const targetSession = await getSession(sessionId);
  if (!targetSession || targetSession.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  await deleteSession(sessionId, session.user.id);
  return NextResponse.json({ success: true });
}

// GET messages for a specific session
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await sessionRateLimiter(session.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: rl.message }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  // Verify session ownership before reading messages (#7 R7)
  const targetSession = await getSession(sessionId);
  if (!targetSession || targetSession.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const messages = await getSessionMessages(sessionId);
  return NextResponse.json({ messages });
}
