import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, CircleAlert, Info, WifiOff } from 'lucide-react';

type StatusBannerProps = {
  variant?: 'info' | 'success' | 'warning' | 'error' | 'offline';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'status' | 'alert';
  className?: string;
};

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: CircleAlert,
  error: AlertCircle,
  offline: WifiOff,
};

export function StatusBanner({
  variant = 'info',
  title,
  children,
  action,
  role = variant === 'error' ? 'alert' : 'status',
  className = '',
}: StatusBannerProps) {
  const Icon = icons[variant];
  return (
    <div className={`ui-status-banner ui-status-banner--${variant} ${className}`.trim()} role={role}>
      <Icon className="ui-status-banner__icon" aria-hidden="true" />
      <div className="ui-status-banner__content">
        <strong>{title}</strong>
        {children && <div>{children}</div>}
      </div>
      {action && <div className="ui-status-banner__action">{action}</div>}
    </div>
  );
}
