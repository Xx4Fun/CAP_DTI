import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BACK_GUARD_STATE_KEY, isBackGuardState } from './backNavigationState';
import { BackNavigationContext } from './backNavigationContext';

interface BackLayer {
  id: string;
  pathname: string;
  order: number;
  onBack: () => void;
}

interface CloseWatcherLike {
  addEventListener: (type: 'close', listener: EventListener) => void;
  removeEventListener: (type: 'close', listener: EventListener) => void;
  destroy: () => void;
}

type CloseWatcherConstructor = new () => CloseWatcherLike;

function pushGuard(pathname: string): void {
  if (isBackGuardState(history.state)) return;

  const state = typeof history.state === 'object' && history.state !== null
    ? history.state as Record<string, unknown>
    : {};
  history.pushState({
    ...state,
    [BACK_GUARD_STATE_KEY]: true,
    basePath: pathname,
  }, '', `${location.pathname}${location.search}${location.hash}`);
}

export function BackNavigationProvider({ children }: { children: ReactNode }) {
  const layersRef = useRef(new Map<string, BackLayer>());
  const nextOrderRef = useRef(0);
  const handlingPopRef = useRef(false);
  const [layerCount, setLayerCount] = useState(0);

  const topLayer = useCallback(() => {
    const pathname = location.pathname;
    return [...layersRef.current.values()]
      .filter((layer) => layer.pathname === pathname)
      .sort((left, right) => right.order - left.order)[0];
  }, []);

  const closeTopLayer = useCallback(() => {
    const layer = topLayer();
    if (!layer) return false;
    layer.onBack();
    return true;
  }, [topLayer]);

  const registerLayer = useCallback((id: string, onBack: () => void) => {
    const wasEmpty = layersRef.current.size === 0;
    layersRef.current.set(id, {
      id,
      pathname: location.pathname,
      order: ++nextOrderRef.current,
      onBack,
    });
    setLayerCount(layersRef.current.size);
    if (wasEmpty) pushGuard(location.pathname);

    return () => {
      const removed = layersRef.current.delete(id);
      if (!removed) return;

      setLayerCount(layersRef.current.size);
      if (layersRef.current.size === 0) {
        window.setTimeout(() => {
          if (
            layersRef.current.size === 0
            && !handlingPopRef.current
            && isBackGuardState(history.state)
          ) {
            history.back();
          }
        }, 0);
      }
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (!closeTopLayer()) return;

      handlingPopRef.current = true;
      window.setTimeout(() => {
        handlingPopRef.current = false;
        const remainingLayer = topLayer();
        if (remainingLayer && !isBackGuardState(history.state)) {
          pushGuard(remainingLayer.pathname);
        }
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeTopLayer, topLayer]);

  useEffect(() => {
    if (layerCount === 0) return;

    const CloseWatcher = (window as Window & { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    if (!CloseWatcher) return;

    const watcher = new CloseWatcher();
    const handleClose = (event: Event) => {
      event.preventDefault();
      closeTopLayer();
    };
    watcher.addEventListener('close', handleClose);
    return () => {
      watcher.removeEventListener('close', handleClose);
      watcher.destroy();
    };
  }, [closeTopLayer, layerCount]);

  const value = useMemo(() => ({ registerLayer }), [registerLayer]);

  return (
    <BackNavigationContext.Provider value={value}>
      {children}
    </BackNavigationContext.Provider>
  );
}
