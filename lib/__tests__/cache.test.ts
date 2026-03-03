import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LRUCache, cacheKey } from '../cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache({ maxSize: 3, defaultTTLMs: 60_000 });
  });

  it('stores and retrieves a value', () => {
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns undefined for expired key', () => {
    vi.useFakeTimers();
    cache.set('a', 'hello', 100); // 100ms TTL
    vi.advanceTimersByTime(200);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('respects custom TTL on set', () => {
    vi.useFakeTimers();
    cache.set('a', 'hello', 500);
    vi.advanceTimersByTime(400);
    expect(cache.get('a')).toBe('hello');
    vi.advanceTimersByTime(200);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  // LRU eviction
  it('evicts oldest entry when at capacity', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe('4');
  });

  it('promotes accessed entry to most recently used', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.get('a'); // promote 'a'
    cache.set('d', '4'); // should evict 'b' (oldest after promotion)
    expect(cache.get('a')).toBe('1');
    expect(cache.get('b')).toBeUndefined();
  });

  it('updates existing key without increasing size', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('a', 'updated'); // should not increase size
    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBe('updated');
  });

  // has()
  it('has() returns true for existing key', () => {
    cache.set('a', 'hello');
    expect(cache.has('a')).toBe(true);
  });

  it('has() returns false for missing key', () => {
    expect(cache.has('missing')).toBe(false);
  });

  it('has() returns false for expired key', () => {
    vi.useFakeTimers();
    cache.set('a', 'hello', 100);
    vi.advanceTimersByTime(200);
    expect(cache.has('a')).toBe(false);
    vi.useRealTimers();
  });

  // delete()
  it('delete removes a key', () => {
    cache.set('a', 'hello');
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
  });

  it('delete returns false for missing key', () => {
    expect(cache.delete('missing')).toBe(false);
  });

  // clear()
  it('clear removes all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  // deleteByPrefix()
  it('deleteByPrefix removes matching keys', () => {
    cache.set('user:1', 'a');
    cache.set('user:2', 'b');
    cache.set('other:1', 'c');
    const removed = cache.deleteByPrefix('user:');
    expect(removed).toBe(2);
    expect(cache.get('user:1')).toBeUndefined();
    expect(cache.get('other:1')).toBe('c');
  });

  it('deleteByPrefix only counts live entries', () => {
    vi.useFakeTimers();
    cache.set('user:1', 'a', 100);
    cache.set('user:2', 'b', 60_000);
    vi.advanceTimersByTime(200); // expire user:1
    const removed = cache.deleteByPrefix('user:');
    expect(removed).toBe(1); // only user:2 was live
    vi.useRealTimers();
  });

  // liveSize()
  it('liveSize excludes expired entries', () => {
    vi.useFakeTimers();
    cache.set('a', '1', 100);
    cache.set('b', '2', 60_000);
    vi.advanceTimersByTime(200);
    expect(cache.size).toBe(2); // includes expired
    expect(cache.liveSize()).toBe(1); // excludes expired
    vi.useRealTimers();
  });
});

describe('cacheKey', () => {
  it('produces consistent hash for same inputs', () => {
    const key1 = cacheKey('a', 'b', 'c');
    const key2 = cacheKey('a', 'b', 'c');
    expect(key1).toBe(key2);
  });

  it('produces different hashes for different inputs', () => {
    const key1 = cacheKey('a', 'b');
    const key2 = cacheKey('a', 'c');
    expect(key1).not.toBe(key2);
  });

  it('uses null byte delimiter to prevent collisions', () => {
    // "a" + "bc" vs "ab" + "c" should differ
    const key1 = cacheKey('a', 'bc');
    const key2 = cacheKey('ab', 'c');
    expect(key1).not.toBe(key2);
  });

  it('returns a 32-char hex string', () => {
    const key = cacheKey('test');
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});
