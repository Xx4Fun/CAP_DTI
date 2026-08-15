import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackNavigationProvider } from '../app/backNavigation';
import css from '../index.css?raw';
import { ProductImageLightbox } from './ProductImageLightbox';

const imageUrl = 'https://images.example.test/absolute.webp';
const altText = 'Bottled Water - Distilled Water - Absolute (1L)';

function LightboxHarness({ onDismiss = vi.fn() }: { onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dismiss = () => {
    onDismiss();
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>View product image</button>
      <ProductImageLightbox
        open={open}
        imageUrl={imageUrl}
        altText={altText}
        triggerRef={triggerRef}
        onDismiss={dismiss}
      />
    </>
  );
}

describe('ProductImageLightbox', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/prices/501');
    document.body.style.overflow = '';
  });

  it('opens as a modal, locks scrolling, and restores focus after Escape', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<LightboxHarness onDismiss={onDismiss} />);

    const trigger = screen.getByRole('button', { name: 'View product image' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: `Full image of ${altText}` })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: altText })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close full image' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('dismisses only from a direct backdrop pointer action', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<LightboxHarness onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    fireEvent.pointerDown(screen.getByRole('img', { name: altText }));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('product-image-lightbox'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('lets browser Back dismiss the viewer before leaving the product route', async () => {
    const user = userEvent.setup();
    render(
      <BackNavigationProvider>
        <LightboxHarness />
      </BackNavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'View product image' }));
    await waitFor(() => expect(history.state).toMatchObject({ __priceWatchBackGuard: true }));

    act(() => history.back());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location.pathname).toBe('/prices/501');
  });

  it('provides bounded zoom controls and resets the centered image', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    const image = screen.getByRole('img', { name: altText });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const reset = screen.getByRole('button', { name: 'Reset zoom' });

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
    expect(reset).toBeDisabled();

    await user.click(zoomIn);
    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(image).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(1.5)' });

    for (let index = 0; index < 5; index += 1) await user.click(zoomIn);
    expect(screen.getByText('400%')).toBeInTheDocument();
    expect(zoomIn).toBeDisabled();

    await user.click(reset);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(image).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(1)' });
  });

  it('supports wheel and double-click zoom without dismissing the viewer', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    const viewport = screen.getByTestId('product-image-lightbox-viewport');
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(screen.getByText('150%')).toBeInTheDocument();

    fireEvent.doubleClick(viewport);
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.doubleClick(viewport);
    expect(screen.getByText('200%')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toggles touch double-tap zoom without mistaking a drag for a tap', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    const viewport = screen.getByTestId('product-image-lightbox-viewport');
    const doubleTap = (pointerId: number) => {
      fireEvent.pointerDown(viewport, { pointerId, pointerType: 'touch', clientX: 140, clientY: 140 });
      fireEvent.pointerUp(viewport, { pointerId, pointerType: 'touch', clientX: 140, clientY: 140 });
    };

    doubleTap(10);
    doubleTap(11);
    expect(screen.getByText('200%')).toBeInTheDocument();

    doubleTap(12);
    doubleTap(13);
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.pointerDown(viewport, { pointerId: 14, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 14, pointerType: 'touch', clientX: 140, clientY: 140 });
    fireEvent.pointerUp(viewport, { pointerId: 14, pointerType: 'touch', clientX: 140, clientY: 140 });
    doubleTap(15);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('supports pinch zoom and one-finger pan while zoomed', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    const viewport = screen.getByTestId('product-image-lightbox-viewport');
    const image = screen.getByRole('img', { name: altText });
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(image, 'clientWidth', { configurable: true, value: 260 });
    Object.defineProperty(image, 'clientHeight', { configurable: true, value: 260 });

    fireEvent.pointerDown(viewport, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 150 });
    fireEvent.pointerDown(viewport, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 150 });
    fireEvent.pointerMove(viewport, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 150 });
    expect(screen.getByText('150%')).toBeInTheDocument();
    fireEvent.pointerUp(viewport, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 150 });
    fireEvent.pointerUp(viewport, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 150 });

    fireEvent.pointerDown(viewport, { pointerId: 3, pointerType: 'touch', clientX: 120, clientY: 120 });
    fireEvent.pointerMove(viewport, { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 140 });
    expect(image.style.transform).not.toContain('translate3d(0px, 0px, 0)');
    fireEvent.pointerUp(viewport, { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 140 });
  });

  it('keeps focus within the viewer controls', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    const close = screen.getByRole('button', { name: 'Close full image' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    zoomIn.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(zoomIn).toHaveFocus();
  });

  it('keeps the dialog usable when the enlarged image fails', async () => {
    const user = userEvent.setup();
    render(<LightboxHarness />);
    await user.click(screen.getByRole('button', { name: 'View product image' }));

    fireEvent.error(screen.getByRole('img', { name: altText }));

    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close full image' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('uses a full-viewport dark scrim, safe controls, and reduced-motion fallback', () => {
    expect(css).toMatch(/\.product-image-lightbox\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.92\)/);
    expect(css).toMatch(/\.product-image-lightbox__close\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(css).toMatch(/\.product-image-lightbox__viewport\s*\{[^}]*touch-action:\s*none/);
    expect(css).toMatch(/\.product-image-lightbox__image\s*\{[^}]*object-fit:\s*contain/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.product-image-lightbox[\s\S]*?animation:\s*none/);
  });
});
