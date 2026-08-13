import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('announces each new outage after reconnecting even if the previous banner was dismissed', async () => {
    const user = userEvent.setup();
    const view = render(<OfflineBanner isOffline lastSyncTime="10:30 AM" />);

    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
    await user.click(screen.getByRole('button', { name: 'Dismiss offline notice' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    view.rerender(<OfflineBanner isOffline={false} lastSyncTime="10:30 AM" />);
    view.rerender(<OfflineBanner isOffline lastSyncTime="10:30 AM" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses a clearly named, touch-sized dismiss control', () => {
    render(<OfflineBanner isOffline />);
    expect(screen.getByRole('button', { name: 'Dismiss offline notice' })).toHaveClass('offline-banner-dismiss');
  });
});
