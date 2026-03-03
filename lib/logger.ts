/**
 * Structured logger.
 *
 * JSON output in production, pretty-printed in development.
 * Use `createLogger(module)` to get a logger scoped to a module name.
 * Use `withRequestId(id)` to create a child logger with request correlation.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  msg: string;
  requestId?: string;
  [key: string]: unknown;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatEntry(entry: LogEntry): string {
  if (IS_PRODUCTION) {
    return JSON.stringify(entry);
  }
  // Dev: pretty format
  const { level, module, msg, requestId, ...extra } = entry;
  const prefix = `[${level.toUpperCase()}] [${module}]`;
  const rid = requestId ? ` (req:${requestId})` : '';
  const extraStr = Object.keys(extra).length > 0 ? ' ' + JSON.stringify(extra) : '';
  return `${prefix}${rid} ${msg}${extraStr}`;
}

function emit(entry: LogEntry) {
  const line = formatEntry(entry);
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      if (!IS_PRODUCTION) console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  withRequestId(requestId: string): Logger;
}

export function createLogger(module: string, requestId?: string): Logger {
  const log = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    emit({ level, module, msg, ...(requestId ? { requestId } : {}), ...extra });
  };

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    withRequestId: (rid: string) => createLogger(module, rid),
  };
}
