import { z } from 'zod';
import { createHash } from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('validation');

// --- Schemas ---

export const ragSourceSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable().transform(v => v ?? {}),
  score: z.number().min(0), // No upper bound — distance metrics can exceed 1.0 (#33)
});

const knownChartTypes = [
  'line', 'bar', 'pie', 'scatter', 'area',
  'heatmap', 'treemap', 'funnel', 'radar', 'gauge', 'waterfall', 'combo',
] as const;

export const chartConfigSchema = z.object({
  type: z.enum(knownChartTypes),
  title: z.string().min(1),
  data: z.array(z.record(z.string(), z.unknown())).min(1),
  xAxis: z.object({ dataKey: z.string(), label: z.string().optional() }).optional(),
  yAxis: z.object({ dataKey: z.string(), label: z.string().optional() }).optional(),
  height: z.number().optional(),
}).passthrough(); // Preserve extra fields like colors, margin, series (#13)

export const querySchema = z.string().min(1, 'Query cannot be empty').max(5000, 'Query too long (max 5000 chars)');

// Prompt injection patterns — defense-in-depth (#15/#13)
// Input is normalized (lowercased, non-ASCII whitespace stripped) before matching.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/,
  /ignore\s+(all\s+)?above\s+instructions/,
  /disregard\s+(all\s+)?previous/,
  /forget\s+(everything|all)\s+(above|before)/,
  /\bsystem\s*prompt\b/,
  /\bdatabase.?url\b/,
  // Removed \bapi.?key\b and \bsecret\b — too many false positives on
  // legitimate BI queries like "what's the secret to..." or "API key metrics" (#28)
  /output\s+(the|your)\s+(system|initial)\s+prompt/,
  /you\s+are\s+now\s+a\s+different/,
  /new\s+instructions?\s*:/,
  /\bdo\s+not\s+follow\b/,
  /\boverride\s+(all|your)\b/,
];

// --- Validation functions ---

interface Source {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export function validateSources(
  sources: Source[],
): { valid: Source[]; warnings: string[] } {
  const valid: Source[] = [];
  const warnings: string[] = [];

  for (const src of sources) {
    const result = ragSourceSchema.safeParse(src);
    if (result.success) {
      valid.push(result.data as Source);
    } else {
      warnings.push(`[Validation] Filtered source ${src.id || '(no id)'}: ${result.error.issues[0]?.message}`);
    }
  }

  if (warnings.length > 0) {
    log.warn('Filtered invalid sources', { count: warnings.length, warnings });
  }

  return { valid, warnings };
}

export function validateChartConfig(
  config: unknown,
): { valid: boolean; cleaned: Record<string, unknown> | null; warnings: string[] } {
  const warnings: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, cleaned: null, warnings: ['[Validation] Chart config is null or not an object'] };
  }

  const result = chartConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(i => i.message).join(', ');
    warnings.push(`[Validation] Invalid chart config: ${issues}`);
    log.warn('Invalid chart config', { issues });
    return { valid: false, cleaned: null, warnings };
  }

  // Check for NaN/Infinity in data values using Zod-parsed output (#20)
  const parsed = result.data;
  let hasNonFinite = false;
  for (const point of parsed.data) {
    for (const [key, val] of Object.entries(point)) {
      if (typeof val === 'number' && !Number.isFinite(val)) {
        warnings.push(`[Validation] Non-finite value in chart data: ${key}=${val}`);
        hasNonFinite = true;
      }
    }
  }

  if (hasNonFinite) {
    log.warn('Chart config rejected: non-finite values in data');
    return { valid: false, cleaned: null, warnings };
  }

  // Check for all-zero or all-null numeric data — produces meaningless charts (#23, #13 R6)
  const hasAnyNumericValue = parsed.data.some(point =>
    Object.values(point).some(val => typeof val === 'number')
  );
  if (!hasAnyNumericValue) {
    warnings.push('[Validation] Chart data contains no numeric values');
    log.warn('Chart config rejected: no numeric values in data');
    return { valid: false, cleaned: null, warnings };
  }
  const hasNonZeroValue = parsed.data.some(point =>
    Object.values(point).some(val => typeof val === 'number' && val !== 0)
  );
  if (!hasNonZeroValue) {
    warnings.push('[Validation] Chart data contains only zero values');
    log.warn('Chart config rejected: all-zero data');
    return { valid: false, cleaned: null, warnings };
  }

  // Return Zod-parsed output — passthrough() preserves extra fields (#13)
  return { valid: true, cleaned: parsed as unknown as Record<string, unknown>, warnings };
}

