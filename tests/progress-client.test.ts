import { afterEach, describe, expect, test, vi } from 'vitest';
import { putObjective } from '@/lib/progress-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (response: Response) => {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
};

describe('putObjective', () => {
  test('sends the id and the flag', async () => {
    const spy = stubFetch(new Response('{}', { status: 200 }));
    await putObjective('spaceship-01', true);

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/progress/spaceship-01');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ done: true });
  });

  test('encodes the id, so a stray character cannot alter the path', async () => {
    const spy = stubFetch(new Response('{}', { status: 200 }));
    await putObjective('a/b', false);
    expect(spy.mock.calls[0][0]).toBe('/api/progress/a%2Fb');
  });

  test('rejects with a user-facing message when the write fails', async () => {
    stubFetch(new Response('{}', { status: 500 }));
    await expect(putObjective('spaceship-01', true)).rejects.toThrow('Could not save. Retry.');
  });

  test('rejects with a sign-in message on 401', async () => {
    stubFetch(new Response('{}', { status: 401 }));
    await expect(putObjective('spaceship-01', true)).rejects.toThrow(
      'Session expired. Sign in again.',
    );
  });
});
