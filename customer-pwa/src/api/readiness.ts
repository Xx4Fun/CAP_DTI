import { apiClient } from './client';

export const API_READINESS_TIMEOUT_MS = 75_000;

export function createReadinessGate(probe: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return () => {
    if (!inFlight) {
      inFlight = probe().catch((error) => {
        inFlight = null;
        throw error;
      });
    }

    return inFlight;
  };
}

export const ensureApiReady = createReadinessGate(async () => {
  const response = await apiClient.get('/health/ready', {
    timeout: API_READINESS_TIMEOUT_MS,
  });

  if (response.data?.status !== 'ready') {
    throw new Error('PRICE-Watch API is not ready');
  }
});
