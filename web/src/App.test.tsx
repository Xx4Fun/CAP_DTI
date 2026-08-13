import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const { ensureApiReadyMock } = vi.hoisted(() => ({
  ensureApiReadyMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('./services/apiReadiness', () => ({
  ensureApiReady: ensureApiReadyMock,
}));

describe('Admin application readiness', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });

  it('starts warming the API as soon as the login application opens', async () => {
    render(<App />);

    await waitFor(() => expect(ensureApiReadyMock).toHaveBeenCalledTimes(1));
  });
});
