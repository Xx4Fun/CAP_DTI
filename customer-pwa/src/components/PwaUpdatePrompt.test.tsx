import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

const {
  updateServiceWorkerMock,
  setNeedRefreshMock,
  setOfflineReadyMock,
  registrationState,
} = vi.hoisted(() => ({
  updateServiceWorkerMock: vi.fn<() => Promise<void>>(),
  setNeedRefreshMock: vi.fn(),
  setOfflineReadyMock: vi.fn(),
  registrationState: { needRefresh: true, offlineReady: false },
}));

vi.mock('../app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [registrationState.needRefresh, setNeedRefreshMock],
    offlineReady: [registrationState.offlineReady, setOfflineReadyMock],
    updateServiceWorker: updateServiceWorkerMock,
  }),
}));

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    updateServiceWorkerMock.mockReset();
    setNeedRefreshMock.mockReset();
    setOfflineReadyMock.mockReset();
    registrationState.needRefresh = true;
    registrationState.offlineReady = false;
  });

  it('does not apply an update until the user chooses Update now', async () => {
    updateServiceWorkerMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PwaUpdatePrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('Update available');
    expect(updateServiceWorkerMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update now' }));
    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true);
  });

  it('allows the update prompt to be deferred without reloading', async () => {
    const user = userEvent.setup();
    render(<PwaUpdatePrompt />);

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(setNeedRefreshMock).toHaveBeenCalledWith(false);
    expect(updateServiceWorkerMock).not.toHaveBeenCalled();
  });

  it('confirms when the complete app shell is ready for offline use', async () => {
    registrationState.needRefresh = false;
    registrationState.offlineReady = true;
    const user = userEvent.setup();

    render(<PwaUpdatePrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('Ready for offline use');
    await user.click(screen.getByRole('button', { name: 'Dismiss offline-ready notice' }));
    expect(setOfflineReadyMock).toHaveBeenCalledWith(false);
  });
});
