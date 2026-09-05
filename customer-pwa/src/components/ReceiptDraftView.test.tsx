import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ReceiptDraftView } from './ReceiptDraftView';

const { getResumeTokenMock, deleteResumeTokenMock } = vi.hoisted(() => ({
  getResumeTokenMock: vi.fn(),
  deleteResumeTokenMock: vi.fn(),
}));

vi.mock('../app/receiptResumeStore', () => ({
  getReceiptResumeToken: getResumeTokenMock,
  deleteReceiptResumeToken: deleteResumeTokenMock,
}));

describe('ReceiptDraftView', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    getResumeTokenMock.mockReset().mockResolvedValue('rsm_device');
    deleteResumeTokenMock.mockReset().mockResolvedValue(undefined);
    history.replaceState(null, '', '/reports/REP-20260816-READY/review');
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    if (!URL.revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original-receipt');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
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
    await user.click(screen.getByRole('checkbox', { name: /submit them unchanged/i }));
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

    expect(await screen.findByText(/No item lines were extracted/i)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /submit them unchanged/i }));
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
});

const sessionForRecapture = () => ({
  capture_session_id: 43, session_uuid: 'capture-43', capture_token: 'ct_sec_recapture',
  expires_at: '2026-08-16T02:00:00Z', store_id: 77, capture_mode: 'guided_photos_v1',
  max_file_size: 2 * 1024 * 1024, accepted_types: ['image/jpeg'],
  limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
});
