/**
 * Environment variable validation and configuration
 */

export interface EnvironmentConfig {
  ANTHROPIC_API_KEY?: string;  // Now optional since we can use OpenAI
  OPENAI_API_KEY?: string;      // OpenAI API key
  NEXT_PUBLIC_BASE_URL: string;
  CHROMA_CLOUD_URL?: string;
  CHROMA_API_KEY?: string;
  CHROMA_COLLECTION_NAME?: string;
  VOYAGE_API_KEY?: string;
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
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!hasOpenAI && !hasAnthropic) {
    throw new EnvironmentError(
      'Missing required LLM API key: Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be set'
    );
  }

  const required: (keyof EnvironmentConfig)[] = [
    // No longer requiring specific keys since we can use either LLM
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new EnvironmentError(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    CHROMA_CLOUD_URL: process.env.CHROMA_CLOUD_URL,
    CHROMA_API_KEY: process.env.CHROMA_API_KEY,
    CHROMA_COLLECTION_NAME: process.env.CHROMA_COLLECTION_NAME,
    VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  };
}

/**
 * Get validated environment config with caching
 */
let cachedConfig: EnvironmentConfig | null = null;

export function getEnvironmentConfig(): EnvironmentConfig {
  if (!cachedConfig) {
    try {
      cachedConfig = validateEnvironment();
    } catch (error) {
      console.error('Environment validation failed:', error);
      throw error;
    }
  }
  return cachedConfig;
}

/**
 * Check if environment is properly configured
 */
export function isEnvironmentValid(): boolean {
  try {
    validateEnvironment();
    return true;
  } catch {
    return false;
  }
}