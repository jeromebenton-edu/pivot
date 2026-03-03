import { NextResponse } from 'next/server';
import { isEnvironmentValid } from '@/lib/env';
import { isDBAvailable } from '@/lib/db/supply-chain';
import { createLogger } from '@/lib/logger';

const log = createLogger('health');

const FORECAST_SERVICE_URL = process.env.FORECAST_SERVICE_URL || 'http://localhost:8001';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    environment: boolean;
    database: boolean;
    forecast: boolean;
    timestamp: string;
  };
}

export async function GET() {
  const checks = {
    environment: false,
    database: false,
    forecast: false,
    timestamp: new Date().toISOString(),
  };

  try {
    checks.environment = isEnvironmentValid();
  } catch {
    log.warn('Environment check failed');
  }

  // Database check
  checks.database = isDBAvailable();

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

  // Environment is required; database and forecast are optional (app works with fallbacks)
  const status: HealthCheck['status'] = checks.environment
    ? (checks.database && checks.forecast ? 'ok' : 'degraded')
    : 'down';

  const response: HealthCheck = { status, checks };

  return NextResponse.json(response, {
    status: status === 'down' ? 503 : 200,
  });
}
