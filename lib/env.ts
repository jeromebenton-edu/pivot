/**
 * Environment variable validation and configuration
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('env');

export interface EnvironmentConfig {
  ANTHROPIC_API_KEY?: string;  // Now optional since we can use OpenAI
  OPENAI_API_KEY?: string;      // OpenAI API key
  NEXT_PUBLIC_BASE_URL: string;
  CHROMA_CLOUD_URL?: string;
  CHROMA_API_KEY?: string;
  CHROMA_COLLECTION_NAME?: string;
  VOYAGE_API_KEY?: string;
  DATABASE_URL?: string;        // PostgreSQL connection string for SQL layer
}

class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/**
 * Validates required environment variables
 */
export function validateEnvironment(): EnvironmentConfig {
  // At least one LLM API key is required
  // Basic format validation to catch placeholder values (#20 R6)
  const openAIKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!openAIKey && openAIKey.startsWith('sk-') && openAIKey.length > 20;
  const hasAnthropic = !!anthropicKey && anthropicKey.startsWith('sk-ant-') && anthropicKey.length > 20;

  if (!hasOpenAI && !hasAnthropic) {
    throw new EnvironmentError(
      'Missing required LLM API key: Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be set'
    );
  }

  // In production, prefer VERCEL_URL if NEXT_PUBLIC_BASE_URL is not set (#33)
  let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = 'http://localhost:3000';
      if (process.env.NODE_ENV === 'production') {
        log.warn('NEXT_PUBLIC_BASE_URL not set in production — defaulting to localhost');
      }
    }
  }

  // Only return keys that pass format validation — prevents downstream from using
  // truthy but invalid placeholder values like "your-key-here" (#4 R7)
  return {
    ANTHROPIC_API_KEY: hasAnthropic ? anthropicKey : undefined,
    OPENAI_API_KEY: hasOpenAI ? openAIKey : undefined,
    NEXT_PUBLIC_BASE_URL: baseUrl,
    CHROMA_CLOUD_URL: process.env.CHROMA_CLOUD_URL,
    CHROMA_API_KEY: process.env.CHROMA_API_KEY,
    CHROMA_COLLECTION_NAME: process.env.CHROMA_COLLECTION_NAME,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  };
}

/**
 * Get validated environment config with caching
 */
// Use globalThis to survive HMR in dev mode (#R8)
const globalEnv = globalThis as unknown as { __pivotCachedConfig?: EnvironmentConfig | null };
if (globalEnv.__pivotCachedConfig === undefined) globalEnv.__pivotCachedConfig = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!globalEnv.__pivotCachedConfig) {
    try {
      globalEnv.__pivotCachedConfig = validateEnvironment();
    } catch (error) {
      log.error('Environment validation failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return globalEnv.__pivotCachedConfig;
}

/**
 * Check if environment is properly configured
 */
// Use cached config to stay consistent with getEnvironmentConfig() (#20)
export function isEnvironmentValid(): boolean {
  try {
    getEnvironmentConfig();
    return true;
  } catch {
    return false;
  }
}