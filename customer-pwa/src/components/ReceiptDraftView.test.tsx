import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ReceiptDraftView } from './ReceiptDraftView';

const { getResumeTokenMock, deleteResumeTokenMock, getTrackingTokenMock } = vi.hoisted(() => ({
  getResumeTokenMock: vi.fn(),
  deleteResumeTokenMock: vi.fn(),
  getTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/receiptResumeStore', () => ({
  getReceiptResumeToken: getResumeTokenMock,
  deleteReceiptResumeToken: deleteResumeTokenMock,
}));
vi.mock('../app/reportTrackingStore', () => ({ getReportTrackingToken: getTrackingTokenMock }));

describe('ReceiptDraftView', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    getResumeTokenMock.mockReset().mockResolvedValue('rsm_device');
    deleteResumeTokenMock.mockReset().mockResolvedValue(undefined);
    getTrackingTokenMock.mockReset().mockResolvedValue('trk_saved');
    history.replaceState(null, '', '/reports/REP-20260816-READY/review');
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    if (!URL.revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original-receipt');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // jsdom does not implement the native dialog top layer.
    if (!HTMLDialogElement.prototype.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
    if (!HTMLDialogElement.prototype.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  });

  const needsRecaptureProcessing = (reference: string, evidence: unknown[] = []) => ({
    data: { success: true, data: {
      report_reference: reference, status: 'Needs recapture', processing_status: 'needs_recapture',
      message: 'Some sections could not be read.', ready_for_review: false, can_recapture: true,
      attempt_number: 1, store: { id: 77, store_name: 'Receipt Test Mart' },
      recapture_reason: { code: 'TEXT_UNREADABLE', message: 'Some sections could not be read.' },
      evidence,
    } },
  });

  it('offers an icon back control on the needs-recapture screen that returns to My Reports', async () => {
    history.replaceState(null, '', '/reports/REP-BACK/processing');
    const onBack = vi.fn();
    vi.spyOn(apiClient, 'get').mockResolvedValue(needsRecaptureProcessing('REP-BACK'));
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-BACK" mode="processing" onBack={onBack} />);

    // Wait for the processing branch before querying: the loading branch also renders the control,
    // and the node is replaced when the branch changes.
    expect(await screen.findByText('Needs recapture')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to My Reports' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the back control when no handler is supplied', async () => {
    history.replaceState(null, '', '/reports/REP-NOBACK/processing');
    vi.spyOn(apiClient, 'get').mockResolvedValue(needsRecaptureProcessing('REP-NOBACK'));
    render(<ReceiptDraftView reference="REP-NOBACK" mode="processing" />);

    expect(await screen.findByText('Needs recapture')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to My Reports' })).not.toBeInTheDocument();
  });

  it('hides the back control while the recapture camera owns the screen', async () => {
    history.replaceState(null, '', '/reports/REP-CAM/processing');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['receipt'], { type: 'image/jpeg' }) };
      return needsRecaptureProcessing('REP-CAM', [{ id: 8, sequence: 0, mime_type: 'image/jpeg', size_bytes: 7 }]);
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {
      capture_session_id: 43, session_uuid: 'capture-43', capture_token: 'ct_sec_recapture',
      expires_at: '2026-08-16T02:00:00Z', store_id: 77, capture_mode: 'guided_photos_v1',
      max_file_size: 2 * 1024 * 1024, accepted_types: ['image/jpeg'],
      capture_action: 'replace', upload_sequence: 0,
      limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
    } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-CAM" mode="processing" onBack={vi.fn()} />);

    expect(await screen.findByText('Needs recapture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to My Reports' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Retake section 1/i }));

    await waitFor(() => expect(screen.getByLabelText('Guided receipt scanner')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Back to My Reports' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel receipt capture' })).toBeInTheDocument();
  });

  it('reaches My Reports in one back step after moving from processing to review', async () => {
    // Mirror how App enters this screen from the list: a pushed entry carrying provenance.
    history.replaceState(null, '', '/reports/track');
    history.pushState({ fromReportList: true }, '', '/reports/REP-FLOW/processing');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {
      report_reference: 'REP-FLOW', status: 'Processing receipt', processing_status: 'processing',
      message: 'Ready for your confirmation.', ready_for_review: true, can_recapture: false,
      attempt_number: 1, store: null, recapture_reason: null, evidence: [],
    } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-FLOW" mode="processing" onBack={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Review detected items' }));
    expect(location.pathname).toBe('/reports/REP-FLOW/review');

    // The review entry must have replaced processing. If it were pushed, App's returnToReportList
    // would call history.back() and land on processing, so a control labelled "Back to My Reports"
    // would return to the previous receipt screen instead of the list.
    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe('/reports/track'));
  });

  it('does not leave processing behind review for a fresh capture with no list provenance', async () => {
    // FormalReport.tsx:1105 opens processing with no state, so this path carries no provenance.
    history.replaceState(null, '', '/report');
    history.pushState(null, '', '/reports/REP-NEW/processing');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {
      report_reference: 'REP-NEW', status: 'Processing receipt', processing_status: 'processing',
      message: 'Ready for your confirmation.', ready_for_review: true, can_recapture: false,
      attempt_number: 1, store: null, recapture_reason: null, evidence: [],
    } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-NEW" mode="processing" onBack={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Review detected items' }));
    expect(location.pathname).toBe('/reports/REP-NEW/review');

    // Review replaced processing, so back leaves the receipt entirely instead of reopening it.
    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe('/report'));
  });

  it('explains that refresh only checks status and retry reruns OCR on the same evidence', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {
      report_reference: 'REP-20260816-READY', status: 'Processing failed', processing_status: 'failed',
      message: 'Receipt processing could not be completed.', ready_for_review: false, can_recapture: false,
      attempt_number: 1, store: null, recapture_reason: null, evidence: [],
    } } });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="processing" />);
    expect(await screen.findByText(/Refresh status only checks progress/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(getSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(postSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry processing' }));
    expect(postSpy).toHaveBeenCalledWith('/public/reports/REP-20260816-READY/retry-processing', {}, {
      headers: { 'X-Report-Resume-Token': 'rsm_device' },
    });
  });

  it('shows current server failure guidance instead of stale history for a retryable outage', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {
      report_reference: 'REP-OUTAGE', status: 'Processing failed', processing_status: 'failed',
      message: 'Receipt processing retry queued using the original evidence.',
      failure_reason: { code: 'GEMINI_UNAVAILABLE', message: 'Receipt processing is temporarily busy. Your photos are saved; try again later.' },
      can_retry_processing: true, can_recapture: false, ready_for_review: false,
      attempt_number: 1, store: null, recapture_reason: null, evidence: [],
    } } });
    render(<ReceiptDraftView reference="REP-OUTAGE" mode="processing" />);
    expect(await screen.findByText('Receipt processing is temporarily busy. Your photos are saved; try again later.')).toBeInTheDocument();
    expect(screen.queryByText('Receipt processing retry queued using the original evidence.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry processing' })).toBeEnabled();
  });

  it('offers a fresh capture instead of a retry when stored photos failed their integrity check', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {
      report_reference: 'REP-20260816-READY', status: 'Processing failed', processing_status: 'failed',
      message: 'The stored receipt photos failed an integrity check and cannot be processed again. Capture the receipt again.',
      ready_for_review: false, can_recapture: true, can_retry_processing: false,
      failure_reason: { code: 'EVIDENCE_INTEGRITY_FAILED', message: 'The stored receipt photos failed an integrity check, so they cannot be processed again. Capture the receipt again from the start.' },
      attempt_number: 1, store: null, recapture_reason: null, evidence: [{ id: 7, sequence: 0, mime_type: 'image/jpeg', size_bytes: 10 }],
    } } });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="processing" />);

    expect(await screen.findByText(/failed an integrity check, so they cannot be processed again/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry processing' })).not.toBeInTheDocument();
    expect(getSpy.mock.calls.some(([url]) => String(url).includes('/evidence-assets/'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Restart receipt' }));
    expect(postSpy).toHaveBeenCalledWith('/public/reports/REP-20260816-READY/recapture-session', { restart: true }, {
      headers: { 'X-Report-Resume-Token': 'rsm_device' },
    });
  });

  it('shows OCR items read-only and submits only customer confirmation', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['receipt'], { type: 'image/jpeg' }) };
      return { data: {
        success: true,
        data: {
          report_reference: 'REP-20260816-READY',
          status: 'Ready for confirmation',
          store: { id: 77, store_name: 'Receipt Test Mart', address: 'San Jose' },
          lines: ['RICE 45.00'],
          items: [{ sequence: 0, raw_text: 'RICE 45.00', item_name: 'RICE', quantity: null, unit: null, observed_price: 45, ocr_confidence: 0.91 }],
          continuity: { status: 'ready', continuity_score: 1, reasons: [] },
          merchant: { status: 'matched' },
          warnings: [],
          manual_review_required: false,
          evidence: [{ id: 5, sequence: 0, mime_type: 'image/jpeg', size_bytes: 7 }],
        },
      } };
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, data: { report_reference: 'REP-20260816-READY', status: 'Submitted', submitted_at: '2026-08-16T02:00:00Z' } },
    });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();

    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" onSubmitted={onSubmitted} />);

    expect(await screen.findByText('RICE')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Original receipt section 1' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.load(screen.getByRole('img', { name: 'Original receipt section 1' }));
    await user.click(screen.getByRole('checkbox', { name: /want to submit/i }));
    await user.click(screen.getByRole('button', { name: 'Submit report to DTI' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-READY/confirm-ocr',
      { consumer_confirmed: true },
      { headers: { 'X-Report-Resume-Token': 'rsm_device' } },
    ));
    expect(deleteResumeTokenMock).toHaveBeenCalledWith('REP-20260816-READY');
    expect(await screen.findByText('Report submitted to DTI')).toBeInTheDocument();
    expect(onSubmitted).toHaveBeenCalled();
  });

  it('shows the original and allows one poor section to be retaken', async () => {
    history.replaceState(null, '', '/reports/REP-20260816-RETRY/processing');
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['receipt'], { type: 'image/jpeg' }) };
      return { data: { success: true, data: {
        report_reference: 'REP-20260816-RETRY',
        status: 'Needs recapture',
        processing_status: 'needs_recapture',
        message: 'The receipt could not be verified as one continuous receipt. Please capture it again.',
        ready_for_review: false,
        can_recapture: true,
        attempt_number: 1,
        store: { id: 77, store_name: 'Receipt Test Mart' },
        recapture_reason: { code: 'INCOMPLETE_SCAN', message: 'Move from the store header to the total.' },
        evidence: [{ id: 8, sequence: 1, mime_type: 'image/jpeg', size_bytes: 7 }],
      } } };
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {
      capture_session_id: 43,
      session_uuid: 'capture-43',
      capture_token: 'ct_sec_recapture',
      expires_at: '2026-08-16T02:00:00Z',
      store_id: 77,
      capture_mode: 'guided_photos_v1',
      capture_action: 'replace',
      upload_sequence: 1,
      max_file_size: 2 * 1024 * 1024,
      accepted_types: ['image/jpeg'],
      limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
    } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-RETRY" mode="processing" />);

    expect(await screen.findByRole('img', { name: 'Original receipt section 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retake section 2' }));
    expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-RETRY/recapture-session',
      { replace_sequence: 1 },
      { headers: { 'X-Report-Resume-Token': 'rsm_device' } },
    );
    expect(await screen.findByLabelText('Guided receipt scanner')).toBeInTheDocument();
  });

  it('allows clear evidence with uncertain empty OCR to be submitted unchanged', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['receipt'], { type: 'image/jpeg' }) };
      return { data: { success: true, data: {
        report_reference: 'REP-20260816-READY', status: 'Ready for confirmation',
        store: { id: 77, store_name: 'Receipt Test Mart', address: 'San Jose' },
        lines: [], items: [], continuity: { status: 'not_required' }, merchant: { status: 'unverified' },
        warnings: [{ code: 'ITEMS_NOT_FOUND', message: 'No complete receipt item lines were extracted.' }],
        manual_review_required: true,
        evidence: [{ id: 9, sequence: 0, mime_type: 'image/jpeg', size_bytes: 7 }],
      } } };
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, data: { report_reference: 'REP-20260816-READY', status: 'Submitted', submitted_at: '2026-08-16T02:00:00Z' } },
    });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);

    expect(await screen.findByText(/No items detected/i)).toBeInTheDocument();
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    await user.click(screen.getByRole('checkbox', { name: /want to submit/i }));
    await user.click(screen.getByRole('button', { name: 'Submit report to DTI' }));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-READY/confirm-ocr',
      { consumer_confirmed: true },
      { headers: { 'X-Report-Resume-Token': 'rsm_device' } },
    ));
  });

  it('starts a new immutable attempt when one original section is retaken', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['receipt'], { type: 'image/jpeg' }) };
      return { data: { success: true, data: {
        report_reference: 'REP-20260816-READY', status: 'Ready for confirmation',
        store: { id: 77, store_name: 'Receipt Test Mart', address: 'San Jose' }, lines: ['RICE 45.00'], items: [],
        continuity: { status: 'ready' }, merchant: { status: 'matched' }, warnings: [], manual_review_required: false,
        evidence: [{ id: 9, sequence: 2, mime_type: 'image/jpeg', size_bytes: 7 }],
      } } };
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: { ...sessionForRecapture(), upload_sequence: 2, capture_action: 'replace' } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);

    await user.click(await screen.findByRole('button', { name: 'Retake section 3' }));
    expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-READY/recapture-session',
      { replace_sequence: 2 },
      { headers: { 'X-Report-Resume-Token': 'rsm_device' } },
    );
  });

  it('does not reload when the parent receives the same status with a new callback', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: reviewData() } });
    function Parent() {
      const [notifications, setNotifications] = React.useState(0);
      return <><output>{notifications}</output><ReceiptDraftView reference="REP-20260816-READY" mode="review"
        onStatus={() => { if (notifications < 3) setNotifications(notifications + 1); }} /></>;
    }
    render(<Parent />);
    await screen.findByText('Selected store');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1'));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('retains missing sections, blocks confirmation, and retries only failed originals', async () => {
    let broken = true;
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).endsWith('/evidence-assets/2') && broken) throw new Error('offline');
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['image']) };
      return { data: { data: reviewData({ evidence: [1, 2].map(id => ({ id, sequence: id - 1, mime_type: 'image/jpeg', size_bytes: 5 })) }) } };
    });
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    expect(await screen.findByText('Section 2 could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit report to DTI' })).toBeDisabled();
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }));
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 2' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(get.mock.calls.filter(([url]) => String(url).endsWith('/evidence-assets/1'))).toHaveLength(1);
  });

  it('keeps raw OCR off the customer screen and offers an accessible original viewer', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['image']) } : { data: { data: reviewData({ lines: ['RAW_PRIVATE_OCR'], evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] }) } });
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);
    const photo = await screen.findByRole('img', { name: 'Original receipt section 1' });
    fireEvent.load(photo);
    expect(screen.queryByText('RAW_PRIVATE_OCR')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View full size: section 1' }));
    expect(screen.getByRole('dialog', { name: 'Receipt section 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close photo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows refresh failures even after processing status has loaded', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { data: {
      status: 'Processing failed', evidence: [], attempt_number: 1, ready_for_review: false,
    } } }).mockRejectedValue({ response: { status: 429, headers: { 'retry-after': '60' }, data: { message: 'Too Many Attempts.' } } });
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="processing" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many requests/i);
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows a structured extraction read-only with per-field uncertainty, overlap duplicates, and amounts', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['photo']) }
      : { data: { data: reviewData({
        extraction_provider: 'gemini',
        merchant: { status: 'matched', display_name: 'GAISANO GRAND MALL OF ANTIQUE' },
        receipt_number: 'OR 000123',
        transaction_date: '2026-09-10',
        items: [
          { sequence: 0, raw_text: 'RAW SOURCE LINE', item_name: 'SARDINES 155G', quantity: 2, unit: null, observed_price: 70, unit_price: 35, line_total: 70, uncertain_fields: [], section: 1, possible_duplicate_of: null, ocr_confidence: null },
          { sequence: 1, raw_text: null, item_name: 'CANDY', quantity: 1, unit: null, observed_price: 12.5, unit_price: 12.5, line_total: 12.5, uncertain_fields: ['unit_price'], section: 2, possible_duplicate_of: 0, ocr_confidence: null },
        ],
        subtotal: '82.50', subtotal_uncertain: false,
        discounts: [{ description: 'PROMO DISC', amount: '7.50', uncertain: false }],
        adjustments: [{ kind: 'rounding', direction: 'subtract', amount: '0.25', uncertain: false }],
        total: '74.75', total_uncertain: true,
        reconciliation: { status: 'matched', checks: {} },
        manual_review_required: true,
        evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }],
      }) } });
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);

    const first = await screen.findByLabelText('Item 1');
    expect(within(first).getByText('₱35.00 each')).toBeInTheDocument();
    expect(within(first).getByText('₱70.00')).toBeInTheDocument();
    // Under structured extraction a missing OCR confidence is not uncertainty.
    expect(within(first).queryByText(/unclear|Uncertain/)).not.toBeInTheDocument();
    const second = screen.getByLabelText('Item 2');
    expect(within(second).getByText('Unit price unclear — check the photo')).toBeInTheDocument();
    expect(within(second).getByText(/May repeat item 1 where two photos overlap/)).toBeInTheDocument();
    expect(screen.getByText('OR 000123')).toBeInTheDocument();
    const amounts = screen.getByLabelText('Receipt amounts');
    expect(within(amounts).getByText('₱82.50')).toBeInTheDocument();
    expect(within(amounts).getByText(/−₱7\.50 \(PROMO DISC\)/)).toBeInTheDocument();
    expect(within(amounts).getByText('Rounding')).toBeInTheDocument();
    expect(within(amounts).getByText('₱74.75')).toBeInTheDocument();
    expect(within(amounts).getAllByText('Uncertain')).toHaveLength(1);
    expect(screen.getByText('The item amounts add up to the receipt total.')).toBeInTheDocument();
    expect(screen.queryByText('RAW SOURCE LINE')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each([
    ['a matched merchant', { merchant: { status: 'matched', display_name: 'TEST SHOP' } }, 'Matches selected store'],
    ['a confidently read different merchant', { extraction_provider: 'gemini', merchant: { status: 'mismatch', display_name: 'MERCURY DRUG', uncertain: false } }, 'Wrong store?'],
    ['an uncertain merchant read', { extraction_provider: 'gemini', merchant: { status: 'mismatch', display_name: 'MERCURY DRUG', uncertain: true } }, 'Store not confirmed'],
    ['an uncertain matched merchant', { extraction_provider: 'gemini', merchant: { status: 'matched', display_name: 'TEST SHOP', uncertain: true } }, 'Store not confirmed'],
    ['a deleted selected store', { store: null, extraction_provider: 'gemini', merchant: { status: 'mismatch', display_name: 'MERCURY DRUG' } }, 'Store not confirmed'],
    ['an OCR mismatch without a merchant name', { merchant: { status: 'mismatch', display_name: null } }, 'Store not confirmed'],
    ['no merchant text', {}, 'Store not confirmed'],
  ])('blocks only a clear store mismatch: %s', async (_case, overrides, label) => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['photo']) }
      : { data: { data: reviewData({ evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }], manual_review_required: false, ...overrides }) } });
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);

    expect(await screen.findByText(label)).toBeInTheDocument();
    const helper = screen.queryByText(/Receipt shows .* but you selected/);
    if (label === 'Wrong store?') expect(helper).toHaveTextContent(/Change the selected store|change the selected store/);
    else expect(helper).not.toBeInTheDocument();
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    await userEvent.click(screen.getByRole('checkbox'));
    if (label === 'Wrong store?') {
      expect(screen.getByRole('checkbox')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Submit report to DTI' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Change store' })).toBeEnabled();
    } else {
      expect(screen.getByRole('button', { name: 'Submit report to DTI' })).toBeEnabled();
      if (label === 'Store not confirmed') expect(screen.getByText(/Some details couldn’t be read reliably/)).toBeInTheDocument();
    }
  });

  it('opens submitted receipt photos and saved results with tracking access and no mutation controls', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['photo']) }
      : { data: { data: reviewData({ status: 'Resolved', read_only: true, submitted_at: '2026-10-09T01:00:00Z',
        items: [{ sequence: 0, item_name: 'Saved rice', quantity: 1, line_total: 45 }],
        evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] }) } });
    render(<ReceiptDraftView reference="REP-SENT" mode="submitted" onBack={vi.fn()} />);
    expect(await screen.findByText('Saved rice')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Original receipt section 1' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/public/reports/REP-SENT/review', expect.objectContaining({ headers: { 'X-Tracking-Token': 'trk_saved' } }));
    expect(get).toHaveBeenCalledWith('/public/reports/REP-SENT/evidence-assets/1', expect.objectContaining({ headers: { 'X-Tracking-Token': 'trk_saved' } }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retake|Add section|Restart|Change store|Submit report|Retry processing/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View full size: section 1' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('changes the store using the saved draft and clears acknowledgement without uploading again', async () => {
    const initial = reviewData({ merchant: { status: 'matched', display_name: 'Test shop' },
      evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) return { data: new Blob(['photo']) };
      if (url === '/public/establishments') return { data: { data: [{ id: 2, store_name: 'Other shop', address: 'San Jose' }] } };
      return { data: { data: initial } };
    });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { ...initial, store: { id: 2, store_name: 'Other shop', address: 'San Jose' } } } });
    const onStoreChanged = vi.fn();
    render(<ReceiptDraftView reference="REP-CHANGE" mode="review" onStoreChanged={onStoreChanged} />);
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Change store' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Other shop' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    expect(post).toHaveBeenCalledExactlyOnceWith('/public/reports/REP-CHANGE/store', {
      store_id: 2, expected_store_id: 1, expected_attempt_number: 1,
    }, expect.objectContaining({ headers: { 'X-Report-Resume-Token': 'rsm_device' } }));
    expect(onStoreChanged).toHaveBeenCalledWith('Other shop');
    expect(screen.getByRole('button', { name: 'Submit report to DTI' })).toBeDisabled();
  });

  it('cancels store selection without altering the draft', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => url === '/public/establishments'
      ? { data: { data: [] } } : { data: { data: reviewData() } });
    const post = vi.spyOn(apiClient, 'post');
    render(<ReceiptDraftView reference="REP-CANCEL" mode="review" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change store' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to receipt' }));
    expect(await screen.findByText('Test shop')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows submission success even when deleting the revoked local resume credential fails', async () => {
    deleteResumeTokenMock.mockRejectedValue(new Error('Device storage unavailable'));
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['photo']) } : { data: { data: reviewData({ evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] }) } });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { report_reference: 'REP-ACCEPTED', status: 'Submitted', submitted_at: '2026-10-09T01:00:00Z' } } });
    render(<ReceiptDraftView reference="REP-ACCEPTED" mode="review" />);
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit report to DTI' }));
    expect(await screen.findByRole('heading', { name: 'Report submitted to DTI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View receipt and results' })).toBeEnabled();
    expect(screen.queryByText(/report was not submitted/i)).not.toBeInTheDocument();
  });

  it('shows unavailable access when the submitted report has no saved tracking credential', async () => {
    getTrackingTokenMock.mockResolvedValue(null);
    const get = vi.spyOn(apiClient, 'get');
    render(<ReceiptDraftView reference="REP-NOACCESS" mode="submitted" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/secure report credential/i);
    expect(screen.queryByRole('button', { name: 'Submit report to DTI' })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('retries missing photos in submitted viewing without exposing correction controls', async () => {
    let missing = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (String(url).includes('/evidence-assets/')) {
        if (missing) throw new Error('Photo unavailable');
        return { data: new Blob(['photo']) };
      }
      return { data: { data: reviewData({ status: 'Submitted', read_only: true,
        evidence: [{ id: 1, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] }) } };
    });
    render(<ReceiptDraftView reference="REP-MISSING" mode="submitted" />);
    expect(await screen.findByText('Section 1 could not be loaded.')).toBeInTheDocument();
    missing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading photos' }));
    expect(await screen.findByRole('img', { name: 'Original receipt section 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retake section 1' })).not.toBeInTheDocument();
  });

  it('clears acknowledgement when refreshing a changed evidence attempt', async () => {
    let attempt = 1;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => String(url).includes('/evidence-assets/')
      ? { data: new Blob(['photo']) } : { data: { data: reviewData({ attempt_number: attempt,
        evidence: [{ id: attempt, sequence: 0, mime_type: 'image/jpeg', size_bytes: 5 }] }) } });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('connection lost'));
    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" />);
    fireEvent.load(await screen.findByRole('img', { name: 'Original receipt section 1' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit report to DTI' }));
    await screen.findByRole('alert');
    attempt = 2;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh receipt' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.load(screen.getByRole('img', { name: 'Original receipt section 1' }));
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Submit report to DTI' })).toBeDisabled();
  });
});

const reviewData = (overrides = {}) => ({
  status: 'Ready for confirmation', attempt_number: 1, store: { id: 1, store_name: 'Test shop', address: 'San Jose' },
  items: [], evidence: [], merchant: { status: 'unverified', display_name: null }, warnings: [], manual_review_required: true,
  ...overrides,
});

const sessionForRecapture = () => ({
  capture_session_id: 43, session_uuid: 'capture-43', capture_token: 'ct_sec_recapture',
  expires_at: '2026-08-16T02:00:00Z', store_id: 77, capture_mode: 'guided_photos_v1',
  max_file_size: 2 * 1024 * 1024, accepted_types: ['image/jpeg'],
  limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
});
