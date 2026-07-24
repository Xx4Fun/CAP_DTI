import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: 'plain' | 'solid';
};

export function IconButton({
  label,
  children,
  className = '',
  variant = 'plain',
  type = 'button',
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={`ui-icon-button ui-icon-button--${variant} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
