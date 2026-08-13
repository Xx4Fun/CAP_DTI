import { useContext, useEffect, useRef } from 'react';
import { BackNavigationContext } from '../app/backNavigationContext';

export function useBackLayer(id: string, active: boolean, onBack: () => void): boolean {
  const context = useContext(BackNavigationContext);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || !context) return;
    return context.registerLayer(id, () => onBackRef.current());
  }, [active, context, id]);

  return context !== null;
}
