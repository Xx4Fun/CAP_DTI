import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import css from '../index.css?raw';
import { ProgressiveProductImage } from './ProgressiveProductImage';

describe('ProgressiveProductImage', () => {
  it('reserves the detail image space and reveals an available image only after load', () => {
    const onSettled = vi.fn();
    const { container } = render(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/rice.webp"
        altText="Premium rice"
        variant="detail"
        decorative={false}
        loading="eager"
        onSettled={onSettled}
      />,
    );

    const root = container.querySelector('.progressive-product-image--detail');
    const placeholder = container.querySelector('.progressive-product-image__placeholder');
    const image = screen.getByRole('img', { name: 'Premium rice' });

    expect(root).toHaveClass('progressive-product-image--detail');
    expect(root).not.toHaveAttribute('style');
    expect(placeholder).toHaveClass('is-visible');
    expect(image).toHaveClass('is-loading');
    expect(image).not.toHaveClass('is-loaded');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveStyle({ objectFit: 'contain' });

    fireEvent.load(image);

    expect(placeholder).toHaveClass('is-hidden');
    expect(image).toHaveClass('is-loaded');
    expect(image).not.toHaveClass('is-loading');
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith('loaded');

    fireEvent.load(image);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('shows the neutral fallback immediately for missing and failed images', () => {
    const { container, rerender } = render(
      <ProgressiveProductImage
        imageUrl={null}
        altText="Premium rice"
        variant="detail"
        decorative={false}
      />,
    );

    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(container.querySelector('.progressive-product-image__placeholder')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();

    rerender(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/broken.webp"
        altText="Premium rice"
        variant="detail"
        decorative={false}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Premium rice' }));

    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(container.querySelector('.progressive-product-image__placeholder')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('resets when the URL changes and ignores completion from the earlier image', () => {
    const { container, rerender } = render(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/first.webp"
        altText="First commodity"
        variant="detail"
        decorative={false}
      />,
    );

    const firstImage = screen.getByRole('img', { name: 'First commodity' });
    fireEvent.load(firstImage);
    expect(firstImage).toHaveClass('is-loaded');

    rerender(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/second.webp"
        altText="Second commodity"
        variant="detail"
        decorative={false}
      />,
    );

    const secondImage = screen.getByRole('img', { name: 'Second commodity' });
    expect(secondImage).toHaveAttribute('src', 'https://images.example.test/second.webp');
    expect(secondImage).toHaveClass('is-loading');
    expect(container.querySelector('.progressive-product-image__placeholder')).toHaveClass('is-visible');

    fireEvent.load(firstImage);

    expect(secondImage).toHaveClass('is-loading');
    expect(secondImage).not.toHaveClass('is-loaded');
    expect(container.querySelector('.progressive-product-image__placeholder')).toHaveClass('is-visible');
  });

  it('keeps card images decorative and detail images meaningfully named', () => {
    const { container, rerender } = render(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/card.webp"
        altText="Ignored card label"
        variant="card"
        decorative
      />,
    );

    const cardRoot = container.querySelector('.progressive-product-image--card');
    const cardImage = container.querySelector('img');
    expect(cardRoot).toHaveClass('price-product-media');
    expect(cardRoot).toHaveAttribute('aria-hidden', 'true');
    expect(cardImage).toHaveAttribute('alt', '');
    expect(cardImage).toHaveClass('price-product-image');

    rerender(
      <ProgressiveProductImage
        imageUrl="https://images.example.test/detail.webp"
        altText="Meaningful commodity name"
        variant="detail"
        decorative={false}
      />,
    );

    expect(screen.getByRole('img', { name: 'Meaningful commodity name' })).toBeInTheDocument();
  });

  it('uses a static placeholder and an immediate image reveal', () => {
    expect(css).toMatch(/\.progressive-product-image\s*\{[^}]*position:\s*relative;/);
    expect(css).toMatch(/\.progressive-product-image__placeholder\s*\{[^}]*background:\s*#e8eef6;/);
    expect(css).not.toMatch(/\.progressive-product-image__placeholder\s*\{[^}]*animation:/);
    expect(css).not.toMatch(/\.progressive-product-image__image\s*\{[^}]*transition:/);
  });
});
