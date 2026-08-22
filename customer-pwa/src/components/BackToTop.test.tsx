import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackToTop } from './BackToTop';

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value });
};

const setReducedMotion = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
};

describe('BackToTop', () => {
  beforeEach(() => {
    setScrollY(0);
    setReducedMotion(false);
  });

  afterEach(() => {
    document.querySelectorAll('[data-app-fullscreen-layer]').forEach((element) => element.remove());
    vi.restoreAllMocks();
  });

  it('appears only after the page has scrolled beyond 600 pixels', () => {
    render(<BackToTop />);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    setScrollY(600);
    fireEvent.scroll(window);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    setScrollY(601);
    fireEvent.scroll(window);
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();

    setScrollY(200);
    fireEvent.scroll(window);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();
  });

  it('smoothly returns to the top by default', async () => {
    setScrollY(601);
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<BackToTop />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to top' }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('uses immediate scrolling when reduced motion is preferred', async () => {
    setScrollY(601);
    setReducedMotion(true);
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<BackToTop />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to top' }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('stays unavailable while its parent marks the route as loading', () => {
    setScrollY(601);
    const { rerender } = render(<BackToTop hidden />);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    rerender(<BackToTop hidden={false} />);
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
  });

  it('becomes unavailable while a fullscreen layer is open', async () => {
    setScrollY(601);
    render(<BackToTop />);
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();

    const fullscreenLayer = document.createElement('div');
    fullscreenLayer.dataset.appFullscreenLayer = '';
    act(() => document.body.appendChild(fullscreenLayer));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();
    });

    act(() => fullscreenLayer.remove());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
    });
  });
});
