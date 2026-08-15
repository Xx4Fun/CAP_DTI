import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Commodity } from '../api/client';
import { PUBLIC_COMMODITIES_CACHE_KEY, writeVerifiedCache } from '../app/verifiedCache';
import { PRICE_DIRECTORY_VIEW_KEY } from '../app/priceDirectoryState';
import css from '../index.css?raw';
import { SrpSearch } from './SrpSearch';

const { ensureApiReadyMock } = vi.hoisted(() => ({
  ensureApiReadyMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('../api/readiness', () => ({ ensureApiReady: ensureApiReadyMock }));

const liveCommodities = [
  {
    id: 201,
    commodity_name: 'Saba Sardines',
    category: 'Canned Goods',
    regulatory_classification: 'BASIC_NECESSITY',
    baseline_price: 20,
    effective_date: '2026-08-01',
    is_active: true,
  },
  {
    id: 202,
    commodity_name: 'Fresh Milk',
    category: 'Milk',
    regulatory_classification: 'PRIME_COMMODITY',
    baseline_price: 30,
    effective_date: '2026-08-01',
    is_active: true,
  },
  {
    id: 203,
    commodity_name: 'Ground Coffee',
    category: 'Coffee',
    regulatory_classification: 'PRIME_COMMODITY',
    baseline_price: 40,
    effective_date: '2026-08-01',
    is_active: true,
  },
] as Commodity[];

const liveResponse = (commodities: Commodity[]) => ({
  data: { success: true, data: commodities },
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForInitialPricesReveal() {
  await waitFor(() => expect(document.querySelector('.page-loader--blocking')).not.toBeInTheDocument());
}

describe('SrpSearch data source', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/prices');
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the Current SRP label while identifying bundled data separately', async () => {
    localStorage.clear();
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<SrpSearch />);
    expect(await screen.findByText(/Bundled DTI reference list/i)).toBeInTheDocument();
    expect(screen.queryByText(/Saved SRP bulletin/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Current SRP').length).toBeGreaterThan(0);
    expect(screen.queryByText('Reference price')).not.toBeInTheDocument();
  });

  it('shows a fresh verified bulletin cache without warning during an online refresh', () => {
    ensureApiReadyMock.mockReturnValue(new Promise<void>(() => undefined));
    writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, [{
      id: 91,
      commodity_name: 'Verified Cached Rice',
      baseline_price: 52,
      effective_date: '2026-05-11',
      is_active: true,
    }]);
    const getSpy = vi.spyOn(apiClient, 'get');

    render(<SrpSearch />);

    expect(screen.getByText('Verified Cached Rice')).toBeInTheDocument();
    expect(screen.queryByText(/Saved SRP bulletin/i)).not.toBeInTheDocument();
    expect(screen.getByText('Current SRP')).toBeInTheDocument();
    expect(screen.queryByText('Saved reference price')).not.toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('shows the saved bulletin notice only after an online live refresh fails', async () => {
    const request = createDeferred<ReturnType<typeof liveResponse>>();
    writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, liveCommodities);
    vi.spyOn(apiClient, 'get').mockReturnValue(request.promise);

    render(<SrpSearch />);

    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(screen.queryByText(/Saved SRP bulletin/i)).not.toBeInTheDocument();

    await act(async () => request.reject(new Error('live refresh failed')));

    expect(await screen.findByText(/Saved SRP bulletin/i)).toBeInTheDocument();
  });

  it('immediately identifies saved bulletin data when the device is offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    ensureApiReadyMock.mockReturnValue(new Promise<void>(() => undefined));
    writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, liveCommodities);

    render(<SrpSearch />);

    expect(screen.getByText('Offline · Showing saved SRP bulletin')).toBeInTheDocument();
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
  });

  it('does not show a routine current-updated banner for live data', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);

    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.queryByText(/Current.*Updated/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Current SRP')).toHaveLength(3);
  });

  it('reveals the directory together after only its first four images settle', async () => {
    const commodities = Array.from({ length: 5 }, (_, index) => ({
      id: 700 + index,
      commodity_name: `Coordinated item ${index + 1}`,
      category: 'Test goods',
      regulatory_classification: 'BASIC_NECESSITY',
      baseline_price: 20 + index,
      effective_date: '2026-08-01',
      is_active: true,
      image_path: `https://images.example.test/coordinated-${index + 1}.webp`,
    })) as Commodity[];
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(commodities));

    const { container } = render(<SrpSearch />);

    expect(await screen.findByText(/Opening Prices/i)).toBeInTheDocument();
    const directory = screen.getByTestId('price-directory');
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('.price-product-image'));
    expect(directory).toHaveAttribute('aria-hidden', 'true');
    expect(directory).toHaveAttribute('inert');
    expect(images).toHaveLength(5);
    images.slice(0, 4).forEach((image) => expect(image).toHaveAttribute('loading', 'eager'));
    expect(images[4]).toHaveAttribute('loading', 'lazy');

    images.slice(0, 3).forEach((image) => fireEvent.load(image));
    expect(screen.getByText(/Opening Prices/i)).toBeInTheDocument();

    fireEvent.error(images[3]);
    await waitFor(() => expect(screen.queryByText(/Opening Prices/i)).not.toBeInTheDocument());
    expect(directory).not.toHaveAttribute('aria-hidden');
    expect(directory).not.toHaveAttribute('inert');
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('releases a slow initial image cohort after the safety interval', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse([{
      ...liveCommodities[0],
      image_path: 'https://images.example.test/slow.webp',
    }]));

    const { container } = render(<SrpSearch initialImageWaitMs={25} />);

    expect(await screen.findByText(/Opening Prices/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Opening Prices/i)).not.toBeInTheDocument());
    expect(screen.getByTestId('price-directory')).not.toHaveAttribute('aria-hidden');
    expect(container.querySelector('.price-product-image')).toHaveClass('is-loading');
  });

  it('keeps the initial directory behind the centered loader while its first request is pending', async () => {
    const deferred = createDeferred<void>();
    ensureApiReadyMock.mockReturnValue(deferred.promise);
    vi.spyOn(apiClient, 'get');

    const { container } = render(<SrpSearch />);

    expect(await screen.findByText(/Opening Prices/i)).toBeInTheDocument();
    expect(screen.getByTestId('price-directory')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('price-directory')).toHaveAttribute('inert');
    expect(container.querySelectorAll('.price-product-skeleton')).toHaveLength(3);
    expect(container.querySelectorAll('.price-product-skeleton-price')).toHaveLength(3);
    expect(screen.queryByText('0 Reference Prices')).not.toBeInTheDocument();

    deferred.resolve();
  });
});

