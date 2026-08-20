import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCatalog } from '@/lib/catalog';
import type { ProgressMap } from '@/lib/types';
import { Tracker } from './tracker';

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Read straight from Supabase rather than through /api/progress: this is already the
  // server, and a request to our own API would only add a round trip. /api stays the
  // entry point for the browser and for any other client.
  const { data } = await supabase.from('progress').select('objective_id, completed_at');

  const initialProgress: ProgressMap = {};
  for (const row of data ?? []) initialProgress[row.objective_id] = row.completed_at;

  return (
    <Tracker catalog={getCatalog()} initialProgress={initialProgress} email={user.email ?? ''} />
  );
}
