import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreView } from './MoreView';
import { saveRecentComparison } from '../app/recentComparisons';
import { peekHandoff } from '../app/handoffs';
import type { ComparisonResultResponse } from '../api/client';

describe('MoreView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  const sampleComparison: ComparisonResultResponse = {
    scan_id: 'scan-1',
    store: {
      id: 2,
      store_name: 'San Jose Mart',
      address: 'Tradetown, San Jose',
    },
    product: {
      id: 15,
      commodity_name: 'Mega Sardines Red',
      category: 'Canned Fish',
      unit: '155g',
      baseline_price: 22.00,
      effective_date: '2026-08-01',
    },
    displayed_price: 24.50,
    baseline_price: 22.00,
    reference_price: 22.00,
    comparison_status: 'ABOVE_SRP',
    is_above_reference: true,
    peso_difference: 2.50,
    percent_difference: 11.36,
  };

  it('renders top DTI Antique Provincial Office card with DTI logo and contact buttons', () => {
    render(<MoreView />);

    // DTI Antique card at top
    expect(screen.getByRole('heading', { name: 'DTI Antique Provincial Office', level: 1 })).toBeInTheDocument();
    expect(screen.getByAltText('DTI Antique Provincial Office Logo')).toHaveAttribute('src', '/branding/dti-logo.svg');
    expect(screen.queryByText('San Jose Pilot')).not.toBeInTheDocument();
    expect(screen.queryByText(/San Jose de Buenavista, Antique 5700/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Mon – Fri · 8:00 AM – 5:00 PM/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call DTI Hotline/i })).toHaveAttribute('href', 'tel:0365408736');
    expect(screen.getByRole('link', { name: /Email DTI Antique/i })).toHaveAttribute('href', 'mailto:antique@dti.gov.ph');

    // Removed sections must NOT be in the document
    expect(screen.queryByText('Offline Data & Storage')).not.toBeInTheDocument();
    expect(screen.queryByText('Hardware & Permissions')).not.toBeInTheDocument();
    expect(screen.queryByText('Connection Engine')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Camera')).not.toBeInTheDocument();
    expect(screen.queryByText('Check GPS')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Worker')).not.toBeInTheDocument();
  });

  it('displays active State of Calamity alert when stateOfCalamity is true', () => {
    render(<MoreView stateOfCalamity={true} />);

    expect(screen.getByText('State of Calamity Active')).toBeInTheDocument();
    expect(screen.getByText(/automatic price freeze is enforced/i)).toBeInTheDocument();
  });

  it('renders empty history state when no comparisons are stored and navigates on CTA click', async () => {
    const user = userEvent.setup();
    const mockSetActiveTab = vi.fn();
    render(<MoreView setActiveTab={mockSetActiveTab} />);

    expect(screen.getByRole('heading', { name: 'Price Comparison History', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('No Price Comparisons Yet')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Start a Price Check/i });
    await user.click(startBtn);

    expect(mockSetActiveTab).toHaveBeenCalledWith('compare');
  });

  it('renders price comparison history items, opens dedicated detail view on click, and navigates back', async () => {
    const user = userEvent.setup();

    // Pre-populate comparison
    saveRecentComparison(sampleComparison);

    render(<MoreView />);

    expect(screen.getByText('San Jose Mart')).toBeInTheDocument();
    expect(screen.getByText('Mega Sardines Red')).toBeInTheDocument();
    // Verify redundant prices are omitted from the list cards
    expect(screen.queryByText('₱24.50')).not.toBeInTheDocument();
    expect(screen.queryByText('₱22.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/\+₱2\.50 Above SRP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 check/i)).not.toBeInTheDocument();

    // Click comparison card -> opens dedicated ComparisonHistoryDetail
    const card = screen.getByRole('button', { name: /View comparison for/i });
    await user.click(card);

    // Detail view is rendered
    expect(screen.getByRole('heading', { name: 'Comparison History', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Comparison Result' })).not.toBeInTheDocument();
    expect(screen.getByText(/This comparison is for consumer reference only/i)).toBeInTheDocument();
    expect(screen.getByText('Shelf Price')).toBeInTheDocument();
    expect(screen.queryByText('Displayed Shelf Price')).not.toBeInTheDocument();
    expect(screen.getByText('₱24.50')).toBeInTheDocument();
    expect(screen.getByText('₱22.00')).toBeInTheDocument();
    expect(screen.queryByText('Consumer-entered price')).not.toBeInTheDocument();
    expect(screen.queryByText('Manual entry')).not.toBeInTheDocument();

    // Live scanner action buttons must NOT be present
    expect(screen.queryByText('Edit item or price')).not.toBeInTheDocument();
    expect(screen.queryByText('Compare another item')).not.toBeInTheDocument();
    expect(screen.queryByText('Return to Prices')).not.toBeInTheDocument();
    expect(screen.queryByText('Report using receipt')).not.toBeInTheDocument();

    // Click Back to History button
    const backBtn = screen.getByRole('button', { name: /Back to History/i });
    await user.click(backBtn);

    // Returned to More list view
    expect(screen.getByRole('heading', { name: 'DTI Antique Provincial Office', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('San Jose Mart')).toBeInTheDocument();
  });

  it('shows confirmation dialog before clearing history and supports cancel and confirm', async () => {
    const user = userEvent.setup();
    saveRecentComparison(sampleComparison);

    render(<MoreView />);

    expect(screen.getByText('San Jose Mart')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /Clear all comparison history/i });
    await user.click(clearBtn);

    // Confirmation dialog appears
    const dialog = screen.getByRole('dialog', { name: 'Clear comparison history?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/This will remove all saved price comparison items from this device/i)).toBeInTheDocument();

    // Cancel preserves history
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('San Jose Mart')).toBeInTheDocument();

    // Open dialog again and confirm
    await user.click(clearBtn);
    const confirmBtn = screen.getByRole('button', { name: 'Clear History' });
    await user.click(confirmBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('San Jose Mart')).not.toBeInTheDocument();
    expect(screen.getByText('No Price Comparisons Yet')).toBeInTheDocument();
  });

  it('dismisses clear confirmation dialog when Escape key is pressed', async () => {
    const user = userEvent.setup();
    saveRecentComparison(sampleComparison);

    render(<MoreView />);

    const clearBtn = screen.getByRole('button', { name: /Clear all comparison history/i });
    await user.click(clearBtn);

    expect(screen.getByRole('dialog', { name: 'Clear comparison history?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('San Jose Mart')).toBeInTheDocument();
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