describe('SrpSearch product showcase cards', () => {
  const showcaseCommodity: Commodity = {
    id: 501,
    commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
    category: 'Bottled Water - Distilled Water',
    unit: '1L',
    regulatory_classification: 'BASIC_NECESSITY',
    baseline_price: 25,
    effective_date: '2026-08-01',
    is_active: true,
    image_path: 'https://images.example.test/absolute.webp',
  };

  beforeEach(() => {
    history.replaceState(null, '', '/prices');
    localStorage.clear();
    sessionStorage.clear();
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens product details from an accessible flat price card', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse([showcaseCommodity]));
    const user = userEvent.setup();
    const setActiveTab = vi.fn();

    const { container } = render(<SrpSearch setActiveTab={setActiveTab} />);

    const eagerImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('.price-product-image');
      expect(image).not.toBeNull();
      return image!;
    });
    fireEvent.load(eagerImage);
    await waitForInitialPricesReveal();

    const card = await screen.findByRole('button', { name: 'View Absolute (1L) price details' });
    expect(card).toHaveClass('price-product-card');
    expect(card.querySelector('.price-product-stage')).not.toBeInTheDocument();
    expect(card.querySelector('.price-product-media')).toBeInTheDocument();
    expect(card.querySelector('.price-product-info-divider')).toBeInTheDocument();
    expect(card.querySelector('.price-product-price-rule')).toBeInTheDocument();
    expect(card.querySelector('.price-product-price-dots')).not.toBeInTheDocument();
    expect(within(card).getByText('Bottled Water - Distilled Water')).toBeInTheDocument();
    expect(within(card).getByText('Basic Necessity')).toBeInTheDocument();
    expect(within(card).getByText('Current SRP')).toBeInTheDocument();
    expect(within(card).getByText('₱25.00')).toBeInTheDocument();

    const image = card.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', showcaseCommodity.image_path);
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('alt', '');
    expect(image?.parentElement).toHaveClass('price-product-media');

    await user.click(card);
    expect(await screen.findByRole('button', { name: /Back to Prices/i })).toBeInTheDocument();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('price-watch-flow-handoff')).toBeNull();
  });

  it('saves the exact list scroll position before opening a product', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse([showcaseCommodity]));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 280 });
    const user = userEvent.setup();

    const { container } = render(<SrpSearch />);
    const eagerImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('.price-product-image');
      expect(image).not.toBeNull();
      return image!;
    });
    fireEvent.load(eagerImage);
    await waitForInitialPricesReveal();
    await user.click(await screen.findByRole('button', { name: 'View Absolute (1L) price details' }));

    expect(JSON.parse(sessionStorage.getItem(PRICE_DIRECTORY_VIEW_KEY) || '{}')).toMatchObject({ scrollY: 280 });
  });

  it('replaces a broken uploaded image with a neutral image fallback', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse([{
      ...showcaseCommodity,
      commodity_name: 'Household Supply Pack',
      category: 'Household Supplies',
    }]));

    const { container } = render(<SrpSearch />);

    const eagerImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('.price-product-image');
      expect(image).not.toBeNull();
      return image!;
    });
    fireEvent.error(eagerImage);
    await waitForInitialPricesReveal();
    const card = await screen.findByRole('button', { name: 'View Household Supply Pack price details' });

    expect(card.querySelector('img')).not.toBeInTheDocument();
    expect(within(card).getByText('No image')).toBeInTheDocument();
    expect(card.querySelector('.price-product-fallback')).toHaveClass('price-product-fallback--neutral');
  });

  it('keeps the image, description, and compact price rail in separate responsive regions', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse([showcaseCommodity]));

    const { container } = render(<SrpSearch />);
    const eagerImage = await waitFor(() => {
      const image = container.querySelector<HTMLImageElement>('.price-product-image');
      expect(image).not.toBeNull();
      return image!;
    });
    fireEvent.load(eagerImage);
    await waitForInitialPricesReveal();
    const card = await screen.findByRole('button', { name: 'View Absolute (1L) price details' });

    expect(card.children).toHaveLength(3);
    expect(card.children[0]).toHaveClass('price-product-media');
    expect(card.children[1]).toHaveClass('price-product-info');
    expect(card.children[2]).toHaveClass('price-product-price');
    expect(card.querySelector('.price-product-name')).toHaveTextContent('Absolute (1L)');
    expect(card.querySelector('.price-product-price-value')).toHaveTextContent('₱25.00');
    expect(css).toMatch(/\.price-product-card\s*\{[^}]*min-height:\s*128px;[^}]*grid-template-columns:\s*94px\s+minmax\(0,\s*1fr\)\s+92px/);
    expect(css).toMatch(/\.price-product-name\s*\{[^}]*font-size:\s*clamp\(0\.82rem,\s*3\.3vw,\s*0\.94rem\)/);
    expect(css).toMatch(/\.price-product-price-value\s*\{[^}]*font-size:\s*clamp\(1rem,\s*4\.5vw,\s*1\.2rem\)/);
    expect(css).toMatch(/\.price-product-card\s*\{[^}]*content-visibility:\s*auto/);
    expect(css).not.toMatch(/\.price-product-price-dots\s*\{/);
  });
});

