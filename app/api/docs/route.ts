import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/api-docs';

export async function GET() {
  return NextResponse.json(openApiSpec);
}
