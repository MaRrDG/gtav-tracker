import { describe, expect, test } from 'vitest';
import { GET } from '@/app/api/catalog/route';

describe('GET /api/catalog', () => {
  test('answers with the catalog', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.locations)).toBe(true);
    expect(Array.isArray(body.achievements)).toBe(true);
    expect(body.categories.some((c: { id: string }) => c.id === 'spaceship')).toBe(true);
  });

  test('is cacheable, because the catalog does not vary by user', async () => {
    const response = await GET();
    expect(response.headers.get('cache-control')).toMatch(/max-age/);
  });
});
