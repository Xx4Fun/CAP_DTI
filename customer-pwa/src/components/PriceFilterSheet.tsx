import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { normalizePriceCategory } from '../app/priceFilters';
import { PriceSheet } from './PriceSheet';

export interface PriceFilterSheetProps {
  open: boolean;
  categories: string[];
  appliedCategories: string[];
  onApply: (categories: string[]) => void;
  onCancel: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function hasCategory(categories: string[], category: string): boolean {
  const normalized = normalizePriceCategory(category);
  return categories.some((selected) => normalizePriceCategory(selected) === normalized);
}

export function PriceFilterSheet({
  open,
  categories,
  appliedCategories,
  onApply,
  onCancel,
  triggerRef,
}: PriceFilterSheetProps): React.ReactElement {
  const [draftCategories, setDraftCategories] = useState(appliedCategories);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setDraftCategories(appliedCategories);
    wasOpen.current = open;
  }, [appliedCategories, open]);

  const toggleCategory = (category: string) => {
    if (hasCategory(draftCategories, category)) {
      setDraftCategories((current) => current.filter(
        (selected) => normalizePriceCategory(selected) !== normalizePriceCategory(category),
      ));
      return;
    }
    setDraftCategories((current) => [...current, category]);
  };

  const selectedCountCopy = `${draftCategories.length} ${draftCategories.length === 1 ? 'category' : 'categories'} selected`;

  return (
    <PriceSheet
      open={open}
      sheetId="price-filter"
      title="Filter prices"
      description="Choose one or more product categories."
      dialogLabel="Filters"
      closeLabel="Close filters"
      triggerRef={triggerRef}
      onDismiss={onCancel}
      testId="price-filter-backdrop"
      footer={(
        <footer className="price-filter-actions">
          <button className="price-filter-clear" type="button" onClick={() => setDraftCategories([])}>Clear filters</button>
          <button className="price-filter-apply" type="button" onClick={() => onApply([...draftCategories])}>Apply filters</button>
        </footer>
      )}
    >
      <div className="price-filter-category-group" role="group" aria-label="Product categories">
        <div className="price-filter-section-heading">
          <span aria-live="polite">{selectedCountCopy}</span>
        </div>
        {categories.length === 0 ? (
          <p className="price-filter-empty">No categories available</p>
        ) : categories.map((category) => {
          const selected = hasCategory(draftCategories, category);
          return (
            <label
              className={`price-filter-option${selected ? ' price-filter-option--selected' : ''}`}
              data-price-sheet-option
              key={category}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleCategory(category)}
              />
              <span className="price-filter-option-label">{category}</span>
            </label>
          );
        })}
      </div>
    </PriceSheet>
  );
}
