import { betterAuth } from 'better-auth';
import { nextCookies, toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { hasPermission, type Action } from './rbac';
import path from 'path';
import fs from 'fs';

// Block demo mode in production (#R9-2)
if (process.env.DEMO_MODE === 'true') {
  if (process.env.NODE_ENV === 'production') {
    console.error('[Auth] FATAL: DEMO_MODE=true is not allowed in production');
    throw new Error('DEMO_MODE cannot be enabled in production');
  }
  console.warn('[Auth] DEMO_MODE is enabled — demo credentials are active');
}

function createDatabase() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }
  // SQLite fallback for local dev/demo mode
  // better-sqlite3 is an optional dependency (native C++ — unavailable on Vercel)
  let BetterSqlite3;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BetterSqlite3 = require('better-sqlite3');
  } catch {
    throw new Error(
      '[Auth] DATABASE_URL is required in this environment. ' +
      'SQLite fallback (better-sqlite3) is not available.',
    );
  }
  const dataDir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return new BetterSqlite3(path.join(dataDir, 'auth.db'));
}

export const authInstance = betterAuth({
  baseURL: process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  database: createDatabase(),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        defaultValue: 'viewer',
        required: false,
        input: true,
      },
    },
  },
  secret: (() => {
    const secret = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    // Validate secret in deployed environments (VERCEL/RAILWAY/FLY set env vars)
    const isDeployed = !!(process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME);
    if (isDeployed) {
      if (!secret) throw new Error('[Auth] FATAL: BETTER_AUTH_SECRET must be set in production');
      if (secret.length < 32) throw new Error('[Auth] FATAL: BETTER_AUTH_SECRET must be at least 32 characters');
      const knownDefaults = ['dev-secret-change-in-production-32chars!', 'your-secret-here', 'changeme'];
      if (knownDefaults.includes(secret)) {
        throw new Error('[Auth] FATAL: BETTER_AUTH_SECRET is a known default — generate a secure random secret');
      }
    }
    return secret;
  })(),
  plugins: [nextCookies()],
});

export const handlers = toNextJsHandler(authInstance);

// Demo user seeding — runs once on first auth() call.
// Uses HTTP fetch to call the sign-up endpoint (Better Auth's internal API
// requires a full HTTP context that isn't available in server-side calls).
let demoSeeded = false;
async function seedDemoUsers() {
  if (demoSeeded || process.env.DEMO_MODE !== 'true') return;
  demoSeeded = true;

  const baseURL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const users = [
    { email: 'admin@pivot.demo', name: 'Admin User', role: 'admin', password: 'demo1234' },
    { email: 'analyst@pivot.demo', name: 'Sarah Chen', role: 'analyst', password: 'demo1234' },
    { email: 'viewer@pivot.demo', name: 'James Wilson', role: 'viewer', password: 'demo1234' },
  ];

  for (const u of users) {
    try {
      await fetch(`${baseURL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password, name: u.name, role: u.role }),
      });
    } catch {
      // Server not ready yet or user already exists — expected
    }
  }
}

/** Session shape used by requirePermission — matches old NextAuth interface */
interface AuthSession {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

/**
 * Get the current session — drop-in replacement for NextAuth's auth().
 * Uses next/headers to read cookies in both API routes and server components.
 */
export async function auth(): Promise<AuthSession | null> {
  await seedDemoUsers();

  const { headers } = await import('next/headers');
  const hdrs = await headers();

  try {
    const result = await authInstance.api.getSession({ headers: hdrs });
    if (!result?.user) return null;

    const user = result.user as typeof result.user & { role?: string };
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        ...(user.role ? { role: user.role } : {}),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Get the user's role from the session.
 * Returns undefined if no session or role is not set.
 */
export function getUserRole(session: AuthSession | null): string | undefined {
  if (!session?.user) return undefined;
  return (session.user as unknown as { role?: string }).role;
}

/**
 * Check a permission and return a 403 NextResponse if denied.
 * Returns null if the action is allowed.
 */
export function requirePermission(
  session: AuthSession | null,
  action: Action,
): NextResponse | null {
  const role = getUserRole(session);
  if (!hasPermission(role, action)) {
    return NextResponse.json(
      { error: `Insufficient permissions for ${action}` },
      { status: 403 },
    );
  }
  return null;
}
