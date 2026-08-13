import { createContext } from 'react';

export interface BackNavigationContextValue {
  registerLayer: (id: string, onBack: () => void) => () => void;
}

export const BackNavigationContext = createContext<BackNavigationContextValue | null>(null);
