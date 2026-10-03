import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle, Hourglass } from 'lucide-react';

interface CountdownBadgeProps {
  dueAt: string | null;
  /** A portal notice starts its period when the vendor opens it, not when DTI records delivery. */
  portal?: boolean;
}

export const CountdownBadge: React.FC<CountdownBadgeProps> = ({ dueAt, portal = false }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dueAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [dueAt]);

  if (!dueAt) {
    return (
      <span className="countdown-badge pending">
        <Hourglass size={14} />
        <span>{portal ? 'Open the official document to start your response period' : 'Deadline starts after delivery'}</span>
      </span>
    );
  }

  const diff = new Date(dueAt).getTime() - now;
  if (diff <= 0) {
    return (
      <span className="countdown-badge expired">
        <AlertCircle size={14} />
        <span>Response period expired</span>
      </span>
    );
  }

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return (
    <span className={`countdown-badge ${diff < 86_400_000 ? 'urgent' : ''}`}>
      <Clock size={14} />
      <span>
        {days > 0 ? `${days}d ` : ''}
        {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
        {' remaining'}
      </span>
    </span>
  );
};
