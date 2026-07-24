import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyButtonProps = {
  value: string;
  label?: string;
  successMessage?: string;
  className?: string;
};

export function CopyButton({
  value,
  label = 'Copy',
  successMessage = 'Reference number copied.',
  className = '',
}: CopyButtonProps) {
  const [announcement, setAnnouncement] = useState('');
  const copied = announcement === successMessage;

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setAnnouncement(successMessage);
    } catch {
      setAnnouncement('Could not copy. Select the text and copy it manually.');
    }
  };

  return (
    <>
      <button
        type="button"
        className={`ui-copy-button ${copied ? 'ui-copy-button--copied' : ''} ${className}`.trim()}
        aria-label={label}
        onClick={copyValue}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <span className="ui-sr-only" role="status" aria-live="polite">{announcement}</span>
    </>
  );
}
