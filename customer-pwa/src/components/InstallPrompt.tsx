import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface InstallPromptProps {
  visible: boolean;
}

const DISMISSED_KEY = 'price-watch-install-prompt-dismissed';

export const InstallPrompt: React.FC<InstallPromptProps> = ({ visible }) => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  );
  const [isDismissed, setIsDismissed] = useState(() => {
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (!dismissedUntil) return false;
    return new Date().getTime() < parseInt(dismissedUntil, 10);
  });

  useEffect(() => {
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      if (!isDismissed && !isInstalled) {
        setPromptEvent(event as BeforeInstallPromptEvent);
      }
    };

    const handleInstalled = () => {
      setPromptEvent(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallAvailable);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [isDismissed, isInstalled]);

  const installApp = async () => {
    if (!promptEvent || isInstalling) return;

    setIsInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setPromptEvent(null);
    } finally {
      setIsInstalling(false);
    }
  };

  const dismiss = () => {
    const expiration = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, expiration.toString());
    setIsDismissed(true);
    setPromptEvent(null);
  };

  if (!visible || !promptEvent || isDismissed || isInstalled) return null;

  return (
    <aside
      aria-label="Install PRICE-Watch"
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#eff6ff',
        borderBottom: '1px solid #bfdbfe',
        color: '#1e3a8a',
      }}
    >
      <Download size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Install PRICE-Watch</div>
        <div style={{ fontSize: '0.78rem', lineHeight: 1.35 }}>
          Add it to your device for faster access.
        </div>
      </div>
      <button
        type="button"
        onClick={installApp}
        disabled={isInstalling}
        style={{
          minHeight: '44px',
          padding: '0 14px',
          border: 'none',
          borderRadius: '10px',
          background: '#1d4ed8',
          color: '#ffffff',
          font: 'inherit',
          fontSize: '0.82rem',
          fontWeight: 700,
          cursor: isInstalling ? 'wait' : 'pointer',
          opacity: isInstalling ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {isInstalling ? 'Opening...' : 'Install app'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        style={{
          width: '44px',
          height: '44px',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: '10px',
          background: 'transparent',
          color: '#1e3a8a',
          cursor: 'pointer',
        }}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </aside>
  );
};

export default InstallPrompt;
