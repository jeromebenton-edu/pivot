import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEnvironment, isEnvironmentValid } from '../env';

const originalEnv = { ...process.env };

beforeEach(() => {
  // Clear the global cached config so each test gets fresh validation
  const g = globalThis as unknown as { __pivotCachedConfig?: unknown };
  g.__pivotCachedConfig = null;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('validateEnvironment', () => {
  it('succeeds with valid OpenAI key', () => {
    process.env.OPENAI_API_KEY = 'sk-test-valid-key-with-enough-length';
    process.env.ANTHROPIC_API_KEY = '';
    const config = validateEnvironment();
    expect(config.OPENAI_API_KEY).toBe('sk-test-valid-key-with-enough-length');
  });

  it('succeeds with valid Anthropic key', () => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-valid-key-with-enough-length';
    const config = validateEnvironment();
    expect(config.ANTHROPIC_API_KEY).toBe('sk-ant-test-valid-key-with-enough-length');
  });

  it('throws when neither key is provided', () => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
    expect(() => validateEnvironment()).toThrow('Missing required LLM API key');
  });

  it('rejects short API keys as placeholders', () => {
    process.env.OPENAI_API_KEY = 'sk-short';
    process.env.ANTHROPIC_API_KEY = '';
    expect(() => validateEnvironment()).toThrow('Missing required LLM API key');
  });

  it('rejects keys without correct prefix', () => {
    process.env.OPENAI_API_KEY = 'invalid-prefix-but-long-enough-to-pass';
    process.env.ANTHROPIC_API_KEY = '';
    expect(() => validateEnvironment()).toThrow('Missing required LLM API key');
  });

  it('uses VERCEL_URL as fallback for base URL', () => {
    process.env.OPENAI_API_KEY = 'sk-test-valid-key-with-enough-length';
    process.env.NEXT_PUBLIC_BASE_URL = '';
    process.env.VERCEL_URL = 'my-app.vercel.app';
    const config = validateEnvironment();
    expect(config.NEXT_PUBLIC_BASE_URL).toBe('https://my-app.vercel.app');
  });

  it('defaults base URL to localhost when nothing set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-valid-key-with-enough-length';
    process.env.NEXT_PUBLIC_BASE_URL = '';
    process.env.VERCEL_URL = '';
    const config = validateEnvironment();
    expect(config.NEXT_PUBLIC_BASE_URL).toBe('http://localhost:3000');
  });
});

describe('isEnvironmentValid', () => {
  it('returns true when environment is valid', () => {
    process.env.OPENAI_API_KEY = 'sk-test-valid-key-with-enough-length';
    expect(isEnvironmentValid()).toBe(true);
  });

  it('returns false when environment is invalid', () => {
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(isEnvironmentValid()).toBe(false);
  });
});
