import { useEffect, useState } from 'react';

/**
 * Custom hook for monitoring browser network connection state.
 * Note: Only checks browser network link state (navigator.onLine),
 * not backend API server reachability.
 */
export function useConnectivity(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateConnectivity = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);

    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  return isOnline;
}
