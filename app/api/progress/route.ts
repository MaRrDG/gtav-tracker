import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ProgressMap } from '@/lib/types';

const unauthorized = () => NextResponse.json({ error: 'Sign in required' }, { status: 401 });

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data, error } = await supabase.from('progress').select('objective_id, completed_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const done: ProgressMap = {};
  for (const row of data ?? []) done[row.objective_id] = row.completed_at;

  return NextResponse.json({ done });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  let ids: unknown;
  try {
    ({ ids } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids must be an array of strings' }, { status: 400 });
  }

  const { error } = await supabase
    .from('progress')
    .delete()
    .in('objective_id', ids as string[]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
