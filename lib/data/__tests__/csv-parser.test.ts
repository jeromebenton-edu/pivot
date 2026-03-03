import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCSV, detectColumns } from '../csv-parser';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('parseCSV', () => {
  it('parses a simple CSV with headers', () => {
    const csv = 'name,value\nAlice,100\nBob,200';
    const result = parseCSV(csv);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Alice');
    expect(result.rows[0].value).toBe(100); // dynamicTyping
  });

  it('skips empty lines', () => {
    const csv = 'name,value\nAlice,100\n\nBob,200\n\n';
    const result = parseCSV(csv);
    expect(result.rowCount).toBe(2);
  });

  it('uses dynamic typing for numbers', () => {
    const csv = 'col\n42\n3.14\n-7';
    const result = parseCSV(csv);
    expect(typeof result.rows[0].col).toBe('number');
    expect(result.rows[1].col).toBeCloseTo(3.14);
    expect(result.rows[2].col).toBe(-7);
  });

  it('uses dynamic typing for booleans', () => {
    const csv = 'flag\ntrue\nfalse';
    const result = parseCSV(csv);
    expect(result.rows[0].flag).toBe(true);
    expect(result.rows[1].flag).toBe(false);
  });

  it('detects columns correctly', () => {
    const csv = 'name,amount,active\nAlice,100,true\nBob,200,false';
    const result = parseCSV(csv);
    expect(result.columns).toHaveLength(3);
    expect(result.columns.find(c => c.name === 'name')?.type).toBe('string');
    expect(result.columns.find(c => c.name === 'amount')?.type).toBe('number');
    expect(result.columns.find(c => c.name === 'active')?.type).toBe('boolean');
  });

  it('handles empty CSV', () => {
    const csv = '';
    const result = parseCSV(csv);
    expect(result.rowCount).toBe(0);
    expect(result.columns).toHaveLength(0);
  });

  it('handles CSV with only headers', () => {
    const csv = 'name,value';
    const result = parseCSV(csv);
    expect(result.rowCount).toBe(0);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,desc\n"Smith, John","Hello, World"';
    const result = parseCSV(csv);
    expect(result.rows[0].name).toBe('Smith, John');
    expect(result.rows[0].desc).toBe('Hello, World');
  });
});

describe('detectColumns', () => {
  it('detects number type', () => {
    const rows = [{ val: 1 }, { val: 2 }, { val: 3 }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('number');
  });

  it('detects string type', () => {
    const rows = [{ name: 'Alice' }, { name: 'Bob' }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('string');
  });

  it('detects date type for ISO dates', () => {
    const rows = [{ d: '2024-01-15' }, { d: '2024-02-20' }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('date');
  });

  it('does not detect non-date strings as dates', () => {
    const rows = [{ d: 'hello' }, { d: 'world' }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('string');
  });

  it('does not detect invalid dates with out-of-range months', () => {
    const rows = [{ d: '2024-13-01' }, { d: '2024-14-01' }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('string');
  });

  it('returns empty array for empty rows', () => {
    const cols = detectColumns([]);
    expect(cols).toHaveLength(0);
  });

  it('includes sample values', () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }];
    const cols = detectColumns(rows);
    expect(cols[0].sampleValues).toEqual([1, 2, 3]);
  });

  it('falls back to string for mixed types', () => {
    const rows = [{ val: 1 }, { val: 'text' }];
    const cols = detectColumns(rows);
    expect(cols[0].type).toBe('string');
  });
});
