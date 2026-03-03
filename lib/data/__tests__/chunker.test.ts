import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkData } from '../chunker';
import type { ParsedData } from '../csv-parser';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function makeParsedData(overrides: Partial<ParsedData> = {}): ParsedData {
  return {
    rows: [
      { region: 'Asia', revenue: 100, cost: 50 },
      { region: 'Europe', revenue: 200, cost: 80 },
      { region: 'Asia', revenue: 150, cost: 60 },
    ],
    columns: [
      { name: 'region', type: 'string', sampleValues: ['Asia', 'Europe', 'Asia'] },
      { name: 'revenue', type: 'number', sampleValues: [100, 200, 150] },
      { name: 'cost', type: 'number', sampleValues: [50, 80, 60] },
    ],
    rowCount: 3,
    ...overrides,
  };
}

describe('chunkData', () => {
  it('creates an overview chunk', () => {
    const chunks = chunkData(makeParsedData(), 'test-dataset');
    const overview = chunks.find(c => c.metadata.type === 'dataset_overview');
    expect(overview).toBeDefined();
    expect(overview!.content).toContain('test-dataset');
    expect(overview!.content).toContain('3 rows');
    expect(overview!.content).toContain('3 columns');
  });

  it('creates column summary chunks for numeric columns', () => {
    const chunks = chunkData(makeParsedData(), 'test');
    const colSummaries = chunks.filter(c => c.metadata.type === 'column_summary');
    expect(colSummaries).toHaveLength(2); // revenue and cost
    expect(colSummaries[0].content).toContain('revenue');
    expect(colSummaries[0].content).toContain('Sum=');
    expect(colSummaries[0].content).toContain('Average=');
  });

  it('creates row group chunks (groups of 20)', () => {
    // Create 25 rows
    const rows = Array.from({ length: 25 }, (_, i) => ({ name: `item-${i}`, value: i * 10 }));
    const parsed = makeParsedData({
      rows,
      columns: [
        { name: 'name', type: 'string', sampleValues: ['item-0'] },
        { name: 'value', type: 'number', sampleValues: [0] },
      ],
      rowCount: 25,
    });
    const chunks = chunkData(parsed, 'test');
    const rowGroups = chunks.filter(c => c.metadata.type === 'row_group');
    expect(rowGroups).toHaveLength(2); // 1-20, 21-25
    expect(rowGroups[0].content).toContain('rows 1-20');
    expect(rowGroups[1].content).toContain('rows 21-25');
  });

  it('creates group summary chunks by first string column', () => {
    const chunks = chunkData(makeParsedData(), 'test');
    const groups = chunks.filter(c => c.metadata.type === 'group_summary');
    expect(groups.length).toBeGreaterThan(0);
    // Should have Asia and Europe groups
    const groupValues = groups.map(g => g.metadata.groupValue);
    expect(groupValues).toContain('Asia');
    expect(groupValues).toContain('Europe');
  });

  it('group summaries contain totals and averages', () => {
    const chunks = chunkData(makeParsedData(), 'test');
    const asiaGroup = chunks.find(c => c.metadata.groupValue === 'Asia');
    expect(asiaGroup).toBeDefined();
    expect(asiaGroup!.content).toContain('total=');
    expect(asiaGroup!.content).toContain('avg=');
  });

  it('skips group chunks for high-cardinality columns', () => {
    // Create rows where each region value is unique (>200 unique values)
    const rows = Array.from({ length: 201 }, (_, i) => ({
      id: `region-${i}`,
      revenue: i * 10,
    }));
    const parsed = makeParsedData({
      rows,
      columns: [
        { name: 'id', type: 'string', sampleValues: ['region-0'] },
        { name: 'revenue', type: 'number', sampleValues: [0] },
      ],
      rowCount: 201,
    });
    const chunks = chunkData(parsed, 'test');
    const groups = chunks.filter(c => c.metadata.type === 'group_summary');
    expect(groups).toHaveLength(0);
  });

  it('handles data with no string columns (no group chunks)', () => {
    const parsed = makeParsedData({
      rows: [{ a: 1, b: 2 }, { a: 3, b: 4 }],
      columns: [
        { name: 'a', type: 'number', sampleValues: [1] },
        { name: 'b', type: 'number', sampleValues: [2] },
      ],
      rowCount: 2,
    });
    const chunks = chunkData(parsed, 'test');
    const groups = chunks.filter(c => c.metadata.type === 'group_summary');
    expect(groups).toHaveLength(0);
  });

  it('handles data with no numeric columns', () => {
    const parsed = makeParsedData({
      rows: [{ name: 'a' }, { name: 'b' }],
      columns: [{ name: 'name', type: 'string', sampleValues: ['a'] }],
      rowCount: 2,
    });
    const chunks = chunkData(parsed, 'test');
    const colSummaries = chunks.filter(c => c.metadata.type === 'column_summary');
    expect(colSummaries).toHaveLength(0);
  });

  it('filters NaN/Infinity from numeric stats', () => {
    const parsed = makeParsedData({
      rows: [
        { region: 'X', revenue: NaN, cost: 10 },
        { region: 'X', revenue: 100, cost: Infinity },
      ],
      columns: [
        { name: 'region', type: 'string', sampleValues: ['X'] },
        { name: 'revenue', type: 'number', sampleValues: [NaN] },
        { name: 'cost', type: 'number', sampleValues: [10] },
      ],
      rowCount: 2,
    });
    const chunks = chunkData(parsed, 'test');
    const revSummary = chunks.find(c => c.metadata.column === 'revenue');
    expect(revSummary).toBeDefined();
    // NaN should be filtered, only 100 remains
    expect(revSummary!.content).toContain('Count=1');
    expect(revSummary!.content).toContain('Sum=100');
  });

  it('includes dataset name in metadata', () => {
    const chunks = chunkData(makeParsedData(), 'my-dataset');
    for (const chunk of chunks) {
      expect(chunk.metadata.dataset).toBe('my-dataset');
    }
  });
});