// Cyrillic homoglyphs → Latin equivalents (#11 review R6)
const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
  '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u0456': 'i',
  '\u0410': 'a', '\u0415': 'e', '\u041E': 'o', '\u0420': 'p',
  '\u0421': 'c', '\u0423': 'y', '\u0425': 'x', '\u0406': 'i',
};

// Normalize text for injection detection: lowercase, collapse whitespace, strip non-ASCII spaces
function normalizeForInjectionCheck(text: string): string {
  return text
    .normalize('NFKD')                                          // Decompose Unicode (accented chars → base + combining) (#9)
    .replace(/[\u0300-\u036f]/g, '')                            // Strip combining marks (diacritics)
    .replace(/[\u0400-\u04FF]/g, ch => HOMOGLYPH_MAP[ch] || ch) // Cyrillic homoglyphs → Latin (#11 R6)
    .toLowerCase()
    .replace(/[\u00A0\u180E\u2000-\u200F\u2028\u2029\u202A-\u202F\u205F\u2060-\u2064\u200D\u3000\uFEFF]/g, ' ') // Non-ASCII whitespace + zero-width (U+2060-2064) + RTL/LTR overrides → space (#16 broadened, #11 R6, #R8)
    .replace(/[\uFF1A\uA789]/g, ':')                            // Fullwidth/modifier colon → ASCII colon (#14 R6)
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateQuery(
  content: string,
): { valid: boolean; sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  const trimmed = content.trim();

  const result = querySchema.safeParse(trimmed);
  if (!result.success) {
    const msg = result.error.issues[0]?.message || 'Invalid query';
    return { valid: false, sanitized: '', warnings: [msg] };
  }

  // Check for prompt injection patterns (#13/#15)
  const normalized = normalizeForInjectionCheck(trimmed);
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      // Log only a hash for correlation, not the query content (#22)
      const queryHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);
      warnings.push('[Validation] Query matched prompt injection pattern');
      log.warn('Blocked suspicious query', { queryHash });
      return { valid: false, sanitized: '', warnings };
    }
  }

  return { valid: true, sanitized: trimmed, warnings };
}

interface Discrepancy {
  field: string;
  ragValue: number;
  sqlValue: number;
  diffPercent: number;
}

export function crossCheckTotals(
  ragValues: Record<string, number>,
  knownTotals: Record<string, unknown>,
  tolerance = 0.05,
): { passed: boolean; discrepancies: Discrepancy[] } {
  const discrepancies: Discrepancy[] = [];

  for (const [field, ragVal] of Object.entries(ragValues)) {
    const sqlVal = knownTotals[field];

    // Skip if SQL value is not available
    if (sqlVal === undefined) continue;

    // Coerce string numbers before comparison (#15)
    const numSqlVal = typeof sqlVal === 'number' ? sqlVal : Number(sqlVal);
    if (!Number.isFinite(numSqlVal)) {
      log.warn('SQL value is not numeric', { field, value: String(sqlVal).slice(0, 30) });
      continue;
    }
    const numRagVal = typeof ragVal === 'number' ? ragVal : Number(ragVal);
    if (!Number.isFinite(numRagVal)) {
      // Flag NaN RAG values as data quality issues rather than silently skipping (#12 R6)
      discrepancies.push({ field, ragValue: 0, sqlValue: numSqlVal, diffPercent: 100 });
      log.warn('RAG value is not numeric (NaN/Infinity)', { field, value: String(ragVal).slice(0, 30) });
      continue;
    }

    // Handle zero SQL value separately (#21) — cap at 100% since division by zero
    // would yield Infinity; 100% signals "completely different" (#30)
    if (numSqlVal === 0) {
      if (numRagVal !== 0) {
        discrepancies.push({ field, ragValue: numRagVal, sqlValue: 0, diffPercent: 100 });
      }
      continue;
    }

    const diff = Math.abs(numRagVal - numSqlVal) / Math.abs(numSqlVal);
    if (diff > tolerance) {
      discrepancies.push({
        field,
        ragValue: numRagVal,
        sqlValue: numSqlVal,
        diffPercent: Math.round(diff * 10000) / 100,
      });
    }
  }

  if (discrepancies.length > 0) {
    log.warn('Cross-check discrepancies found', { discrepancies });
  }

  return { passed: discrepancies.length === 0, discrepancies };
}
