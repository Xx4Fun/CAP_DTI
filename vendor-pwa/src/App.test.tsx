// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { LegalNotice, SrpCatalog, SrpItem, VendorOverview } from './app/types';
import { vendorApi } from './services/vendorApi';
import { get } from './offline/repository';
import { waitForDeliveryIdle } from './offline/workspace';

vi.mock('./app/pwaRegistration', () => ({
  useRegisterSW: () => ({ needRefresh: [false, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker: vi.fn() }),
}));

vi.mock('./services/vendorApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/vendorApi')>();
  return {
    ...actual,
    vendorApi: {
      login: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), overview: vi.fn(), notices: vi.fn(), document: vi.fn(),
      respond: vi.fn(), srp: vi.fn(), advisories: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn(), acceptInvitation: vi.fn(),
      conversation: vi.fn(), sendMessage: vi.fn(), messageAttachment: vi.fn(),
    },
  };
});

const api = vi.mocked(vendorApi);
const future = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

const overview: VendorOverview = {
  user: { id: 5, name: 'Maria Clara', email: 'vendor@grocery.com' },
  stores: [{ id: 1, store_name: 'Antique Grocery Mart', address: 'San Jose, Antique', dti_sec_number: 'SEC-12345', recidivism_index: 0, last_inspected_at: '2026-09-10T02:00:00Z', compliance_status: 'UNDER_INQUIRY', open_notice_count: 1 }],
  emergency: null,
};

const notice = (overrides: Partial<LegalNotice> = {}): LegalNotice => ({
  id: 11, store_id: 1, control_number: 'PM-2026-LOI-000011', notice_type: 'LOI', status: 'issued', issued_at: '2026-09-11T02:00:00Z',
  delivery_state: 'received', delivered_at: '2026-09-12T02:00:00Z', due_date_timestamp: future(),
  response_text: null, response_reason_category: null, response_certified_at: null, response_received_at: null, closed_at: null,
  store: { id: 1, store_name: 'Antique Grocery Mart', address: 'San Jose, Antique' }, monitoring_date: '2026-09-10T02:00:00Z',
  flagged_items: [{ commodity_name: 'Regular Milled Rice', unit: 'kg', observed_price: 45, reference_value: 38, reference_label: 'SRP baseline (provisional)', variance_percent: 18.42 }],
  attachments: [],
  ...overrides,
});

const srpItem = (id: number, key: string, name: string, value: number, type: 'standard_srp' | 'emergency_ceiling' = 'standard_srp'): SrpItem => ({
  id, commodity_key: key, commodity_name: name, category: 'Goods', unit: 'unit', regulatory_classification: 'Basic Necessities', covered_by_price_freeze: type === 'emergency_ceiling',
  reference: { status: 'available', type, value, label: type === 'emergency_ceiling' ? 'Official APC / Price Freeze reference' : 'SRP baseline (provisional)', source: 'REF-1', effective_date: '2026-07-01' },
});

const signedIn = () => localStorage.setItem('price-watch-vendor-session', JSON.stringify({ token: 'vendor-token', expires_at: future(), user: overview.user }));

