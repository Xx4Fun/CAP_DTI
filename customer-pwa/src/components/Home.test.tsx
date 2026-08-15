import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../index.css';
import { Home } from './Home';
import { Navbar } from './Navbar';

const realReports = [
  {
    date: '9 Aug 2026',
    time: '4:15 PM',
    reportId: '#REP-REAL-001',
    store: 'Verified Market',
    status: 'Submitted' as const,
  },
  {
    date: '8 Aug 2026',
    time: '9:30 AM',
    reportId: '#REP-REAL-002',
    store: 'Town Center Grocery',
    status: 'Under review' as const,
  },
];

describe('approved Home experience', () => {
  it('renders the approved hero artwork and the real bulletin values supplied by App', () => {
    render(
      <Home
        setActiveTab={vi.fn()}
        stateOfCalamity={false}
        bulletinDate="9 Aug 2026"
        totalCommodities={42}
        lastSyncTime="4:15 PM"
        bulletinStatus="available"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Check prices with confidence' })).toBeInTheDocument();
    expect(screen.getByText('Verify prices, report concerns, and stay informed.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Grocery basket with essential goods' })).toHaveAttribute('src', '/home/1.webp');
    expect(screen.getByRole('img', { name: 'Current price bulletin illustration' })).toHaveAttribute('src', '/home/2.webp');
    expect(screen.getByRole('img', { name: 'Consumer rights protection illustration' })).toHaveAttribute('src', '/home/3.webp');
    expect(screen.getByText('9 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('42 available')).toBeInTheDocument();
    expect(screen.getByText('4:15 PM')).toBeInTheDocument();
    expect(screen.queryByText('167 available')).not.toBeInTheDocument();
  });

  it('hides an unresolved regulatory status from the Home bulletin', () => {
    const { container } = render(<Home setActiveTab={vi.fn()} />);

    expect(screen.queryByText(/Regulatory status unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Calamity active')).not.toBeInTheDocument();
    expect(container.querySelector('.home-monitoring-status')).not.toBeInTheDocument();
  });

  it('hides the shared unavailable alert while retaining the active Price Freeze alert', () => {
    const { rerender } = render(
      <Navbar activeTab="home" setActiveTab={vi.fn()} />,
    );

    expect(screen.queryByText(/Regulatory status unavailable/i)).not.toBeInTheDocument();

    rerender(<Navbar activeTab="home" setActiveTab={vi.fn()} stateOfCalamity />);
    expect(screen.getByText(/Price Freeze active/i)).toBeInTheDocument();
  });

  it('keeps the established action keys for scan, report, prices, and tracking', async () => {
    const setActiveTab = vi.fn();
    const user = userEvent.setup();
    render(<Home setActiveTab={setActiveTab} stateOfCalamity={false} />);

    await user.click(screen.getByRole('button', { name: 'Scan shelf tag' }));
    await user.click(screen.getByRole('button', { name: 'Report concern' }));
    await user.click(screen.getByRole('button', { name: 'View bulletin details' }));
    await user.click(screen.getByRole('button', { name: 'Report a price concern' }));

    expect(setActiveTab.mock.calls).toEqual([
      ['scan'],
      ['reports'],
      ['prices'],
      ['reports'],
    ]);
  });

  it('shows the report empty state instead of fabricated tickets when no real reports exist', () => {
    render(<Home setActiveTab={vi.fn()} stateOfCalamity={false} />);

    expect(screen.queryByLabelText('Recent reports')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'No reports yet' })).toBeInTheDocument();
    expect(screen.getByText('Have a price concern? Submit a receipt for DTI review.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report a price concern' })).toBeInTheDocument();
  });

  it('renders the ticket carousel only for real reports supplied by the application', () => {
    render(<Home setActiveTab={vi.fn()} stateOfCalamity={false} recentReports={realReports} />);

    expect(screen.getByLabelText('Recent reports')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: /Report REP-REAL-/ })).toHaveLength(2);
    expect(screen.getAllByText('Submitted')).toHaveLength(1);
    expect(screen.getAllByText('Under review')).toHaveLength(1);
    expect(screen.queryByText('No reports yet')).not.toBeInTheDocument();
  });

  it('keeps recent-report tickets compact and allows the side cutouts to remain open', () => {
    render(<Home setActiveTab={vi.fn()} stateOfCalamity={false} recentReports={realReports} />);

    const ticket = screen.getByRole('article', { name: 'Report REP-REAL-001' });
    const ticketStyle = getComputedStyle(ticket);

    expect(ticketStyle.overflow).toBe('visible');
    expect(ticketStyle.minWidth).toBe('min(220px, 70vw)');
    expect(ticketStyle.maxWidth).toBe('220px');
  });

  it('presents the DTI logo as a decorative mark inside a contrasting header badge', () => {
    const { container } = render(<Navbar activeTab="home" setActiveTab={vi.fn()} stateOfCalamity={false} />);

    const logo = container.querySelector<HTMLImageElement>('.brand-logo');
    const frame = container.querySelector<HTMLElement>('.brand-logo-frame');

    expect(logo).toHaveAttribute('src', '/branding/dti-logo.png');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo.parentElement).toHaveClass('brand-logo-frame');
    expect(getComputedStyle(frame!).backgroundColor).toBe('rgb(247, 250, 255)');
    expect(getComputedStyle(frame!).borderRadius).toBe('12px');
    expect(getComputedStyle(logo!).objectFit).toBe('contain');
  });

  it.each(['home', 'prices', 'scan', 'reports', 'track'])(
    'uses the same Home-style header on the %s section',
    (activeTab) => {
      render(<Navbar activeTab={activeTab} setActiveTab={vi.fn()} stateOfCalamity={false} />);

      expect(screen.getByRole('banner')).toHaveClass('navbar-top');
      expect(screen.getByRole('banner')).not.toHaveClass('navbar-top-home');
    },
  );

  it('pins the shared header to the viewport while reserving its layout space', () => {
    const { container } = render(
      <Navbar activeTab="prices" setActiveTab={vi.fn()} stateOfCalamity={false} />,
    );

    const header = screen.getByRole('banner');
    const offset = container.querySelector('.navbar-top-offset');
    const headerStyle = getComputedStyle(header);
    const offsetStyle = getComputedStyle(offset as Element);

    expect(headerStyle.position).toBe('fixed');
    expect(headerStyle.top).toBe('0px');
    expect(offset).toHaveAttribute('aria-hidden', 'true');
    expect(headerStyle.height).not.toBe('');
    expect(offsetStyle.height).toBe(headerStyle.height);
  });

  it('keeps five bottom navigation actions and uses Profile to open the existing menu', async () => {
    const user = userEvent.setup();
    render(<Navbar activeTab="home" setActiveTab={vi.fn()} stateOfCalamity={false} />);

    for (const label of ['Home', 'Prices', 'Scan', 'Reports', 'Profile']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.getByRole('button', { name: 'Track Report' })).toBeInTheDocument();
  });
});
