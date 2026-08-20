import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreView } from './MoreView';

describe('MoreView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page header, offline sync info, and DTI Antique contact info', () => {
    render(
      <MoreView
        lastSyncTime="10:30:00 AM"
        bulletinDate="15 Aug 2026"
        totalCommodities={48}
      />
    );

    expect(screen.getByRole('heading', { name: 'More & Help', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Offline Data & Storage')).toBeInTheDocument();
    expect(screen.getByText(/15 Aug 2026/i)).toBeInTheDocument();
    expect(screen.getByText('48 items')).toBeInTheDocument();
    expect(screen.getByText('10:30:00 AM')).toBeInTheDocument();
    expect(screen.getAllByText('DTI Antique Provincial Office').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Call DTI Hotline/i })).toHaveAttribute('href', 'tel:0365408736');
    expect(screen.getByRole('link', { name: /Email DTI Antique/i })).toHaveAttribute('href', 'mailto:antique@dti.gov.ph');
  });

  it('displays clean hardware labels without subtext', () => {
    render(<MoreView />);

    expect(screen.getByText('Camera')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Service Worker')).toBeInTheDocument();
    expect(screen.queryByText(/Required for barcode/i)).not.toBeInTheDocument();
  });

  it('displays active State of Calamity alert when stateOfCalamity is true', () => {
    render(
      <MoreView
        stateOfCalamity={true}
      />
    );

    expect(screen.getByText('State of Calamity Active')).toBeInTheDocument();
    expect(screen.getByText(/automatic price freeze is enforced/i)).toBeInTheDocument();
  });

  it('triggers manual sync and displays success message', async () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <MoreView
        onRefreshData={mockRefresh}
      />
    );

    const syncButton = screen.getByRole('button', { name: /Sync Latest SRP/i });
    fireEvent.click(syncButton);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('Price bulletin and store records updated successfully.')).toBeInTheDocument();
    });
  });

  it('defaults accordions to closed and expands when clicked', async () => {
    const user = userEvent.setup();
    render(<MoreView />);

    // Initially both accordions are closed
    expect(screen.queryByText(/1\. Baseline SRP Protection:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cryptographic Sealing:/i)).not.toBeInTheDocument();

    // Click Price Act accordion
    const priceActBtn = screen.getByRole('button', { name: /Republic Act No\. 7581/i });
    await user.click(priceActBtn);

    expect(screen.getByText(/1\. Baseline SRP Protection:/i)).toBeInTheDocument();

    // Click Privacy & Anonymity accordion
    const privacyAccordionBtn = screen.getByRole('button', { name: /Tamper-Proof Evidence Vault/i });
    await user.click(privacyAccordionBtn);

    expect(screen.getByText(/Cryptographic Sealing:/i)).toBeInTheDocument();
    expect(screen.queryByText(/1\. Baseline SRP Protection:/i)).not.toBeInTheDocument();
  });
});
