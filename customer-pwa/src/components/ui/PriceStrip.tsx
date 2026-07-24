import type { ReactNode } from 'react';

type PriceStripProps = {
  label?: string;
  value: string;
  unit?: string;
  note?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function PriceStrip({
  label = 'Official price',
  value,
  unit,
  note,
  compact = false,
  className = '',
}: PriceStripProps) {
  return (
    <div className={`ui-price-strip ${compact ? 'ui-price-strip--compact' : ''} ${className}`.trim()}>
      <div>
        <span className="ui-price-strip__label">{label}</span>
        <strong className="ui-price-strip__value">
          {value}
          {unit && <small>{unit}</small>}
        </strong>
      </div>
      {note && <div className="ui-price-strip__note">{note}</div>}
    </div>
  );
}
