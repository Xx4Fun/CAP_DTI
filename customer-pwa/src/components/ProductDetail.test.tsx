import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Commodity } from '../api/client';
import css from '../index.css?raw';
import { ProductDetail } from './ProductDetail';

const commodity: Commodity = {
  id: 501,
  commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
  category: 'Bottled Water - Distilled Water',
  unit: '1L',
  regulatory_classification: 'BASIC_NECESSITY',
  baseline_price: 25,
  effective_date: '2026-08-01',
  source_reference: 'DTI-SRP-2026-08',
  is_active: true,
  image_path: 'https://images.example.test/absolute.webp',
};

describe('ProductDetail regulatory truthfulness', () => {
  it('keeps supporting dates and source out of the price hero but available on demand', async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={Date.UTC(2026, 7, 12, 1, 30)}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Current SRP')).toHaveLength(1);
    expect(screen.queryByText(/Aug 1, 2026/i)).not.toBeInTheDocument();
    expect(screen.queryByText('DTI-SRP-2026-08')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reference details/i }));

    expect(screen.getByText('Aug 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('DTI-SRP-2026-08')).toBeInTheDocument();
    expect(screen.queryByText('Nationwide')).not.toBeInTheDocument();
  });

  it('does not invent missing dates, scope, source, or a normal regulatory state', async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        commodity={{ ...commodity, effective_date: null, source_reference: null, regulatory_state: undefined }}
        dataSource="cached"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Current SRP')).toHaveLength(1);
    expect(screen.queryByText('Saved reference price')).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-05-11/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nationwide')).not.toBeInTheDocument();
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reference details/i }));
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0);
  });

  it('uses a white product image surface and opens a full-image viewer only after the image loads', async () => {
    const user = userEvent.setup();
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);

    const image = screen.getByRole('img', { name: commodity.commodity_name });
    expect(image).toHaveStyle({ objectFit: 'contain' });
    expect(image.closest('.product-detail-image-stage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `View full image of ${commodity.commodity_name}` })).not.toBeInTheDocument();

    fireEvent.load(image);

    const imageButton = screen.getByRole('button', { name: `View full image of ${commodity.commodity_name}` });
    await user.click(imageButton);

    const dialog = screen.getByRole('dialog', { name: `Full image of ${commodity.commodity_name}` });
    expect(within(dialog).getByRole('img', { name: commodity.commodity_name })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close full image' })).toHaveFocus();
  });

  it('places the product image before the category, name, and price in document order', () => {
    const { container } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );

    const imageStage = container.querySelector('.product-detail-image-stage');
    const category = container.querySelector('.product-detail-category');
    const heading = screen.getByRole('heading', { name: /Absolute \(1L\)/i });
    const priceLabel = screen.getByText('Current SRP');
    const referenceDisclosure = screen.getByRole('button', { name: /Reference details/i });

    expect(imageStage).not.toBeNull();
    expect(category).not.toBeNull();
    expect(imageStage!.compareDocumentPosition(category!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(category!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(priceLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priceLabel.compareDocumentPosition(referenceDisclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('replaces failed images with the neutral fallback and does not offer the viewer', () => {
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);

    const image = screen.getByRole('img', { name: commodity.commodity_name });
    fireEvent.error(image);

    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View full image/i })).not.toBeInTheDocument();
  });

  it('removes the duplicate unit line and reveals supporting facts in one disclosure', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={Date.UTC(2026, 7, 12, 1, 30)}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /Absolute \(1L\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/^1L$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Price information' })).not.toBeInTheDocument();

    const disclosure = screen.getByRole('button', { name: /Reference details/i });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);

    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const facts = container.querySelector('.product-detail-facts');
    expect(facts?.tagName).toBe('DL');
    expect(within(facts as HTMLElement).getByText('Classification').tagName).toBe('DT');
    expect(within(facts as HTMLElement).getByText('DTI-SRP-2026-08').tagName).toBe('DD');
  });

  it('defines a full-width 4:3 image and no product-detail action layout at any breakpoint', () => {
    const detailRules = [...css.matchAll(/\.product-detail\s*\{([^}]*)\}/g)].map((match) => match[1]);
    const heroRules = [...css.matchAll(/\.product-detail-hero\s*\{([^}]*)\}/g)].map((match) => match[1]);
    const imageStageRules = [...css.matchAll(/\.product-detail-image-stage\s*\{([^}]*)\}/g)].map((match) => match[1]);
    const actionRules = [...css.matchAll(/\.product-detail-actions\s*\{([^}]*)\}/g)].map((match) => match[1]);

    expect(detailRules[0]).toMatch(/width:\s*100%/);
    expect(detailRules[0]).toMatch(/max-width:\s*720px/);
    expect(detailRules[0]).toMatch(/margin-inline:\s*auto/);
    expect(heroRules).toHaveLength(1);
    expect(heroRules[0]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(imageStageRules).toHaveLength(1);
    expect(imageStageRules[0]).toMatch(/width:\s*100%/);
    expect(imageStageRules[0]).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
    expect(imageStageRules[0]).not.toMatch(/clamp\(240px|280px/);
    expect(imageStageRules[0]).toMatch(/background:\s*#ffffff/);
    expect(css).toMatch(/\.progressive-product-image--detail\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/);
    expect(actionRules).toHaveLength(0);
    expect(css).not.toMatch(/\.product-detail-action(?:s|--|\s|:)/);
  });

  it('uses plain price typography and keeps confirmed monitoring in Reference details', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
        stateOfCalamity={false}
      />,
    );

    const category = container.querySelector('.product-detail-category');
    const priceBlock = container.querySelector('.product-detail-price-block');

    expect(category).toHaveTextContent('Bottled water - Distilled water');
    expect(priceBlock).not.toBeNull();
    expect(within(priceBlock as HTMLElement).getByText('Current SRP')).toBeInTheDocument();
    expect(within(priceBlock as HTMLElement).getByText('₱25.00')).toBeInTheDocument();
    expect(container.querySelector('.product-detail-price-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring status')).not.toBeInTheDocument();
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reference details/i }));
    const facts = container.querySelector('.product-detail-facts');
    expect(within(facts as HTMLElement).getByText('Monitoring status')).toBeInTheDocument();
    expect(within(facts as HTMLElement).getByText('Normal monitoring')).toBeInTheDocument();

    expect(css).toMatch(/\.product-detail-category\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;[^}]*text-transform:\s*none/);
    expect(css).not.toMatch(/\.product-detail-price-panel/);
    const priceBlockRules = css.match(/\.product-detail-price-block\s*\{([^}]*)\}/)?.[1] || '';
    expect(priceBlockRules).not.toMatch(/background|border|box-shadow/);
    expect(css).toMatch(/\.product-detail-reference\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none/);
    expect(css).toMatch(/\.product-detail-freeze\s*\{[^}]*background:\s*#fff8e7/);
  });

  it.each([
    ['BOTTLED WATER - DISTILLED WATER', 'Bottled water - Distilled water'],
    ['Bottled Water - Distilled Water', 'Bottled water - Distilled water'],
    ['CORN OIL - SOY SAUCE', 'Corn oil - Soy sauce'],
    ['Condiments - Soy Sauce (Gin / PET Bottle)', 'Condiments - Soy sauce (gin / PET bottle)'],
  ])('renders the category path in sentence case: %s', (category, expectedCategory) => {
    const { container } = render(
      <ProductDetail
        commodity={{ ...commodity, category }}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );

    expect(container.querySelector('.product-detail-category')).toHaveTextContent(expectedCategory);
  });

  it('omits unknown monitoring and reveals a confirmed normal state only inside Reference details', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reference details/i }));
    expect(screen.queryByText('Monitoring status')).not.toBeInTheDocument();

    rerender(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
        stateOfCalamity={false}
      />,
    );
    expect(screen.getByText('Normal monitoring')).toBeInTheDocument();
    expect(screen.getByText('Monitoring status')).toBeInTheDocument();
  });

  it('closes and resets the image viewer when the selected commodity changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    fireEvent.load(screen.getByRole('img', { name: commodity.commodity_name }));
    await user.click(screen.getByRole('button', { name: `View full image of ${commodity.commodity_name}` }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const nextCommodity = {
      ...commodity,
      id: 502,
      commodity_name: 'Canned Sardines - Tomato Sauce - Sample Brand (155g)',
      image_path: 'https://images.example.test/sardines.webp',
    };
    rerender(
      <ProductDetail commodity={nextCommodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: nextCommodity.commodity_name })).toHaveClass('is-loading');
    expect(screen.queryByRole('button', { name: /View full image/i })).not.toBeInTheDocument();
  });

  it('keeps the product reference informational without scan or report actions', () => {
    render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Scan shelf price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Report a concern/i })).not.toBeInTheDocument();
    expect(document.querySelector('.product-detail-actions')).not.toBeInTheDocument();
  });

  it('shows only item-supported price-freeze treatment without fixed duration or penalty claims', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Price-freeze information/i })).not.toBeInTheDocument();

    rerender(
      <ProductDetail
        commodity={{ ...commodity, price_freeze_applicable: true, price_freeze_treatment: 'Use the active local price-freeze bulletin.' }}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Price-freeze information/i })).not.toBeInTheDocument();

    rerender(
      <ProductDetail
        commodity={{ ...commodity, price_freeze_applicable: true, price_freeze_treatment: 'Use the active local price-freeze bulletin.' }}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
        stateOfCalamity
      />,
    );
    const freezeDisclosure = screen.getByRole('button', { name: /Price-freeze information/i });
    const freezeSection = freezeDisclosure.closest('.product-detail-freeze');
    const referenceSection = screen.getByRole('button', { name: /Reference details/i }).closest('.product-detail-reference');
    const priceBlock = document.querySelector('.product-detail-price-block');
    expect(screen.queryByText('Price freeze coverage')).not.toBeInTheDocument();
    expect(priceBlock).not.toBeNull();
    expect(freezeSection).not.toBeNull();
    expect(referenceSection).not.toBeNull();
    expect(priceBlock!.compareDocumentPosition(freezeSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(freezeSection!.compareDocumentPosition(referenceSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Price-freeze information/i }));
    expect(screen.getByText('Use the active local price-freeze bulletin.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reference details/i }));
    expect(screen.getByText('Price freeze coverage')).toBeInTheDocument();
    expect(screen.queryByText(/60 days/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/penalt/i)).not.toBeInTheDocument();
  });
});
