import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

const { updateServiceWorkerMock, setNeedRefreshMock } = vi.hoisted(() => ({
  updateServiceWorkerMock: vi.fn<() => Promise<void>>(),
  setNeedRefreshMock: vi.fn(),
}));

vi.mock('../app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, setNeedRefreshMock],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: updateServiceWorkerMock,
  }),
}));

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    updateServiceWorkerMock.mockReset();
    setNeedRefreshMock.mockReset();
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
});
