import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { PRICE_SORT_OPTIONS, type PriceSortOption } from '../app/priceSort';
import { useBackLayer } from '../hooks/useBackLayer';

interface PriceSortMenuProps {
  value: PriceSortOption;
  onChange: (value: PriceSortOption) => void;
}

export const PriceSortMenu: React.FC<PriceSortMenuProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, PRICE_SORT_OPTIONS.findIndex((option) => option.value === value));
  const selectedOption = PRICE_SORT_OPTIONS[selectedIndex];
  useBackLayer('price-sort-menu', open, () => {
    setOpen(false);
    triggerRef.current?.focus();
  });

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const openFromKeyboard = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  };

  const focusOption = (index: number) => {
    const normalizedIndex = (index + PRICE_SORT_OPTIONS.length) % PRICE_SORT_OPTIONS.length;
    optionRefs.current[normalizedIndex]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`price-sort-menu${value !== 'default' ? ' is-active' : ''}${open ? ' is-open' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="price-sort-trigger"
        aria-label={`Sort prices: ${selectedOption.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openFromKeyboard(selectedIndex);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openFromKeyboard(selectedIndex);
          }
        }}
      >
        <ArrowUpDown className="price-sort-icon" size={18} aria-hidden="true" />
        <span className="price-sort-label">{selectedOption.label}</span>
        <ChevronDown className="price-sort-chevron" size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="price-sort-listbox"
          role="listbox"
          aria-label="Sort prices"
          onKeyDown={(event) => {
            const focusedIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              focusOption(focusedIndex + 1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              focusOption(focusedIndex - 1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              focusOption(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              focusOption(PRICE_SORT_OPTIONS.length - 1);
            }
          }}
        >
          {PRICE_SORT_OPTIONS.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`price-sort-option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
