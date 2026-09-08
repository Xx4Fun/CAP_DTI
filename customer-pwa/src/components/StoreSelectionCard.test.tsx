import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoreSelectionCard } from './StoreSelectionCard';

const store = {
  id: 1, store_name: 'Gaisano Grand Mall', address: 'Bagumbayan Bridge', latitude: 10.74329, longitude: 121.94845,
  image_path: '/stores/gaisano-grand.webp',
};

describe('StoreSelectionCard', () => {
  it('renders its API-provided establishment photo and falls back after a failed load', () => {
    render(<StoreSelectionCard store={store} isFavorite={false} onActivate={vi.fn()} onToggleFavorite={vi.fn()} />);

    const image = document.querySelector('.store-card-photo')!;
    expect(image).toHaveAttribute('src', '/stores/gaisano-grand.webp');
    fireEvent.error(image);
    expect(document.querySelector('.store-card-photo')).not.toBeInTheDocument();
    expect(screen.getByText('GG')).toBeInTheDocument();
  });
});
