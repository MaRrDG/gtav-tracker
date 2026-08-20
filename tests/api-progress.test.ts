import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeSupabase, type Recorded, type Row } from './helpers/supabase';

const holder: { current: unknown } = { current: null };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => holder.current,
}));

const { GET, DELETE } = await import('@/app/api/progress/route');
const { PUT } = await import('@/app/api/progress/[id]/route');

const asUser = (rows: Row[] = []): Recorded => {
  const { client, recorded } = fakeSupabase({ user: { id: 'user-1' }, rows });
  holder.current = client;
  return recorded;
};

const asAnonymous = () => {
  holder.current = fakeSupabase({ user: null }).client;
};

const put = (id: string, body: string) =>
  PUT(new Request('http://test/api/progress/x', { method: 'PUT', body }), {
    params: Promise.resolve({ id }),
  });

const mark = (id: string, done: boolean) => put(id, JSON.stringify({ done }));

const del = (body: string) =>
  DELETE(new Request('http://test/api/progress', { method: 'DELETE', body }));

beforeEach(() => {
  holder.current = null;
});

describe('GET /api/progress', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    expect((await GET()).status).toBe(401);
  });

  test('returns completion timestamps keyed by objective id', async () => {
    asUser([{ objective_id: 'spaceship-01', completed_at: '2026-08-20T10:00:00.000Z' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      done: { 'spaceship-01': '2026-08-20T10:00:00.000Z' },
    });
  });
});

describe('PUT /api/progress/[id]', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    expect((await mark('spaceship-01', true)).status).toBe(401);
  });

  test('answers 404 for an objective that is not in the catalog', async () => {
    asUser();
    expect((await mark('does-not-exist', true)).status).toBe(404);
  });

  test('writes a row when marking an objective done', async () => {
    const recorded = asUser();
    const response = await mark('spaceship-01', true);
    expect(response.status).toBe(200);
    expect(recorded.upserts).toHaveLength(1);
    expect(recorded.upserts[0]).toMatchObject({
      user_id: 'user-1',
      objective_id: 'spaceship-01',
    });
  });

  test('removes the row when marking an objective not done', async () => {
    const recorded = asUser();
    const response = await mark('spaceship-01', false);
    expect(response.status).toBe(200);
    expect(recorded.deletedEq).toEqual(['spaceship-01']);
    expect(recorded.upserts).toHaveLength(0);
  });

  test('answers 400 when the body has no boolean done', async () => {
    asUser();
    expect((await put('spaceship-01', '{}')).status).toBe(400);
  });
});

describe('DELETE /api/progress', () => {
  test('answers 401 without a session', async () => {
    asAnonymous();
    expect((await del(JSON.stringify({ ids: ['spaceship-01'] }))).status).toBe(401);
  });

  test('deletes the ids it is given', async () => {
    const recorded = asUser();
    const response = await del(JSON.stringify({ ids: ['spaceship-01', 'spaceship-02'] }));
    expect(response.status).toBe(200);
    expect(recorded.deletedIn).toEqual([['spaceship-01', 'spaceship-02']]);
  });

  test('answers 400 when ids is not an array of strings', async () => {
    asUser();
    expect((await del(JSON.stringify({ ids: 'spaceship-01' }))).status).toBe(400);
  });
});
