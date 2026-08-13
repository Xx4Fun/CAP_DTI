import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceStartStatus } from './ServiceStartStatus';

describe('ServiceStartStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('progresses from ordinary loading to starting and delayed recovery guidance', () => {
    vi.useFakeTimers();
    render(<ServiceStartStatus active onRetry={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading current information');
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('status')).toHaveTextContent('Starting the service');
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument();
  });

  it('keeps Retry explicit and actionable', () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(<ServiceStartStatus active onRetry={retry} />);
    act(() => vi.advanceTimersByTime(15_000));

    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
