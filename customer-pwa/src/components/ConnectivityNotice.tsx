import { StatusBanner } from './ui/StatusBanner';

type ConnectivityNoticeProps = {
  isOnline: boolean;
  freshness?: 'live' | 'bundled' | 'unavailable';
  updatedAt?: string | null;
};

export function ConnectivityNotice({
  isOnline,
  freshness = 'live',
  updatedAt,
}: ConnectivityNoticeProps) {
  if (!isOnline) {
    return (
      <StatusBanner variant="offline" title={freshness === 'bundled' ? 'You are offline · showing bundled reference prices' : 'You are offline'}>
        {freshness === 'bundled' ? `Source date: ${updatedAt || 'saved date unavailable'}. ` : 'Saved prices may still be available. '}
        Scanning and formal reporting require a live connection.
      </StatusBanner>
    );
  }

  if (freshness === 'bundled') {
    return (
      <StatusBanner variant="warning" title="Showing bundled reference prices">
        Live prices could not be loaded. Source date: {updatedAt || 'saved date unavailable'}.
      </StatusBanner>
    );
  }

  if (freshness === 'unavailable') {
    return (
      <StatusBanner variant="warning" title="Current status unavailable">
        We could not confirm the latest regulatory status. Try again when your connection is stable.
      </StatusBanner>
    );
  }

  return null;
}
