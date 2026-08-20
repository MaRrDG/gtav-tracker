import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getIndexedCatalog } from '@/lib/catalog';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { id } = await params;
  if (!getIndexedCatalog().byId.has(id)) {
    return NextResponse.json({ error: `Unknown objective: ${id}` }, { status: 404 });
  }

  let done: unknown;
  try {
    ({ done } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (typeof done !== 'boolean') {
    return NextResponse.json({ error: 'done must be a boolean' }, { status: 400 });
  }

  // The delete filters on objective_id alone: the policy already restricts the rows to
  // this user, so repeating user_id would duplicate a constraint the database enforces.
  const table = supabase.from('progress');
  const { error } = done
    ? await table.upsert({ user_id: user.id, objective_id: id })
    : await table.delete().eq('objective_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id, done });
}
