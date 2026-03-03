import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logger';
import { auth, requirePermission } from '@/lib/auth';
import { parseCSV } from '@/lib/data/csv-parser';
import { parseExcel } from '@/lib/data/excel-parser';
import { chunkData } from '@/lib/data/chunker';
import { embedAndStoreChunks } from '@/lib/data/embedder';
import { logAuditEvent } from '@/lib/db/audit';
import { invalidateDatasetCaches } from '@/lib/cache';
import { createRateLimiter } from '@/lib/rate-limit';

const log = createLogger('upload');

// Rate limiter for uploads (#R7)
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5, // 5 uploads per minute
  message: 'Too many uploads. Please wait before uploading again.',
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RBAC: require 'upload' permission (#Phase5)
  const denied = requirePermission(session, 'upload');
  if (denied) return denied;

  // Rate limit per user (#R7)
  const rateLimitResult = await uploadRateLimiter(session.user.id);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
  }

  try {
    // Pre-check Content-Length before buffering full body (#R9-11)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const contentLength = parseInt(req.headers.get('content-length') || '0');
    if (contentLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Request too large. Maximum size is 50 MB.' },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const previewOnly = formData.get('preview') === 'true';

    // Runtime type check — formData.get can return string or null (#24)
    if (!fileEntry || typeof fileEntry === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const file = fileEntry as File;

    // Reject files larger than 50 MB (#8)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50 MB.' },
        { status: 413 },
      );
    }

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCSV && !isExcel) {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV or Excel.' }, { status: 400 });
    }

    // Validate MIME type when available (#15 R6)
    const mimeType = file.type;
    if (mimeType) {
      const allowedMIMEs = new Set([
        'text/csv', 'text/plain', 'application/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ]);
      if (!allowedMIMEs.has(mimeType)) {
        log.warn('Unexpected MIME type', { mimeType, fileName });
      }
    }

    // Parse the file
    let parsed;
    if (isCSV) {
      const text = await file.text();
      parsed = parseCSV(text);
    } else {
      const buffer = await file.arrayBuffer();
      const result = parseExcel(buffer);
      // Check for zero sheets (#10)
      if (!result.sheets || result.sheets.length === 0) {
        return NextResponse.json({ error: 'Excel file contains no sheets' }, { status: 400 });
      }
      const firstSheet = result.sheets[0];
      parsed = result.data[firstSheet];
      // Check if first sheet has parseable data (#29)
      if (!parsed) {
        return NextResponse.json({ error: 'First sheet contains no parseable data' }, { status: 400 });
      }
    }

    if (!parsed || parsed.rowCount === 0) {
      return NextResponse.json({ error: 'File contains no data' }, { status: 400 });
    }

    // Reject files with too many rows to prevent OOM (#19)
    const MAX_ROWS = 100000;
    if (parsed.rowCount > MAX_ROWS) {
      return NextResponse.json(
        { error: `File has too many rows (${parsed.rowCount}). Maximum is ${MAX_ROWS}.` },
        { status: 400 },
      );
    }

    // Preview mode — just return column info
    if (previewOnly) {
      return NextResponse.json({
        columns: parsed.columns,
        rowCount: parsed.rowCount,
      });
    }

    // Full upload: chunk and embed
    // Sanitize filename: strip path separators, null bytes, limit length (#32 from review)
    const safeName = file.name
      .replace(/[/\\:\0]/g, '')
      .replace(/\.(csv|xlsx|xls)$/i, '')
      .slice(0, 100);
    const datasetName = safeName || 'unnamed';
    const datasetId = `upload-${randomUUID()}`; // Cryptographically random ID (#5)
    const chunks = chunkData(parsed, datasetName);

    const result = await embedAndStoreChunks(datasetId, chunks, session.user.id);

    // Check if embedding succeeded (#R7)
    if (!result.success) {
      return NextResponse.json({ error: 'Failed to process and embed data' }, { status: 500 });
    }

    // Invalidate caches since new data was uploaded
    invalidateDatasetCaches(datasetId);

    // Audit log — use sanitized name to prevent stored XSS in log viewers (#16 R6)
    await logAuditEvent(session.user.id, 'dataset_upload', {
      datasetId,
      datasetName,
      fileName: safeName || 'unnamed',
      rowCount: parsed.rowCount,
      columnCount: parsed.columns.length,
      chunksCreated: result.chunksStored,
    });

    return NextResponse.json({
      datasetId,
      datasetName,
      rowCount: parsed.rowCount,
      columns: parsed.columns,
      chunksStored: result.chunksStored,
    });
  } catch (error) {
    log.error('Upload error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
