import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  PUBLIC_COMMODITIES_CACHE_KEY,
  PUBLIC_CONFIG_CACHE_KEY,
  PUBLIC_ESTABLISHMENTS_CACHE_KEY,
} from '../app/verifiedCache';

interface Props {
  children: ReactNode;
  variant?: 'app' | 'route';
  onGoHome?: () => void;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.hasError && state.resetKey !== props.resetKey) {
      return { hasError: false, error: undefined, resetKey: props.resetKey };
    }
    if (!state.hasError && state.resetKey !== props.resetKey) {
      return { resetKey: props.resetKey };
    }
    return null;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onGoHome?.();
  };

  private handleReset = async () => {
    if (!window.confirm('Reset PRICE-Watch saved recovery data? Recent report references will be kept.')) {
      return;
    }

    try {
      sessionStorage.clear();
      localStorage.removeItem(PUBLIC_CONFIG_CACHE_KEY);
      localStorage.removeItem(PUBLIC_COMMODITIES_CACHE_KEY);
      localStorage.removeItem(PUBLIC_ESTABLISHMENTS_CACHE_KEY);
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames.filter((cacheName) => /price-watch|workbox-precache/i.test(cacheName))) {
          await caches.delete(name);
        }
      }
    } catch (error) {
      console.warn('Unable to clear PRICE-Watch recovery data:', error);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isRouteFailure = this.props.variant === 'route';
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      return (
        <div
          style={{
            minHeight: isRouteFailure ? '320px' : '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            background: isRouteFailure ? 'transparent' : '#053bc7',
            color: isRouteFailure ? '#070b50' : '#ffffff',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#070b50',
              borderRadius: '20px',
              padding: '28px 24px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              border: isRouteFailure ? '1px solid #bfdbfe' : 'none',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 10px' }}>
              {isRouteFailure
                ? isOffline ? 'This screen is unavailable offline' : 'This screen could not open'
                : 'Something went wrong'}
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, margin: '0 0 20px' }}>
              {isRouteFailure
                ? isOffline
                  ? 'This part of PRICE-Watch was not saved before the connection was lost. Return Home, or reconnect and retry.'
                  : 'PRICE-Watch could not display this screen. Reloading usually fixes a temporary problem.'
                : 'PRICE-Watch could not display this screen. Reloading usually fixes a temporary problem and keeps your saved data.'}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                background: '#0759ff',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isRouteFailure ? 'Retry screen' : 'Reload PRICE-Watch'}
            </button>
            {isRouteFailure ? (
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  marginTop: '10px',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Go to Home
              </button>
            ) : (
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  marginTop: '10px',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reset app data
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