describe('SrpSearch price filters', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/prices');
    localStorage.clear();
    sessionStorage.clear();
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('restores search, classification, categories, and sort from the session', async () => {
    sessionStorage.setItem(PRICE_DIRECTORY_VIEW_KEY, JSON.stringify({
      searchTerm: 'coffee',
      classification: 'PRIME_COMMODITY',
      categories: ['Coffee'],
      sort: 'name',
      scrollY: 0,
    }));
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);

    expect(await screen.findByText('Ground Coffee')).toBeInTheDocument();
    await waitForInitialPricesReveal();
    expect(screen.queryByText('Saba Sardines')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search products or brands' })).toHaveValue('coffee');
    expect(screen.getByRole('button', { name: 'Prime Commodities' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('1 active category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort prices: Name: A–Z' })).toBeInTheDocument();
  });

  it('stages multiple categories, combines them with classification, and excludes sorting from the badge', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);

    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    await waitForInitialPricesReveal();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All classifications' })).toHaveTextContent('All');
    expect(screen.getByRole('button', { name: 'Basic Necessities' })).toHaveTextContent('Basic Necessities');
    expect(screen.getByRole('button', { name: 'Prime Commodities' })).toHaveTextContent('Prime Commodities');
    expect(screen.queryByLabelText('Category:')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Categories/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 active categories')).toBeInTheDocument();
    expect(screen.getByText('2 Reference Prices')).toBeInTheDocument();
    expect(screen.queryByText(/All regulated categories/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prime Commodities' }));
    expect(screen.queryByText('Saba Sardines')).not.toBeInTheDocument();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.getByLabelText('2 active categories')).toBeInTheDocument();

    const sortButton = screen.getByRole('button', { name: 'Sort prices: Default order' });
    expect(sortButton).toHaveAttribute('aria-haspopup', 'listbox');
    expect(screen.queryByRole('combobox', { name: 'Sort prices' })).not.toBeInTheDocument();

    await user.click(sortButton);
    expect(screen.getByRole('listbox', { name: 'Sort prices' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Default order' }).querySelector('svg')).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Price: High to Low' }));

    expect(screen.queryByRole('listbox', { name: 'Sort prices' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort prices: Price: High to Low' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('2 active categories')).toBeInTheDocument();
    expect(screen.queryByLabelText('3 active categories')).not.toBeInTheDocument();
  });

  it('fits the three classification pills without horizontal scrolling and keeps all controls touch-sized', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    await waitForInitialPricesReveal();

    expect(screen.getByTestId('price-directory')).toHaveClass('price-directory');
    expect(screen.getByRole('heading', { name: 'Price directory' })).toHaveClass('visually-hidden');
    expect(screen.queryByTestId('price-discovery-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Price classification' })).toHaveClass('price-classification-tabs');
    expect(screen.getByRole('button', { name: 'All classifications' })).toHaveTextContent(/^All$/);
    expect(screen.getByRole('button', { name: 'All classifications' })).toHaveClass('price-classification-pill--short');
    expect(screen.getByRole('button', { name: 'Basic Necessities' })).toHaveTextContent(/^Basic Necessities$/);
    expect(screen.getByRole('button', { name: 'Basic Necessities' })).toHaveClass('price-classification-pill--equal');
    expect(screen.getByRole('button', { name: 'Prime Commodities' })).toHaveTextContent(/^Prime Commodities$/);
    expect(screen.getByRole('button', { name: 'Prime Commodities' })).toHaveClass('price-classification-pill--equal');
    expect(screen.getByRole('button', { name: 'Categories' })).toHaveClass('price-toolbar-control');
    expect(screen.getByRole('button', { name: 'Sort prices: Default order' })).toHaveClass('price-sort-trigger');
    expect(css).toMatch(/\.price-classification-tabs\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px/);
    expect(css).not.toMatch(/\.price-classification-tabs\s*\{[^}]*background:/);
    expect(css).not.toMatch(/\.price-classification-tabs\s*\{[^}]*border:/);
    expect(css).not.toMatch(/\.price-discovery-panel\s*\{/);
    expect(css).toMatch(/\.price-classification-pill\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.price-toolbar-control\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.price-sort-trigger\s*\{[^}]*min-height:\s*44px/);

    await user.click(screen.getByRole('button', { name: 'Sort prices: Default order' }));
    expect(screen.getByRole('listbox', { name: 'Sort prices' })).toHaveClass('price-sort-listbox');
    expect(css).toMatch(/\.price-sort-listbox\s*\{[^}]*width:\s*100%/);
  });

  it('closes the inline sort menu without changing the selection on Escape or outside click', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    await waitForInitialPricesReveal();

    const sortButton = screen.getByRole('button', { name: 'Sort prices: Default order' });
    await user.click(sortButton);
    expect(screen.getByRole('listbox', { name: 'Sort prices' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Sort prices' })).not.toBeInTheDocument();
    expect(sortButton).toHaveFocus();

    await user.click(sortButton);
    await user.click(screen.getByRole('textbox', { name: 'Search products or brands' }));
    expect(screen.queryByRole('listbox', { name: 'Sort prices' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort prices: Default order' })).toBeInTheDocument();
  });

  it('discards cleared drafts on cancel, then restores all categories only after Clear and Apply', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    await waitForInitialPricesReveal();

    await user.click(screen.getByRole('button', { name: /Categories/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Categories/i }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 active categories')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Categories/i }));
    expect(screen.getByRole('checkbox', { name: 'Canned Goods' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(screen.queryByLabelText(/active categories/)).not.toBeInTheDocument();
    expect(screen.getByText('3 Reference Prices')).toBeInTheDocument();
    expect(screen.queryByText(/All regulated categories/i)).not.toBeInTheDocument();
  });

  it('searches the complete local catalog without issuing a request per keystroke', async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Saba Sardines')).toBeInTheDocument();
    await waitForInitialPricesReveal();

    await user.type(screen.getByRole('textbox', { name: 'Search products or brands' }), 'coffee');
    await waitFor(() => expect(screen.queryByText('Saba Sardines')).not.toBeInTheDocument());
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('/public/commodities');

    await user.click(screen.getByRole('button', { name: /Categories/i }));
    expect(screen.getByRole('checkbox', { name: 'Canned Goods' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Coffee' })).toBeInTheDocument();
  });

  it('sanitizes an applied category when an unfiltered live refresh removes it', async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Fresh Milk')).toBeInTheDocument();
    await waitForInitialPricesReveal();
    await user.click(screen.getByRole('button', { name: /Categories/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByLabelText('1 active category')).toBeInTheDocument();
    expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument();

    getSpy.mockResolvedValue(liveResponse([liveCommodities[0], liveCommodities[2]]));
    fireEvent.focus(window);

    await waitFor(() => expect(screen.queryByText('Fresh Milk')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByLabelText(/active category/)).not.toBeInTheDocument());
    expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Categories/i }));
    expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument();
  });

  it('keeps saved results visible while the full catalog refreshes in the background', async () => {
    const initialRequest = createDeferred<ReturnType<typeof liveResponse>>();
    writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, liveCommodities);
    vi.spyOn(apiClient, 'get').mockReturnValue(initialRequest.promise);

    render(<SrpSearch />);
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(screen.queryByText('Refreshing reference prices…')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading reference prices...')).not.toBeInTheDocument();

    await act(async () => initialRequest.resolve(liveResponse(liveCommodities.slice(0, 2))));
    await waitFor(() => expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument());
    expect(screen.getAllByText('Current SRP')).toHaveLength(2);
  });

  it('sanitizes a stale open-sheet draft again at the Apply boundary', async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(liveResponse(liveCommodities));

    render(<SrpSearch />);
    expect(await screen.findByText('Fresh Milk')).toBeInTheDocument();
    await waitForInitialPricesReveal();
    await user.click(screen.getByRole('button', { name: /Categories/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await user.click(screen.getByRole('button', { name: /Categories/i }));
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toBeChecked();

    getSpy.mockResolvedValue(liveResponse([liveCommodities[0], liveCommodities[2]]));
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.queryByLabelText(/active filter/)).not.toBeInTheDocument();
    expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
    expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
    expect(screen.getByText('2 Reference Prices')).toBeInTheDocument();
  });
});
