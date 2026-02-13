import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    return NextResponse.json({
      status: 'success',
      message: 'MCP server will be implemented in Phase 3',
      received: body
    });
  } catch (error) {
    console.error('MCP API error:', error);
    return NextResponse.json(
      { error: 'MCP server not yet implemented' },
      { status: 501 }
    );
  }
}