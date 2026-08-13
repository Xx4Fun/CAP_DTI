import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  PUBLIC_COMMODITIES_CACHE_KEY,
  PUBLIC_CONFIG_CACHE_KEY,
  PUBLIC_ESTABLISHMENTS_CACHE_KEY,
} from '../app/verifiedCache';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
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
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            background: '#053bc7',
            color: '#ffffff',
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
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 10px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, margin: '0 0 20px' }}>
              PRICE-Watch could not display this screen. Reloading usually fixes a temporary problem and keeps your saved data.
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
              Reload PRICE-Watch
            </button>
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
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
