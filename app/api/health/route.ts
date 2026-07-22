import { NextResponse } from 'next/server';
import { isEnvironmentValid } from '@/lib/env';
import { checkDBHealth } from '@/lib/db/supply-chain';
import { createLogger } from '@/lib/logger';
import { getProviderHealth, type ProviderHealth } from '@/lib/llm-health';
import type { LLMProvider } from '@/lib/llm-client';

const log = createLogger('health');

const FORECAST_SERVICE_URL = process.env.FORECAST_SERVICE_URL || 'http://localhost:8001';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    environment: boolean;
    database: boolean;
    forecast: boolean;
    llm: boolean;
    timestamp: string;
  };
  providers: Record<LLMProvider, ProviderHealth>;
}

export async function GET() {
  const checks = {
    environment: false,
    database: false,
    forecast: false,
    llm: false,
    timestamp: new Date().toISOString(),
  };

  // Circuit-breaker state — reflects real call outcomes, not a probe (#R9)
  const rawProviders = getProviderHealth();
  checks.llm = Object.values(rawProviders).some(p => p.available);

  // This endpoint is unauthenticated — upstream error strings can echo key
  // fragments and account details, so only expose them outside production.
  const exposeReason = process.env.NODE_ENV !== 'production';
  const providers = Object.fromEntries(
    Object.entries(rawProviders).map(([name, p]) => [
      name,
      { ...p, reason: exposeReason ? p.reason : null },
    ]),
  ) as Record<LLMProvider, ProviderHealth>;

  try {
    checks.environment = isEnvironmentValid();
  } catch {
    log.warn('Environment check failed');
  }

  // Database check — active probe, not the lazy-init latch (#R9)
  checks.database = await checkDBHealth();

  // Forecast service check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${FORECAST_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    checks.forecast = res.ok;
  } catch {
    checks.forecast = false;
  }

  // Environment and at least one usable LLM provider are required; database and
  // forecast are optional (app works with fallbacks)
  const status: HealthCheck['status'] = checks.environment && checks.llm
    ? (checks.database && checks.forecast ? 'ok' : 'degraded')
    : 'down';

  const response: HealthCheck = { status, checks, providers };

  return NextResponse.json(response, {
    status: status === 'down' ? 503 : 200,
  });
}
