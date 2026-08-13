import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import css from '../index.css?raw';
import { PriceFilterSheet } from './PriceFilterSheet';

const categories = ['Canned Goods', 'Milk', 'Rice'];

class MockCloseWatcher extends EventTarget {
  static instances: MockCloseWatcher[] = [];

  constructor() {
    super();
    MockCloseWatcher.instances.push(this);
  }

  destroy = vi.fn();
}

function FilterHarness({ availableCategories = categories, onApply, onCancel = vi.fn() }: {
  availableCategories?: string[];
  onApply?: (categories: string[]) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [appliedCategories, setAppliedCategories] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Filters</button>
      <output aria-label="Applied categories">
        {appliedCategories.length ? appliedCategories.join(', ') : 'All'}
      </output>
      <PriceFilterSheet
        open={open}
        categories={availableCategories}
        appliedCategories={appliedCategories}
        onApply={(nextCategories) => {
          onApply?.(nextCategories);
          setAppliedCategories(nextCategories);
          setOpen(false);
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
        triggerRef={triggerRef}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  MockCloseWatcher.instances = [];
  delete (window as Window & { CloseWatcher?: typeof MockCloseWatcher }).CloseWatcher;
  document.body.style.overflow = '';
});

describe('PriceFilterSheet', () => {
  it('opens as a dialog and moves focus to Close filters', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close filters' })).toHaveFocus();
  });

  it('groups checkbox filters without showing a redundant Category heading', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    const categoryGroup = screen.getByRole('group', { name: 'Product categories' });
    expect(screen.queryByRole('heading', { name: 'Category' })).not.toBeInTheDocument();
    expect(within(categoryGroup).getByRole('checkbox', { name: 'Canned Goods' })).toBeInTheDocument();
  });

  it('presents helpful filter copy, selection count, and a distinct selected row', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByRole('heading', { name: 'Filter prices', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Choose one or more product categories.')).toBeInTheDocument();
    expect(screen.getByText('0 categories selected')).toBeInTheDocument();

    const cannedGoods = screen.getByRole('checkbox', { name: 'Canned Goods' });
    await user.click(cannedGoods);

    expect(screen.getByText('1 category selected')).toBeInTheDocument();
    expect(cannedGoods.closest('label')).toHaveClass('price-filter-option--selected');
  });

  it('stages multiple categories until Apply filters commits the complete draft', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterHarness onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));

    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(['Canned Goods', 'Milk']);
    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('Canned Goods, Milk');
  });

  it('clears every draft checkbox without closing or changing applied categories', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Canned Goods' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Milk' })).not.toBeChecked();
    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
  });

  it('discards draft changes with X and restores focus to Filters', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    const trigger = screen.getByRole('button', { name: 'Filters' });
    await user.click(trigger);
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));

    await user.click(screen.getByRole('button', { name: 'Close filters' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
    expect(trigger).toHaveFocus();
  });

  it('cancels only direct backdrop pointer-down events', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    fireEvent.pointerDown(screen.getByTestId('price-filter-backdrop').firstElementChild!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('price-filter-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape when CloseWatcher is unavailable', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses CloseWatcher close once without the Escape fallback duplicating cancellation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    Object.defineProperty(window, 'CloseWatcher', { configurable: true, value: MockCloseWatcher });
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    MockCloseWatcher.instances[0].dispatchEvent(new Event('close'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(MockCloseWatcher.instances[0].destroy).toHaveBeenCalledTimes(1));
  });

  it('locks body overflow only while open and restores the exact prior inline value', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'clip';
    render(<FilterHarness />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: 'Close filters' }));

    expect(document.body.style.overflow).toBe('clip');
  });

  it('traps Tab and Shift+Tab among its enabled controls', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const closeButton = screen.getByRole('button', { name: 'Close filters' });
    const applyButton = screen.getByRole('button', { name: 'Apply filters' });

    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(applyButton).toHaveFocus();
    fireEvent.keyDown(applyButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
  });

  it('keeps Apply filters enabled when no categories are available', async () => {
    const user = userEvent.setup();
    render(<FilterHarness availableCategories={[]} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(screen.getByText('No categories available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeEnabled();
  });

  it('includes safe-area spacing and reduced-motion zero-duration transitions', () => {
    const priceFilterActionsCss = css.match(/\.price-filter-actions\s*\{[^}]*\}/)?.[0] ?? '';
    const priceFilterCategoryGroupCss = css.match(/\.price-filter-category-group\s*\{[^}]*\}/)?.[0] ?? '';
    expect(priceFilterActionsCss).toContain('env(safe-area-inset-bottom)');
    expect(priceFilterCategoryGroupCss).toContain('gap: 8px');
    expect(css).toMatch(/\.price-filter-backdrop\s*\{[^}]*transition:\s*opacity 180ms ease, visibility 0ms linear 220ms;/);
    expect(css).toMatch(/\.price-filter-sheet\s*\{[^}]*transition:\s*transform 180ms ease, opacity 180ms ease;/);
    expect(css).toMatch(/\.price-filter-sheet--open\s*\{[^}]*transition-duration:\s*240ms;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.price-filter-backdrop[\s\S]*?transition-duration:\s*0ms/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.price-filter-sheet[\s\S]*?transition-duration:\s*0ms/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.price-filter-sheet--open[\s\S]*?transition-duration:\s*0ms/);
  });

  it('cancels when a primary pointer drag exceeds 96 pixels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 197 });
    fireEvent.pointerUp(sheet, { pointerId: 1, isPrimary: true, clientY: 197 });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('keeps the sheet open and snaps its drag offset back after a 60 pixel drag', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 160 });
    expect(sheet.style.getPropertyValue('--price-filter-drag-y')).toBe('60px');
    fireEvent.pointerUp(sheet, { pointerId: 1, isPrimary: true, clientY: 160 });

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(sheet.style.getPropertyValue('--price-filter-drag-y')).toBe('0px');
  });

  it('never translates upward drags into a negative offset', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 40 });

    expect(sheet.style.getPropertyValue('--price-filter-drag-y')).toBe('0px');
  });

  it('ignores a drag that begins in a scrolled category list', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    const scroller = document.querySelector<HTMLElement>('[data-filter-scroll]')!;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 24 });

    fireEvent.pointerDown(scroller, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(scroller, { pointerId: 1, isPrimary: true, clientY: 220 });
    fireEvent.pointerUp(scroller, { pointerId: 1, isPrimary: true, clientY: 220 });

    expect(onCancel).not.toHaveBeenCalled();
    expect(sheet.style.getPropertyValue('--price-filter-drag-y')).toBe('0px');
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('allows a drag that begins in a category list scrolled to the top to dismiss', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const scroller = document.querySelector<HTMLElement>('[data-filter-scroll]')!;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 });

    fireEvent.pointerDown(scroller, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(scroller, { pointerId: 1, isPrimary: true, clientY: 196 });
    fireEvent.pointerUp(scroller, { pointerId: 1, isPrimary: true, clientY: 196 });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('cancels a swipe without applying staged checkbox selections', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterHarness onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 196 });
    fireEvent.pointerUp(sheet, { pointerId: 1, isPrimary: true, clientY: 196 });

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('does not capture a pointer that begins on an interactive sheet control', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    const setPointerCapture = vi.fn();
    Object.defineProperty(sheet, 'setPointerCapture', { configurable: true, value: setPointerCapture });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close filters' }), {
      pointerId: 1,
      isPrimary: true,
      clientY: 100,
    });

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it('uses the actual pointer-up distance instead of an earlier longer move', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 220 });
    fireEvent.pointerUp(sheet, { pointerId: 1, isPrimary: true, clientY: 160 });

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('keeps the first primary pointer as the active drag owner', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FilterHarness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    fireEvent.pointerDown(sheet, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerDown(sheet, { pointerId: 2, isPrimary: true, clientY: 200 });
    fireEvent.pointerMove(sheet, { pointerId: 1, isPrimary: true, clientY: 197 });
    fireEvent.pointerUp(sheet, { pointerId: 1, isPrimary: true, clientY: 197 });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('dismisses from a category-row text drag at the top without toggling or applying it', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(<FilterHarness onApply={onApply} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const scroller = document.querySelector<HTMLElement>('[data-filter-scroll]')!;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 });
    const categoryText = screen.getByText('Milk');

    fireEvent.pointerDown(categoryText, { pointerId: 1, isPrimary: true, clientY: 100 });
    fireEvent.pointerMove(categoryText, { pointerId: 1, isPrimary: true, clientY: 197 });
    fireEvent.pointerUp(categoryText, { pointerId: 1, isPrimary: true, clientY: 197 });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('declares top-of-list downward-pull touch behavior and restores pan-y after scrolling', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const scroller = document.querySelector<HTMLElement>('[data-filter-scroll]')!;

    expect(scroller).toHaveClass('price-filter-list--at-top');
    expect(css).toMatch(/\.price-filter-list\s*\{[^}]*touch-action:\s*pan-y;/);
    expect(css).toMatch(/\.price-filter-list--at-top\s*\{[^}]*touch-action:\s*pan-down;/);

    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 24 });
    fireEvent.scroll(scroller);

    expect(scroller).not.toHaveClass('price-filter-list--at-top');

    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(scroller);

    expect(scroller).toHaveClass('price-filter-list--at-top');
  });
});
