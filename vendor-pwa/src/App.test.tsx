// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { LegalNotice, SrpCatalog, SrpItem, VendorOverview } from './app/types';
import { vendorApi } from './services/vendorApi';

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

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('signs in with real credentials and shows the establishment dashboard', async () => {
    api.login.mockResolvedValue({ token: 'vendor-token', expires_at: future(), user: overview.user });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Business email'), 'vendor@grocery.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.login).toHaveBeenCalledWith('vendor@grocery.com', 'correct-password');
    expect(await screen.findByRole('heading', { name: 'Antique Grocery Mart' })).toBeInTheDocument();
    expect(screen.getByText('Letter of Inquiry open')).toBeInTheDocument();
    expect(screen.getByText('Ref: PM-2026-LOI-000011')).toBeInTheDocument();
    expect(api.overview).toHaveBeenCalledWith('vendor-token');
    expect(JSON.parse(localStorage.getItem('price-watch-vendor-session') ?? '{}').token).toBe('vendor-token');
  });

  it('shows sourced dashboard status without promising a fixed legal deadline or finding', async () => {
    signedIn();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Antique Grocery Mart' })).toBeInTheDocument();
    expect(screen.getByText('Confirmed cases')).toBeInTheDocument();
    expect(screen.queryByText(/48-Hour Response Window|Repeat Offenses|Clean Record|Automatic Price Freeze|Price Freeze in effect|DTI Registered/)).not.toBeInTheDocument();
    expect(screen.queryByText(/must maintain commodity prices within published DTI Suggested Retail Price/)).not.toBeInTheDocument();
  });

  it('signs out locally even when server token revocation is still pending', async () => {
    signedIn();
    api.logout.mockImplementation(() => new Promise<void>(() => {}));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(screen.getByLabelText('Business email')).toBeInTheDocument();
    expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
    expect(api.logout).toHaveBeenCalledWith('vendor-token');
  });

  it('shows the credential error without signing in', async () => {
    api.login.mockRejectedValue({ response: { status: 422, data: { message: 'The provided credentials are incorrect.' } } });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Business email'), 'vendor@grocery.com');
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
    await user.click(screen.getByRole('radio', { name: /Freight Surcharge/i }));
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
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
      attachments: [{ file, category: 'FREIGHT_BILL' }],
    }));
    expect(await screen.findByRole('heading', { name: 'Submitted Responses & Explanations' })).toBeInTheDocument();
  });

  it('allows a sworn written explanation without attachments and opens the file chooser from a keyboard-reachable button', async () => {
    signedIn();
    api.respond.mockResolvedValue(notice({ status: 'response_received', response_received_at: new Date().toISOString(), response_reason_category: 'ENCODING_ERROR' }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(screen.getByRole('radio', { name: /Shelf Tag Clerical Error/i }));
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
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
    }));
  });

  it('keeps the session and shows the reason when the deadline passed during submission', async () => {
    signedIn();
    api.respond.mockRejectedValue({ response: { status: 403, data: { status: 'RESPONSE_PERIOD_EXPIRED', message: 'The response period has expired.' } } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Our distributor raised wholesale prices this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));
    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['x'], 'receipt.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: /Next: Certify/ }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit Official Response' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The response period has expired.');
    expect(localStorage.getItem('price-watch-vendor-session')).not.toBeNull();
    expect(screen.queryByLabelText('Business email')).not.toBeInTheDocument();
  });

  it('keeps an in-progress draft visible and disables submission when the response period ends while drafting', async () => {
    signedIn();
    const start = Date.now();
    api.notices.mockResolvedValue([notice({ due_date_timestamp: new Date(start + 60_000).toISOString() })]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Submit Formal Explanation/ }));
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
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

    await user.type(screen.getByLabelText('Full name'), 'New Owner');
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
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
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
    expect(screen.queryByText('No responses submitted yet.')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /Next: Written Explanation/ }));
    await user.type(screen.getByLabelText('Detailed written explanation'), 'Our distributor raised wholesale prices this week.');
    await user.click(screen.getByRole('button', { name: /Next: Attach Evidence/ }));

    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['%PDF'], 'scan.pdf', { type: '' }));
    expect(await screen.findByLabelText('Document type for scan.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText('Attach supporting documents'), new File(['x'], 'notes.txt', { type: '' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt is not accepted');
  });
});
