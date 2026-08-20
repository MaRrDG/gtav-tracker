/** Marks one objective. Rejects with a message the interface can show as it is. */
export async function putObjective(id: string, done: boolean): Promise<void> {
  const response = await fetch(`/api/progress/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ done }),
  });

  if (response.status === 401) throw new Error('Session expired. Sign in again.');
  if (!response.ok) throw new Error('Could not save. Retry.');
}
