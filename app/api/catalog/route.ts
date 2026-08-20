import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog';

/** The catalog is identical for every user and changes only on deploy. */
export async function GET() {
  return NextResponse.json(getCatalog(), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
