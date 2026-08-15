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

  it('loads reviewable items and submits customer corrections before DTI review', async () => {
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

    const itemName = await screen.findByLabelText('Item 1 name');
    await user.clear(itemName);
    await user.type(itemName, 'Premium Rice');
    await user.click(screen.getByRole('checkbox', { name: /items shown came from this receipt/i }));
    await user.click(screen.getByRole('button', { name: 'Submit report to DTI' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      '/public/reports/REP-20260816-READY/confirm-ocr',
      expect.objectContaining({
        consumer_confirmed: true,
        confirmed_items: [expect.objectContaining({ item_name: 'Premium Rice', observed_price: 45 })],
      }),
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
      } },
    });
    const user = userEvent.setup();
    render(<ReceiptDraftView reference="REP-20260816-RETRY" mode="processing" />);

    await user.click(await screen.findByRole('button', { name: 'Scan receipt again' }));
    expect(location.pathname).toBe('/reports');
  });
});
