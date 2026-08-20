export type Row = { objective_id: string; completed_at: string };

export type Recorded = {
  upserts: Record<string, unknown>[];
  deletedEq: string[];
  deletedIn: string[][];
};

/**
 * A stand-in for the Supabase client covering exactly the calls the progress routes make.
 * Row-level security is the database's job, so the fake does not model it.
 */
export function fakeSupabase({ user, rows = [] }: { user: { id: string } | null; rows?: Row[] }) {
  const recorded: Recorded = { upserts: [], deletedEq: [], deletedIn: [] };

  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: () => ({
      select: async () => ({ data: rows, error: null }),
      upsert: async (values: Record<string, unknown>) => {
        recorded.upserts.push(values);
        return { error: null };
      },
      delete: () => ({
        eq: (_column: string, value: string) => {
          recorded.deletedEq.push(value);
          return Promise.resolve({ error: null });
        },
        in: (_column: string, values: string[]) => {
          recorded.deletedIn.push(values);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };

  return { client, recorded };
}
