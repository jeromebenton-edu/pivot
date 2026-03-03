/**
 * Stream handler for the chat route.
 *
 * Encapsulates the SSE streaming logic, message persistence, and LLM cache
 * population so the chat route orchestrator stays minimal.
 */

import { createLogger } from '@/lib/logger';
import { createStreamingChatCompletion } from '@/lib/llm-client';
import { llmCache } from '@/lib/cache';
import { saveMessage } from '@/lib/db/messages';
import { getSession as getDbSession } from '@/lib/db/sessions';
import { logAuditEvent } from '@/lib/db/audit';
import type { ForecastResult } from './chart-resolver';

const log = createLogger('stream-handler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface StreamOptions {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  chartConfig: Record<string, unknown> | null;
  sources: Source[];
  forecastPromise: Promise<ForecastResult | null> | null;
  llmCacheKey: string;
  sessionId?: string;
  userId: string;
  latestUserContent: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const FORECAST_TIMEOUT = 10_000;

export function createChatStream(options: StreamOptions): Response {
  const {
    messages, chartConfig, sources, forecastPromise,
    llmCacheKey, sessionId, userId, latestUserContent,
  } = options;

  const encoder = new TextEncoder();
  let clientDisconnected = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        if (clientDisconnected) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          clientDisconnected = true;
        }
      };

      try {
        await createStreamingChatCompletion(
          messages,
          // onChunk
          (text) => {
            send({ type: 'text', content: text });
          },
          // onDone
          async (fullText) => {
            let finalContent = fullText || 'I understand your question. Let me analyze the data for you.';

            // Wait for forecast if started in parallel — with timeout (#11)
            let finalChartConfig = chartConfig;
            if (forecastPromise) {
              const forecastResult = await Promise.race([
                forecastPromise,
                new Promise<null>(resolve => setTimeout(() => resolve(null), FORECAST_TIMEOUT)),
              ]);
              if (forecastResult) {
                finalContent = finalContent + '\n\n' + forecastResult.formattedText;
                finalChartConfig = forecastResult.chartConfig;
                send({ type: 'text', content: '\n\n' + forecastResult.formattedText });
              }
            }

            send({
              type: 'metadata',
              chartConfig: finalChartConfig || null,
              sources: sources.length > 0 ? sources : [],
            });

            // Persist messages — verify session ownership first (#6 R7)
            if (sessionId && userId) {
              getDbSession(sessionId).then(dbSess => {
                if (!dbSess || dbSess.user_id !== userId) {
                  log.warn('Blocked message save: user does not own session', { userId, sessionId });
                  return;
                }
                return Promise.all([
                  saveMessage(sessionId, 'user', latestUserContent),
                  saveMessage(sessionId, 'assistant', finalContent, finalChartConfig, sources.length > 0 ? sources as unknown as Record<string, unknown>[] : null),
                  logAuditEvent(userId, 'chat_query', { query: latestUserContent, sessionId, hasChart: !!finalChartConfig }),
                ]);
              }).catch(err => {
                log.warn('Message persistence failed', { sessionId, error: err?.message || String(err) });
              });
            }

            // Populate LLM cache
            llmCache.set(llmCacheKey, {
              text: finalContent,
              chartConfig: finalChartConfig,
              sources: sources.length > 0 ? sources : [],
            });

            send({ type: 'done' });
            controller.close();
          },
          // onError
          (error) => {
            log.error('LLM streaming error', { error: error instanceof Error ? error.message : String(error) });
            send({ type: 'error', message: 'Failed to generate response' });
            controller.close();
          },
        );
      } catch (error) {
        log.error('Stream setup error', { error: error instanceof Error ? error.message : String(error) });
        send({ type: 'error', message: 'Failed to process request' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
