import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    getResumeTokenMock.mockReset().mockResolvedValue('rsm_device');
    deleteResumeTokenMock.mockReset().mockResolvedValue(undefined);
    history.replaceState(null, '', '/reports/REP-20260816-READY/review');
  });

  it('shows OCR items read-only and submits only customer confirmation', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          report_reference: 'REP-20260816-READY',
          status: 'Ready for confirmation',
          store: { id: 77, store_name: 'Receipt Test Mart', address: 'San Jose' },
          lines: ['RICE 45.00'],
          items: [{ sequence: 0, raw_text: 'RICE 45.00', item_name: 'RICE', quantity: null, unit: null, observed_price: 45, ocr_confidence: 0.91 }],
          continuity: { status: 'ready', continuity_score: 1, reasons: [] },
          merchant: { status: 'matched' },
          manual_review_required: false,
        },
      },
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, data: { report_reference: 'REP-20260816-READY', status: 'Submitted', submitted_at: '2026-08-16T02:00:00Z' } },
    });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();

    render(<ReceiptDraftView reference="REP-20260816-READY" mode="review" onSubmitted={onSubmitted} />);

    expect(await screen.findByText('RICE')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /items shown came from this receipt/i }));
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

  it('offers a clear restart when continuity verification requires recapture', async () => {
    history.replaceState(null, '', '/reports/REP-20260816-RETRY/processing');
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, data: {
        report_reference: 'REP-20260816-RETRY',
        status: 'Needs recapture',
        processing_status: 'needs_recapture',
        message: 'The receipt could not be verified as one continuous receipt. Please capture it again.',
        ready_for_review: false,
        can_recapture: true,
        attempt_number: 1,
        store: { id: 77, store_name: 'Receipt Test Mart' },
        recapture_reason: { code: 'INCOMPLETE_SCAN', message: 'Move from the store header to the total.' },
      } },
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {
      capture_session_id: 43,
      session_uuid: 'capture-43',
      capture_token: 'ct_sec_recapture',
      expires_at: '2026-08-16T02:00:00Z',
      store_id: 77,
      capture_mode: 'continuous_video_v1',
      max_file_size: 25 * 1024 * 1024,
      accepted_types: ['video/webm', 'video/mp4'],
      limits: { max_duration_seconds: 30, max_video_bytes: 25 * 1024 * 1024, max_frame_bytes: 2 * 1024 * 1024, min_frames: 2, max_frames: 12 },
    } } });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-RETRY" mode="processing" />);

    await user.click(await screen.findByRole('button', { name: 'Scan receipt again' }));
    expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-RETRY/recapture-session',
      {},
      { headers: { 'X-Report-Resume-Token': 'rsm_device' } },
    );
    expect(await screen.findByLabelText('Continuous receipt scanner')).toBeInTheDocument();
  });
});
