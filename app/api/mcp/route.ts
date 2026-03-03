import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { status: 'not_implemented', message: 'MCP server will be implemented in Phase 3' },
    { status: 501 },
  );
}