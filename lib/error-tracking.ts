/**
 * Thin error tracking wrapper.
 *
 * Uses Sentry when SENTRY_DSN is configured, otherwise falls back to
 * the structured logger. This avoids a hard dependency on @sentry/nextjs.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('error-tracking');

let sentryModule: { captureException: (e: unknown) => void; captureMessage: (msg: string) => void } | null = null;
let initAttempted = false;

async function getSentry() {
  if (initAttempted) return sentryModule;
  initAttempted = true;

  if (!process.env.SENTRY_DSN) return null;

  try {
    // Dynamic import — @sentry/nextjs is optional
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — Package is optional and may not be installed
    const sentry = await import('@sentry/nextjs');
    sentryModule = sentry;
    return sentry;
  } catch {
    log.warn('Sentry not installed — falling back to logger');
    return null;
  }
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const sentry = await getSentry();
  if (sentry) {
    sentry.captureException(error);
  }
  // Always log regardless of Sentry
  log.error('Captured exception', {
    error: error instanceof Error ? error.message : String(error),
    ...context,
  });
}

export async function captureMessage(message: string, context?: Record<string, unknown>): Promise<void> {
  const sentry = await getSentry();
  if (sentry) {
    sentry.captureMessage(message);
  }
  log.info('Captured message', { message, ...context });
}