describe('PRICE-Watch Vendor Portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    api.overview.mockResolvedValue(overview);
    api.notices.mockResolvedValue([notice()]);
    api.logout.mockResolvedValue();
  });

  afterEach(async () => {
    cleanup();
    await waitForDeliveryIdle();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('signs in with real credentials and shows the establishment dashboard', async () => {
    api.login.mockResolvedValue({ token: 'vendor-token', expires_at: future(), user: overview.user });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Business email'), 'vendor@grocery.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.login).toHaveBeenCalledWith('vendor@grocery.com', 'correct-password');
    expect(await screen.findByRole('heading', { name: 'Antique Grocery Mart' })).toBeInTheDocument();
    expect(screen.getByText('Letter of Inquiry open')).toBeInTheDocument();
    expect(screen.getByText('Ref: PM-2026-LOI-000011')).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledWith('vendor-token');
    expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
    expect((await get<{ token: string }>('device', 'meta', 'session'))?.token).toBe('vendor-token');
  });

  it('shows sourced dashboard status without promising a fixed legal deadline or finding', async () => {
    signedIn();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Antique Grocery Mart' })).toBeInTheDocument();
    expect(screen.getByText('Confirmed cases')).toBeInTheDocument();
    expect(screen.queryByText(/48-Hour Response Window|Repeat Offenses|Clean Record|Automatic Price Freeze|Price Freeze in effect|DTI Registered/)).not.toBeInTheDocument();
    expect(screen.queryByText(/must maintain commodity prices within published DTI Suggested Retail Price/)).not.toBeInTheDocument();
  });

  it('titles the tablet content toolbar with the active tab', async () => {
    signedIn();
    api.conversation.mockResolvedValue({ store: overview.stores[0], messages: [], has_more: false, notices: [] });
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByRole('heading', { name: 'Antique Grocery Mart' });
    const title = () => container.querySelector('.vendor-content-toolbar strong')?.textContent;
    expect(title()).toBe('Dashboard');
    await user.click(screen.getByRole('button', { name: 'Messages Tab' }));
    expect(title()).toBe('Communications');
  });

  it('keeps submitted responses under the single Legal Notices menu entry', async () => {
    signedIn();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByRole('heading', { name: 'Antique Grocery Mart' });
    expect(screen.queryByRole('button', { name: /Rebuttal/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notices Tab' }));
    await user.click(screen.getByRole('button', { name: /Response History/ }));

    expect(screen.getByRole('heading', { name: 'Submitted Responses & Explanations' })).toBeInTheDocument();
    expect(container.querySelector('.sidebar-nav-item.active')).toHaveTextContent('Legal Notices');
    expect(container.querySelector('.vendor-content-toolbar strong')).toHaveTextContent('Legal Notices');
  });

  it('signs out locally even when server token revocation is still pending', async () => {
    signedIn();
    api.logout.mockImplementation(() => new Promise<void>(() => {}));
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: 'Open profile' }))[0]);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Business email')).toBeInTheDocument();
    expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
    expect(api.logout).toHaveBeenCalledWith('vendor-token');
  });

  it('shows the credential error without signing in', async () => {
    api.login.mockRejectedValue({ response: { status: 422, data: { message: 'The provided credentials are incorrect.' } } });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Business email'), 'vendor@grocery.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    expect(api.overview).not.toHaveBeenCalled();
  });

  it('returns to sign-in when the session is revoked', async () => {
    signedIn();
    api.overview.mockRejectedValue({ response: { status: 403, data: { status: 'VENDOR_ACCESS_REVOKED' } } });
    render(<App />);

    expect(await screen.findByText('Your session ended. Sign in again to continue.')).toBeInTheDocument();
    expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
  });

  it('shows flagged items and opens the official PDF', async () => {
    signedIn();
    api.document.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const popup = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:notice');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'View Notice' }));
    const dialog = screen.getByRole('dialog', { name: 'Letter of Inquiry' });
    expect(within(dialog).getByText('Regular Milled Rice')).toBeInTheDocument();
    expect(within(dialog).getByText('₱45.00')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Open official document (PDF)' }));
    await waitFor(() => expect(popup.location.href).toBe('blob:notice'));
    expect(api.document).toHaveBeenCalledWith('vendor-token', 11);
  });

  it('submits a response with reason id, categorized evidence, and certification', async () => {
    signedIn();
    api.respond.mockResolvedValue(notice({ status: 'response_received', response_received_at: new Date().toISOString(), response_reason_category: 'FREIGHT_SURCHARGE', response_text: 'Freight from Iloilo increased our landed cost this week.' }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('radio', { name: /Freight Surcharge/i }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Freight from Iloilo increased our landed cost this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));
    const file = new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Attach supporting documents'), file);
    await user.selectOptions(screen.getByLabelText('Document type for invoice.pdf'), 'FREIGHT_BILL');
    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit Official Response' }));

    await waitFor(() => expect(api.respond).toHaveBeenCalledWith('vendor-token', 11, {
      reason_category: 'FREIGHT_SURCHARGE',
      response_text: 'Freight from Iloilo increased our landed cost this week.',
      certified_under_oath: true,
      attachments: [{ file: expect.any(File), category: 'FREIGHT_BILL' }],
    }, expect.any(String)));
    expect(await screen.findByRole('heading', { name: 'Submitted Responses & Explanations' })).toBeInTheDocument();
  });

  it('allows a sworn written explanation without attachments and opens the file chooser from a keyboard-reachable button', async () => {
    signedIn();
    api.respond.mockResolvedValue(notice({ status: 'response_received', response_received_at: new Date().toISOString(), response_reason_category: 'ENCODING_ERROR' }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('radio', { name: /Shelf Tag Clerical Error/i }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'The shelf tag was misprinted; the POS price was correct.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));

    const chooser = screen.getByRole('button', { name: /Choose documents/ });
    const fileInput = screen.getByLabelText('Attach supporting documents') as HTMLInputElement;
    const click = vi.spyOn(fileInput, 'click');
    chooser.focus();
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));
    expect(screen.getByText('None attached')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /certify under oath/i }));
    await user.click(screen.getByRole('button', { name: 'Submit Official Response' }));

    await waitFor(() => expect(api.respond).toHaveBeenCalledWith('vendor-token', 11, {
      reason_category: 'ENCODING_ERROR',
      response_text: 'The shelf tag was misprinted; the POS price was correct.',
      certified_under_oath: true,
      attachments: [],
    }, expect.any(String)));
  });

  it('keeps the session and shows the reason when the deadline passed during submission', async () => {
    signedIn();
    api.respond.mockRejectedValue({ response: { status: 403, data: { status: 'RESPONSE_PERIOD_EXPIRED', message: 'The response period has expired.' } } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Our distributor raised wholesale prices this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));
    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['x'], 'receipt.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit Official Response' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The response period has expired.');
    expect((await get<{ token: string }>('device', 'meta', 'session'))?.token).toBe('vendor-token');
    expect(screen.queryByLabelText('Business email')).not.toBeInTheDocument();
  });

  it('keeps an in-progress draft visible and disables submission when the response period ends while drafting', async () => {
    signedIn();
    const start = Date.now();
    api.notices.mockResolvedValue([notice({ due_date_timestamp: new Date(start + 60_000).toISOString() })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Our distributor raised wholesale prices this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));
    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));

    vi.spyOn(Date, 'now').mockReturnValue(start + 120_000);
    await user.click(screen.getByRole('checkbox', { name: /certify under oath/i }));

    expect(screen.getByText(/response period for this notice has expired/i)).toBeInTheDocument();
    expect(screen.getByText('Our distributor raised wholesale prices this week.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Official Response' })).toBeDisabled();
    expect(api.respond).not.toHaveBeenCalled();
  });

  it('retains the editor after a failed save blocks cancellation and establishment changes', async () => {
    signedIn();
    api.overview.mockResolvedValue({ ...overview, stores: [overview.stores[0], { ...overview.stores[0], id: 2, store_name: 'Second Branch' }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    const original = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (this.name === 'drafts') throw new DOMException('No space', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Explanation retained in the editor.');
    await screen.findByRole('button', { name: 'Retry saving draft' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Detailed written explanation')).toHaveValue('Explanation retained in the editor.');
    await user.selectOptions(screen.getByLabelText('Active establishment'), '2');
    expect(screen.getByLabelText('Detailed written explanation')).toHaveValue('Explanation retained in the editor.');
    failure.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry saving draft' }));
    await screen.findByText('Draft · Saved on this device');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Detailed written explanation')).not.toBeInTheDocument());
  });

  it('reports denied persistent storage while keeping the workspace available', async () => {
    signedIn();
    const previous = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: vi.fn().mockResolvedValue(false) } });
    try {
      render(<App />);
      expect(await screen.findByText('Persistent storage was not granted. This browser may remove saved data.')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Antique Grocery Mart' })).toBeInTheDocument();
    } finally {
      if (previous) Object.defineProperty(navigator, 'storage', previous);
      else Reflect.deleteProperty(navigator, 'storage');
    }
  });

  it('offers no response before DTI records delivery', async () => {
    signedIn();
    api.notices.mockResolvedValue([notice({ delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null })]);
    render(<App />);

    expect(await screen.findByText('Deadline starts after delivery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit Formal Explanation/ })).not.toBeInTheDocument();
  });

  it('updates an open notice when delivery is recorded while the app was in the background', async () => {
    signedIn();
    api.notices.mockResolvedValue([notice({ delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'View Notice' }));
    expect(within(screen.getByRole('dialog', { name: 'Letter of Inquiry' })).queryByRole('button', { name: 'Start Response' })).not.toBeInTheDocument();

    api.notices.mockResolvedValue([notice()]);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await within(screen.getByRole('dialog', { name: 'Letter of Inquiry' })).findByRole('button', { name: 'Start Response' })).toBeInTheDocument();
  });

  it('applies the per-product reference rule in the SRP self-check', async () => {
    signedIn();
    const catalog: SrpCatalog = {
      protocol: { mode: 'emergency', reference: 'DECL-1' },
      items: [srpItem(1, 'rice', 'Rice', 100, 'emergency_ceiling'), srpItem(2, 'soy-sauce', 'Soy Sauce', 100)],
    };
    api.srp.mockResolvedValue(catalog);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'SRP Guide Tab' }));
    const price = await screen.findByLabelText('Your shelf price (₱)');
    await user.clear(price);
    await user.type(price, '105');
    expect(screen.getByText('For review')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Commodity'), 'soy-sauce');
    await user.clear(screen.getByLabelText('Your shelf price (₱)'));
    await user.type(screen.getByLabelText('Your shelf price (₱)'), '105');
    expect(screen.getByText('Within reference')).toBeInTheDocument();
    expect(screen.queryByText(/ILLEGAL|COMPLIANT/)).not.toBeInTheDocument();
  });

  it('accepts centavo prices and withholds a result for negative or sub-centavo inputs', async () => {
    signedIn();
    api.srp.mockResolvedValue({ protocol: { mode: 'standard', reference: null }, items: [srpItem(1, 'rice', 'Rice', 10.05)] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'SRP Guide Tab' }));
    const price = await screen.findByLabelText('Your shelf price (₱)');
    expect(price).toHaveAttribute('step', '0.01');
    await user.clear(price);
    await user.type(price, '11.06');
    expect(screen.getByText('For review')).toBeInTheDocument();
    expect(screen.getAllByText('₱11.06').length).toBeGreaterThan(0);

    await user.clear(price);
    await user.type(price, '-1');
    expect(screen.queryByText('Within reference')).not.toBeInTheDocument();
    expect(screen.queryByText('For review')).not.toBeInTheDocument();

    await user.clear(price);
    await user.type(price, '11.061');
    expect(screen.queryByText('Within reference')).not.toBeInTheDocument();
    expect(screen.queryByText('For review')).not.toBeInTheDocument();
  });

  it('keeps the chosen commodity in the self-check when its SRP is revised during a refresh', async () => {
    signedIn();
    api.srp.mockResolvedValue({ protocol: { mode: 'standard', reference: null }, items: [srpItem(1, 'rice', 'Rice', 100), srpItem(2, 'soy-sauce', 'Soy Sauce', 100)] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'SRP Guide Tab' }));
    await user.selectOptions(await screen.findByLabelText('Commodity'), 'soy-sauce');
    await user.clear(screen.getByLabelText('Your shelf price (₱)'));
    await user.type(screen.getByLabelText('Your shelf price (₱)'), '105');
    expect(screen.getByText('Within reference')).toBeInTheDocument();

    // The revision is a new bulletin id for the same commodity.
    api.srp.mockResolvedValue({ protocol: { mode: 'standard', reference: null }, items: [srpItem(1, 'rice', 'Rice', 100), srpItem(3, 'soy-sauce', 'Soy Sauce', 90)] });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText('For review')).toBeInTheDocument();
    expect(screen.getByLabelText('Commodity')).toHaveValue('soy-sauce');
    expect(screen.getByLabelText('Your shelf price (₱)')).toHaveValue(105);
  });

  it('accepts an invitation and returns to sign-in', async () => {
    window.history.replaceState({}, '', '/vendor-invitation?token=raw-token');
    api.acceptInvitation.mockResolvedValue({ message: 'Invitation accepted.', existing_account: false, user: { id: 9, email: 'new@shop.test' } });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText('Full name'), 'New Owner');
    await user.type(screen.getByLabelText('Password'), 'a-secure-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-secure-password');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(api.acceptInvitation).toHaveBeenCalledWith('raw-token', { name: 'New Owner', password: 'a-secure-password', password_confirmation: 'a-secure-password' });
    await user.click(await screen.findByRole('button', { name: 'Go to sign in' }));
    expect(screen.getByLabelText('Business email')).toBeInTheDocument();
    expect(screen.getByText('Account created. Sign in with the password you just set.')).toBeInTheDocument();
  });

  it('refreshes notices when the installed app returns to the foreground', async () => {
    signedIn();
    render(<App />);
    await screen.findByRole('heading', { name: 'Antique Grocery Mart' });
    const calls = api.notices.mock.calls.length;

    api.notices.mockResolvedValue([notice({ control_number: 'PM-2026-SCO-000012', notice_type: 'SCO' })]);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(api.notices.mock.calls.length).toBeGreaterThan(calls));
    expect(await screen.findByText('Ref: PM-2026-SCO-000012')).toBeInTheDocument();
  });

  it('ignores an older notices refresh that finishes after a response was submitted', async () => {
    signedIn();
    const text = 'The shelf tag was misprinted; the POS price was correct.';
    const responded = notice({ status: 'response_received', response_received_at: new Date().toISOString(), response_reason_category: 'ENCODING_ERROR', response_text: text });
    api.respond.mockResolvedValue(responded);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Antique Grocery Mart' });

    let resolveStale: (value: LegalNotice[]) => void = () => {};
    api.notices.mockImplementationOnce(() => new Promise<LegalNotice[]>((resolve) => { resolveStale = resolve; }));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(api.notices).toHaveBeenCalledTimes(2));
    api.notices.mockResolvedValue([responded]);

    await user.click(screen.getByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), text);
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));
    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));
    await user.click(screen.getByRole('checkbox', { name: /certify under oath/i }));
    await user.click(screen.getByRole('button', { name: 'Submit Official Response' }));
    expect(await screen.findByRole('heading', { name: 'Submitted Responses & Explanations' })).toBeInTheDocument();
    expect(await screen.findByText(text)).toBeInTheDocument();

    // The read that started before submitting now resolves with the old, unanswered notice.
    resolveStale([notice()]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(screen.getByText(text)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('No responses submitted yet.')).not.toBeInTheDocument());
  });

  it('keeps the default commodity after its price is edited, even if a refresh removes its reference', async () => {
    signedIn();
    api.srp.mockResolvedValue({ protocol: { mode: 'standard', reference: null }, items: [srpItem(1, 'rice', 'Rice', 100), srpItem(2, 'soy-sauce', 'Soy Sauce', 100)] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'SRP Guide Tab' }));
    const price = await screen.findByLabelText('Your shelf price (₱)');
    await user.clear(price);
    await user.type(price, '105');
    expect(screen.getByText('Within reference')).toBeInTheDocument();

    const riceWithoutReference: SrpItem = { ...srpItem(1, 'rice', 'Rice', 100), reference: { status: 'unavailable', type: 'standard_srp', value: null, label: 'SRP reference unavailable', source: null, effective_date: null } };
    api.srp.mockResolvedValue({ protocol: { mode: 'standard', reference: null }, items: [riceWithoutReference, srpItem(2, 'soy-sauce', 'Soy Sauce', 100)] });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText(/selected commodity no longer has an available price reference/i)).toBeInTheDocument();
    expect(screen.queryByText('Within reference')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Commodity')).not.toHaveValue('soy-sauce');
  });

  it('accepts a PDF whose browser reported no MIME type and still rejects other files', async () => {
    signedIn();
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Our distributor raised wholesale prices this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));

    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['%PDF'], 'scan.pdf', { type: '' }));
    expect(await screen.findByLabelText('Document type for scan.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['x'], 'notes.txt', { type: '' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt is not accepted');
  });

  it('shows a portal notice as received right after the official PDF is opened', async () => {
    signedIn();
    api.notices.mockResolvedValueOnce([notice({ intended_delivery_method: 'portal', delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null })])
      .mockResolvedValue([notice({ intended_delivery_method: 'portal', delivery_state: 'received', due_date_timestamp: '2026-10-01T01:00:00Z' })]);
    api.document.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: vi.fn() } as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:notice');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'View Notice' }));
    const dialog = screen.getByRole('dialog', { name: 'Letter of Inquiry' });
    expect(within(dialog).getByText(/Opening the official document records that you received this notice/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Open official document (PDF)' }));
    // The open modal reads the refreshed record: receipt recorded, deadline shown, warning gone.
    await waitFor(() => expect(within(dialog).queryByText(/Opening the official document records/)).not.toBeInTheDocument());
    expect(within(dialog).queryByText('Starts when you open the official document')).not.toBeInTheDocument();
  });

  it('exchanges messages with DTI and opens a notice from the thread', async () => {
    signedIn();
    api.overview.mockResolvedValue({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 1 }] });
    api.conversation.mockResolvedValue({
      store: { id: 1, store_name: 'Antique Grocery Mart', address: 'San Jose, Antique' },
      messages: [{ id: 3, sender_side: 'dti', sender_name: 'DTI', body: 'Please send your supplier invoice.', read_at: null, created_at: '2026-09-28T01:00:00Z', attachment: null }],
      has_more: false,
      notices: [{ id: 11, notice_type: 'LOI', control_number: 'PM-2026-LOI-000011', status: 'issued', delivery_state: 'received', issued_at: '2026-09-11T02:00:00Z', due_date_timestamp: future(), response_received_at: null, closed_at: null }],
    });
    api.sendMessage.mockResolvedValue({ id: 4, sender_side: 'vendor', sender_name: 'Maria Clara', body: 'Attached today.', read_at: null, created_at: '2026-09-28T02:00:00Z', attachment: null });
    const user = userEvent.setup();
    render(<App />);

    const tab = await screen.findByRole('button', { name: 'Messages Tab' });
    expect(within(tab).getByText('1')).toBeInTheDocument();
    await user.click(tab);
    expect(await screen.findByText('Please send your supplier invoice.')).toBeInTheDocument();
    expect(api.conversation).toHaveBeenCalledWith('vendor-token', 1);

    await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled());
    await user.type(screen.getByLabelText('Message'), 'Attached today.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('vendor-token', 1, { body: 'Attached today.' }, expect.any(String)));
    expect(await screen.findByText('Attached today.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Letter of Inquiry PM-2026-LOI-000011/ }));
    expect(screen.getByRole('dialog', { name: 'Letter of Inquiry' })).toBeInTheDocument();
  });

  it('opens a notice card for a notice issued after the portal last loaded its notices', async () => {
    signedIn();
    api.notices.mockResolvedValueOnce([]).mockResolvedValue([notice({ id: 12, control_number: 'LOI-2026-000012' })]);
    api.conversation.mockResolvedValue({
      store: { id: 1, store_name: 'Antique Grocery Mart', address: 'San Jose, Antique' }, messages: [], has_more: false,
      notices: [{ id: 12, notice_type: 'LOI', control_number: 'LOI-2026-000012', status: 'issued', delivery_state: 'received', issued_at: '2026-09-28T02:00:00Z', due_date_timestamp: future(), response_received_at: null, closed_at: null }],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Messages Tab' }));
    await user.click(await screen.findByRole('button', { name: /Letter of Inquiry LOI-2026-000012/ }));
    expect(await screen.findByRole('dialog', { name: 'Letter of Inquiry' })).toBeInTheDocument();
  });

  it('badges Messages for unread DTI messages on any linked store and labels withdrawn notices', async () => {
    signedIn();
    const second = { ...overview.stores[0], id: 2, store_name: 'Second Branch', unread_messages: 2 };
    api.overview.mockResolvedValue({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 0 }, second] });
    api.notices.mockResolvedValue([notice({ status: 'cancelled' })]);
    const user = userEvent.setup();
    render(<App />);

    const tab = await screen.findByRole('button', { name: 'Messages Tab' });
    expect(within(tab).getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notices Tab' }));
    expect(await screen.findByText('Withdrawn by DTI')).toBeInTheDocument();
  });

  describe('shell: account block, alerts and profile', () => {
    const secondStore = { ...overview.stores[0], id: 2, store_name: 'Second Branch', open_notice_count: 0 };
    const emptyThread = (store = overview.stores[0]) => ({ store: { id: store.id, store_name: store.store_name, address: store.address }, messages: [], has_more: false, notices: [] });
    const dtiMessage = (id: number) => ({ id, sender_side: 'dti' as const, sender_name: 'DTI', body: `Message ${id}`, read_at: null, created_at: '2026-09-28T01:00:00Z', attachment: null });
    const bell = async (name: string | RegExp = /^Alerts/) => (await screen.findAllByRole('button', { name }))[0];

    it('ends the sidebar with the account block instead of status, alerts and log out', async () => {
      signedIn();
      const { container } = render(<App />);

      await screen.findByRole('heading', { name: 'Antique Grocery Mart' });
      const sidebar = within(container.querySelector('.vendor-sidebar') as HTMLElement);
      expect(sidebar.queryByText(/System Online|Offline Mode/)).not.toBeInTheDocument();
      expect(sidebar.queryByRole('button', { name: /Alerts|Notification settings|Sign out|Log out/i })).not.toBeInTheDocument();
      expect(sidebar.getByRole('button', { name: 'Open profile' })).toHaveTextContent('Maria Clara');
      // The bell lives in both sticky headers: the content toolbar (tablet, desktop) and the phone header.
      expect(within(container.querySelector('.vendor-content-toolbar') as HTMLElement).getByRole('button', { name: 'Alerts, 1 new' })).toBeInTheDocument();
      expect(within(container.querySelector('.vendor-header') as HTMLElement).getByRole('button', { name: 'Alerts, 1 new' })).toBeInTheDocument();
    });

    it('counts unopened portal notices, due responses and unread messages, and opens a notice from the drawer', async () => {
      signedIn();
      api.overview.mockResolvedValue({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 2 }] });
      api.notices.mockResolvedValue([
        notice(),
        notice({ id: 12, control_number: 'PM-2026-LOI-000012', intended_delivery_method: 'portal', delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null }),
        notice({ id: 13, control_number: 'PM-2026-LOI-000013', status: 'response_received' }),
      ]);
      const user = userEvent.setup();
      const { container } = render(<App />);

      const opener = await bell('Alerts, 4 new');
      await user.click(opener);
      const drawer = within(screen.getByRole('dialog', { name: 'Alerts' }));
      expect(drawer.getByRole('button', { name: /PM-2026-LOI-000011.*Response due/ })).toBeInTheDocument();
      expect(drawer.getByRole('button', { name: /PM-2026-LOI-000012.*Not yet opened.*Open the official document/ })).toBeInTheDocument();
      expect(drawer.queryByRole('button', { name: /PM-2026-LOI-000013/ })).not.toBeInTheDocument();
      expect(drawer.getByRole('button', { name: /2 new messages from DTI/ })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Alerts' })).not.toBeInTheDocument();
      expect(opener).toHaveFocus();

      await user.click(opener);
      await user.click(within(screen.getByRole('dialog', { name: 'Alerts' })).getByRole('button', { name: /PM-2026-LOI-000012/ }));
      expect(screen.queryByRole('dialog', { name: 'Alerts' })).not.toBeInTheDocument();
      const detail = screen.getByRole('dialog', { name: 'Letter of Inquiry' });
      expect(detail).toContainElement(document.activeElement as HTMLElement);

      // Tab stays in the notice dialog, and closing it lands on the page content rather than nowhere.
      await user.tab({ shift: true });
      expect(detail).toContainElement(document.activeElement as HTMLElement);
      await user.click(within(detail).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog', { name: 'Letter of Inquiry' })).not.toBeInTheDocument();
      expect(container.querySelector('main')).toHaveFocus();
    });

    it('keeps Tab inside the alerts drawer', async () => {
      signedIn();
      const user = userEvent.setup();
      render(<App />);

      await user.click(await bell());
      const drawer = within(screen.getByRole('dialog', { name: 'Alerts' }));
      const close = drawer.getByRole('button', { name: 'Close alerts' });
      const row = drawer.getByRole('button', { name: /PM-2026-LOI-000011/ });
      expect(close).toHaveFocus();
      await user.tab();
      expect(row).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.tab({ shift: true });
      expect(row).toHaveFocus();
    });

    it('shows the account in Profile and changes the password there', async () => {
      signedIn();
      api.changePassword
        .mockRejectedValueOnce({ response: { status: 422, data: { errors: { current_password: ['The current password is incorrect.'] } } } })
        .mockResolvedValueOnce();
      const user = userEvent.setup();
      render(<App />);

      await user.click((await screen.findAllByRole('button', { name: 'Open profile' }))[0]);
      expect(screen.getByRole('region', { name: 'Account' })).toHaveTextContent('Maria Clara');
      expect(screen.getByRole('region', { name: 'Account' })).toHaveTextContent('vendor@grocery.com');
      expect(screen.getByRole('region', { name: 'Establishment' })).toHaveTextContent('Antique Grocery Mart');

      await user.type(screen.getByLabelText('Current password'), 'wrong-password');
      await user.type(screen.getByLabelText('New password'), 'short');
      await user.type(screen.getByLabelText('Confirm new password'), 'short');
      await user.click(screen.getByRole('button', { name: 'Change password' }));
      expect(screen.getByRole('alert')).toHaveTextContent('at least 12 characters');
      expect(api.changePassword).not.toHaveBeenCalled();

      await user.clear(screen.getByLabelText('New password'));
      await user.type(screen.getByLabelText('New password'), 'a-new-long-password');
      await user.clear(screen.getByLabelText('Confirm new password'));
      await user.type(screen.getByLabelText('Confirm new password'), 'a-new-long-password');
      await user.click(screen.getByRole('button', { name: 'Change password' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect.');
      expect(api.changePassword).toHaveBeenCalledWith('vendor-token', 'wrong-password', 'a-new-long-password');

      await user.click(screen.getByRole('button', { name: 'Change password' }));
      expect(await screen.findByText('Password changed.')).toBeInTheDocument();
      expect(screen.getByLabelText('Current password')).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('opens Notification Settings from Profile', async () => {
      signedIn();
      api.preferences.mockResolvedValue({ sms_enabled: false, sms_mobile_number: '', email_enabled: false, email_address: '', alert_on_loi: true, alert_on_sco: true, alert_deadline_24h: true, alert_price_freeze: true, alert_srp_bulletin: true });
      const user = userEvent.setup();
      render(<App />);

      await user.click((await screen.findAllByRole('button', { name: 'Open profile' }))[0]);
      await user.click(screen.getByRole('button', { name: 'Manage notification settings' }));
      expect(screen.getByRole('dialog', { name: 'Notification Settings' })).toBeInTheDocument();
    });

    it('lets an account with no linked establishment open Profile and sign out', async () => {
      signedIn();
      api.overview.mockResolvedValue({ ...overview, stores: [] });
      api.notices.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<App />);

      expect(await screen.findByText('No establishment is linked to this account.')).toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: 'Open profile' })[0]);
      expect(screen.getByRole('region', { name: 'Establishment' })).toHaveTextContent('No establishment is linked to this account.');
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByLabelText('Business email')).toBeInTheDocument();
      expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
    });

    it('keeps refreshing every linked store while Communications is open', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      signedIn();
      api.overview.mockResolvedValue({ ...overview, stores: [overview.stores[0], secondStore] });
      api.conversation.mockResolvedValue(emptyThread());
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Messages Tab' }));
      // Initial load, then the refresh the thread asks for once it has been read.
      await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2));
      await bell('Alerts, 1 new');

      api.overview.mockResolvedValue({ ...overview, stores: [overview.stores[0], { ...secondStore, unread_messages: 3 }] });
      await act(async () => { vi.advanceTimersByTime(60_000); });
      expect(api.overview).toHaveBeenCalledTimes(3);
      expect(await bell('Alerts, 4 new')).toBeInTheDocument();
    });

    it('opens another establishment\'s notice from Communications without reading that establishment\'s messages', async () => {
      signedIn();
      api.overview.mockResolvedValue({ ...overview, stores: [overview.stores[0], { ...secondStore, unread_messages: 2 }] });
      api.notices.mockResolvedValue([notice({ id: 21, store_id: 2, control_number: 'PM-2026-LOI-000021', store: { id: 2, store_name: 'Second Branch', address: 'San Jose, Antique' } })]);
      api.conversation.mockResolvedValue(emptyThread());
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Messages Tab' }));
      await waitFor(() => expect(api.conversation).toHaveBeenCalledWith('vendor-token', 1));
      await user.click(await bell('Alerts, 3 new'));
      await user.click(within(screen.getByRole('dialog', { name: 'Alerts' })).getByRole('button', { name: /PM-2026-LOI-000021/ }));

      expect(screen.getByRole('dialog', { name: 'Letter of Inquiry' })).toBeInTheDocument();
      expect(container.querySelector('.vendor-content-toolbar strong')).toHaveTextContent('Legal Notices');
      expect(api.conversation.mock.calls.every(([, storeId, , markRead]) => storeId === 1 || markRead === false)).toBe(true);
      expect(await bell('Alerts, 3 new')).toBeInTheDocument();
    });

    it('drops an expired notice from the bell at its deadline while offline', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      signedIn();
      api.notices.mockResolvedValue([notice({ due_date_timestamp: new Date(Date.now() + 60_000).toISOString() })]);
      render(<App />);

      await bell('Alerts, 1 new');
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      act(() => { window.dispatchEvent(new Event('offline')); });
      const requests = api.overview.mock.calls.length + api.notices.mock.calls.length;

      await act(async () => { vi.advanceTimersByTime(61_000); });
      expect(screen.queryByRole('button', { name: /^Alerts, / })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Alerts' }).length).toBeGreaterThan(0);
      expect(api.overview.mock.calls.length + api.notices.mock.calls.length).toBe(requests);
    });

    it('keeps focus inside the open drawer when the focused notice expires', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      signedIn();
      api.notices.mockResolvedValue([notice({ due_date_timestamp: new Date(Date.now() + 60_000).toISOString() })]);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<App />);

      await user.click(await bell('Alerts, 1 new'));
      const drawer = screen.getByRole('dialog', { name: 'Alerts' });
      await user.tab();
      expect(within(drawer).getByRole('button', { name: /PM-2026-LOI-000011/ })).toHaveFocus();

      await act(async () => { vi.advanceTimersByTime(61_000); });
      expect(within(drawer).queryByRole('button', { name: /PM-2026-LOI-000011/ })).not.toBeInTheDocument();
      expect(within(drawer).getByText('Nothing needs your attention')).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: 'Close alerts' })).toHaveFocus();
    });

    it('starts an empty composer when an alert switches the open thread to another establishment', async () => {
      signedIn();
      api.overview.mockResolvedValue({ ...overview, stores: [overview.stores[0], { ...secondStore, unread_messages: 1 }] });
      api.notices.mockResolvedValue([]);
      api.conversation.mockImplementation(async (_token, storeId) => emptyThread(storeId === 2 ? secondStore : overview.stores[0]));
      api.sendMessage.mockResolvedValue({ id: 9, sender_side: 'vendor', sender_name: 'Maria Clara', body: 'For the second branch.', read_at: null, created_at: '2026-09-28T02:00:00Z', attachment: null });
      const user = userEvent.setup();
      const { container } = render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Messages Tab' }));
      await screen.findByText('No messages yet. DTI Antique will reply here.');
      await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled());
      await user.type(screen.getByLabelText('Message'), 'Invoice for the main store.');
      await user.upload(container.querySelector('.vendor-attach input') as HTMLInputElement, new File(['%PDF'], 'main-store-invoice.pdf', { type: 'application/pdf' }));
      expect(screen.getByText('main-store-invoice.pdf')).toBeInTheDocument();

      await user.click(await bell('Alerts, 1 new'));
      await user.click(within(screen.getByRole('dialog', { name: 'Alerts' })).getByRole('button', { name: /1 new message from DTI/ }));
      await waitFor(() => expect(api.conversation).toHaveBeenCalledWith('vendor-token', 2));
      expect(container.querySelector('main')).toHaveFocus();
      expect(screen.getByLabelText('Message')).toHaveValue('');
      expect(screen.queryByText('main-store-invoice.pdf')).not.toBeInTheDocument();

      await screen.findByText('No messages yet. DTI Antique will reply here.');
      await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled());
      await user.type(screen.getByLabelText('Message'), 'For the second branch.');
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('vendor-token', 2, { body: 'For the second branch.' }, expect.any(String)));
    });

    it('refreshes the bell after loading earlier messages marks them read', async () => {
      signedIn();
      api.overview
        .mockResolvedValueOnce({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 101 }] })
        .mockResolvedValueOnce({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 1 }] })
        .mockResolvedValue({ ...overview, stores: [{ ...overview.stores[0], unread_messages: 0 }] });
      api.notices.mockResolvedValue([]);
      api.conversation
        .mockImplementation(async (_token, _store, beforeId) => beforeId
          ? { ...emptyThread(), messages: [dtiMessage(1)], has_more: false }
          : { ...emptyThread(), messages: [dtiMessage(2)], has_more: true });
      const user = userEvent.setup();
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Messages Tab' }));
      await bell('Alerts, 1 new');
      await user.click(await screen.findByRole('button', { name: 'Load earlier messages' }));

      expect(await screen.findByText('Message 1')).toBeInTheDocument();
      expect(api.conversation).toHaveBeenCalledWith('vendor-token', 1, 2);
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Alerts, / })).not.toBeInTheDocument());
    });
  });
});
