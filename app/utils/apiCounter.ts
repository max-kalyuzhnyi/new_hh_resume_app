export interface ApiCounters {
  actions: number;
  general: number;
}

export async function incrementActionCounter() {
  const response = await fetch('/api/counters', {
    method: 'POST',
    body: JSON.stringify({ type: 'action' }),
  });
  return response.json();
}

export async function incrementGeneralCounter() {
  const response = await fetch('/api/counters', {
    method: 'POST',
    body: JSON.stringify({ type: 'general' }),
  });
  return response.json();
}

export async function getApiCounters(): Promise<ApiCounters> {
  const response = await fetch('/api/counters');
  return response.json();
}

export async function resetApiCounters() {
  const response = await fetch('/api/counters', {
    method: 'POST',
    body: JSON.stringify({ type: 'reset' }),
  });
  return response.json();
}
