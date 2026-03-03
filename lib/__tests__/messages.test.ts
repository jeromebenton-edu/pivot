import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSupabaseConfigured, getSupabaseAdmin } from '@/lib/supabase';

// Mock supabase — default to unconfigured (in-memory path)
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => false),
  getSupabaseAdmin: vi.fn(() => null),
}));

import { saveMessage, getSessionMessages } from '../db/messages';

describe('messages (in-memory fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves and retrieves messages for a session', async () => {
    const msg = await saveMessage('s1', 'user', 'Hello');
    expect(msg).not.toBeNull();
    expect(msg!.session_id).toBe('s1');
    expect(msg!.role).toBe('user');
    expect(msg!.content).toBe('Hello');

    const messages = await getSessionMessages('s1');
    expect(messages.some(m => m.content === 'Hello')).toBe(true);
  });

  it('filters messages by session_id', async () => {
    await saveMessage('s-a', 'user', 'Session A');
    await saveMessage('s-b', 'user', 'Session B');

    const msgsA = await getSessionMessages('s-a');
    const msgsB = await getSessionMessages('s-b');
    expect(msgsA.every(m => m.session_id === 's-a')).toBe(true);
    expect(msgsB.every(m => m.session_id === 's-b')).toBe(true);
  });

  it('stores chart_config and sources', async () => {
    const chart = { type: 'bar' };
    const sources = [{ doc: 'test.pdf' }];
    const msg = await saveMessage('s1', 'assistant', 'Here is a chart', chart, sources);
    expect(msg!.chart_config).toEqual(chart);
    expect(msg!.sources).toEqual(sources);
  });

  it('returns messages sorted by created_at', async () => {
    await saveMessage('s-sort', 'user', 'First');
    await saveMessage('s-sort', 'assistant', 'Second');
    await saveMessage('s-sort', 'user', 'Third');

    const messages = await getSessionMessages('s-sort');
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].created_at >= messages[i - 1].created_at).toBe(true);
    }
  });

  it('generates unique cryptographic IDs', async () => {
    const m1 = await saveMessage('s1', 'user', 'A');
    const m2 = await saveMessage('s1', 'user', 'B');
    expect(m1!.id).not.toBe(m2!.id);
    // UUID format
    expect(m1!.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('messages (Supabase userId ownership guard)', () => {
  // Chainable mock builder for Supabase query chains
  function mockChain(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    const proxy = () => chain;
    chain.from = proxy;
    chain.select = proxy;
    chain.insert = proxy;
    chain.eq = proxy;
    chain.order = proxy;
    chain.limit = proxy;
    chain.single = () => result;
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  it('returns messages when userId matches the session owner', async () => {
    const mockMessages = [
      { id: '1', session_id: 's1', role: 'user', content: 'Hi', chart_config: null, sources: null, created_at: '2024-01-01' },
    ];
    // Session lookup succeeds → user owns this session
    const sessionChain = mockChain({ data: { id: 's1' }, error: null });
    // Messages query succeeds
    const messagesChain = mockChain({ data: mockMessages, error: null });
    // Override single() on messagesChain to return data directly (messages don't use .single())
    let callCount = 0;
    const db = {
      from: (table: string) => {
        callCount++;
        if (table === 'sessions' || callCount === 1) return sessionChain;
        return messagesChain;
      },
    };
    // Messages chain needs to return data without .single()
    (messagesChain as Record<string, unknown>).limit = () => ({ data: mockMessages, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await getSessionMessages('s1', 'user-123');
    expect(result).toEqual(mockMessages);
  });

  it('returns empty array when userId does not match session owner', async () => {
    // Session lookup fails → user does NOT own this session
    const sessionChain = mockChain({ data: null, error: null });
    const db = {
      from: () => sessionChain,
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await getSessionMessages('s1', 'wrong-user');
    expect(result).toEqual([]);
  });

  it('skips ownership check when no userId provided', async () => {
    const mockMessages = [
      { id: '1', session_id: 's1', role: 'user', content: 'Hi', chart_config: null, sources: null, created_at: '2024-01-01' },
    ];
    const messagesChain = mockChain({ data: mockMessages, error: null });
    (messagesChain as Record<string, unknown>).limit = () => ({ data: mockMessages, error: null });
    const db = {
      from: () => messagesChain,
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseAdmin>);

    // No userId → no ownership check, should return messages
    const result = await getSessionMessages('s1');
    expect(result).toEqual(mockMessages);
  });
});
