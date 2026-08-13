import { useEffect } from 'react';

const ASSET_RECOVERY_KEY = 'price-watch-asset-recovery-v1';

export const RecoveryMarker = () => {
  useEffect(() => {
    sessionStorage.removeItem(ASSET_RECOVERY_KEY);
  }, []);
  return null;
};
