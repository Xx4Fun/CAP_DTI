import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ReceiptDraftView } from './ReceiptDraftView';

vi.mock('../app/receiptResumeStore', () => ({ getReceiptResumeToken: async () => 'rsm_test' }));
// Camera upload is covered by GuidedReceiptCapture tests; exercise the parent lifecycle at its callback boundary.
vi.mock('./GuidedReceiptCapture', () => ({ GuidedReceiptCapture: ({ onDraftCreated, onCheckStatus, onCancel }: {
  onDraftCreated: () => void; onCheckStatus: () => void; onCancel: () => void;
}) => <><button onClick={onDraftCreated}>Finish upload</button><button onClick={onCheckStatus}>Check status</button><button onClick={onCancel}>Cancel capture</button></> }));

const processing = { status: 'Processing receipt', attempt_number: 1, ready_for_review: false, evidence: [] };
const response = (data = processing) => ({ data: { success: true, data } });
beforeEach(() => { history.replaceState(null, '', '/reports/REP-TEST/processing'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('does not overlap polling and stops after processing completes', async () => {
  vi.useFakeTimers();
  let resolve!: (value: ReturnType<typeof response>) => void;
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(response())
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<ReceiptDraftView reference="REP-TEST" mode="processing" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(24000); });
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => { resolve(response({ ...processing, status: 'Ready for confirmation', ready_for_review: true })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(24000); });
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: /Review detected items/i })).toBeEnabled();
});

it('pauses polling for Retry-After and allows recovery after the cooldown', async () => {
  vi.useFakeTimers();
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(response())
    .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '30' } } })
    .mockResolvedValue(response());
  render(<ReceiptDraftView reference="REP-TEST" mode="processing" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(screen.getByRole('alert')).toHaveTextContent(/Too many requests/);
  await act(async () => { await vi.advanceTimersByTimeAsync(29000); });
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })); });
  expect(get).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('returns from a completed recapture to fresh processing on the same route', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(response({ ...processing, status: 'Needs recapture', can_recapture: true } as typeof processing))
    .mockResolvedValue(response({ ...processing, attempt_number: 2 }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { capture_session_id: 1 } } });
  render(<ReceiptDraftView reference="REP-TEST" mode="processing" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Scan receipt again' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Finish upload' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
  expect(await screen.findByRole('heading', { name: 'Processing receipt' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check status' })).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

it('cancels capture without replacing the existing processing evidence', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue(response({ ...processing, status: 'Needs recapture', can_recapture: true } as typeof processing));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { capture_session_id: 1 } } });
  render(<ReceiptDraftView reference="REP-TEST" mode="processing" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Scan receipt again' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel capture' }));
  expect(screen.getByRole('heading', { name: 'Needs recapture' })).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});
