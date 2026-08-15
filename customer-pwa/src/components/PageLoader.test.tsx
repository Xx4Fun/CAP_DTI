import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageLoader, type PageLoaderDestination } from './PageLoader';
import css from '../index.css?raw';
import '../index.css';

describe('PageLoader', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['home', 'Opening Home…'],
    ['prices', 'Opening Prices…'],
    ['scan', 'Opening Scanner…'],
    ['reports', 'Opening Reports…'],
    ['track', 'Opening Report Status…'],
  ] satisfies Array<[PageLoaderDestination, string]>)('announces the %s destination after the short delay', (destination, copy) => {
    vi.useFakeTimers();
    render(<PageLoader destination={destination} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(174));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent(copy);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(document.querySelector('.page-loader-spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  it('progresses to connection and recovery guidance during a long wait', () => {
    vi.useFakeTimers();
    render(<PageLoader destination="prices" />);

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to PRICE-Watch…');

    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual');
    expect(screen.getByRole('button', { name: 'Retry opening Prices' })).toBeInTheDocument();
  });

  it('uses the supplied recovery action', () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<PageLoader destination="prices" onRetry={onRetry} />);
    act(() => vi.advanceTimersByTime(15_000));

    fireEvent.click(screen.getByRole('button', { name: 'Retry opening Prices' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('reports its pending lifetime so the app can avoid stacked status loaders', () => {
    const onPendingChange = vi.fn();
    const view = render(<PageLoader destination="reports" onPendingChange={onPendingChange} />);

    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('stays visible when navigation changes to another destination during a slow load', () => {
    vi.useFakeTimers();
    const view = render(<PageLoader destination="prices" />);
    act(() => vi.advanceTimersByTime(175));
    expect(screen.getByRole('status')).toHaveTextContent('Opening Prices…');

    view.rerender(<PageLoader destination="scan" />);

    expect(screen.getByRole('status')).toHaveTextContent('Opening Scanner…');
  });

  it('centers in the usable screen without blocking its recovery action', () => {
    vi.useFakeTimers();
    render(<PageLoader destination="home" />);
    act(() => vi.advanceTimersByTime(15_000));

    const loaderStyle = getComputedStyle(screen.getByRole('status'));
    const spinnerStyle = getComputedStyle(document.querySelector('.page-loader-spinner')!);
    const retryStyle = getComputedStyle(screen.getByRole('button', { name: 'Retry opening Home' }));

    expect(loaderStyle.position).toBe('fixed');
    expect(loaderStyle.top).toBe('var(--header-height)');
    expect(loaderStyle.bottom).toBe('calc(var(--nav-height) + max(12px, env(safe-area-inset-bottom)))');
    expect(loaderStyle.minHeight).toBe('0px');
    expect(loaderStyle.zIndex).toBe('90');
    expect(loaderStyle.pointerEvents).toBe('none');
    expect(loaderStyle.borderStyle).toBe('none');
    expect(loaderStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(spinnerStyle.width).toBe('32px');
    expect(spinnerStyle.height).toBe('32px');
    expect(retryStyle.pointerEvents).toBe('auto');
  });

  it('can cover and block a mounted page while its visible content settles', () => {
    render(<PageLoader destination="prices" delayMs={0} blocking />);

    const loader = screen.getByRole('status');
    const loaderStyle = getComputedStyle(loader);
    expect(loader).toHaveClass('page-loader--blocking');
    expect(loader).toHaveTextContent('Opening Prices');
    expect(loaderStyle.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(loaderStyle.pointerEvents).toBe('auto');
  });

  it('keeps the page loader spinner rotating when reduced motion is requested', () => {
    const reducedMotionRules = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

    expect(css).toMatch(/\.page-loader-spinner\s*\{[^}]*animation:\s*page-loader-spin 0\.8s linear infinite;/);
    expect(reducedMotionRules).not.toMatch(/\.page-loader-spinner\s*\{[^}]*animation:\s*none;/);
  });
});
