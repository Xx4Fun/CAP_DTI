import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { StoredRecentReport } from '../app/recentReports';
import { TrackReport } from './TrackReport';

const recentReports: StoredRecentReport[] = [
  {
    reportReference: 'REP-NEWEST',
    storeName: 'Newest Store',
    status: 'Under initial evaluation',
    submittedAt: '2026-08-22T15:05:00',
  },
  {
    reportReference: 'REP-OLDER',
    storeName: 'Older Store',
    status: 'Submitted',
    submittedAt: '2026-08-21T02:00:00Z',
  },
  {
    reportReference: 'REP-READY',
    storeName: 'Ready Store',
    status: 'Ready for confirmation',
    submittedAt: '2026-08-20T02:00:00Z',
  },
  {
    reportReference: 'REP-ARCHIVED',
    storeName: 'Archived Store',
    status: 'Resolved',
    submittedAt: '2026-08-19T02:00:00Z',
    archivedAt: '2026-08-22T03:00:00Z',
  },
];

describe('My Reports list', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows saved reports without automatically loading a timeline', () => {
    const getReport = vi.spyOn(apiClient, 'get');

    render(<TrackReport recentReports={recentReports} />);

    expect(screen.getByRole('heading', { name: 'My Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open report REP-NEWEST/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open report REP-OLDER/i })).toBeInTheDocument();
    expect(screen.queryByText(/Evaluation Progress/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open a report from another device/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tracking token/i)).not.toBeInTheDocument();
    expect(getReport).not.toHaveBeenCalled();
  });

  it('builds the reference-led hero around the retained back control', () => {
    const { container } = render(<TrackReport recentReports={recentReports} setActiveTab={vi.fn()} />);

    const header = screen.getByRole('banner');
    expect(header).toContainElement(screen.getByRole('button', { name: 'Back to Reports' }));
    expect(header).toContainElement(screen.getByRole('heading', { name: 'My Reports' }));
    expect(header).toHaveTextContent('View and manage all your submitted reports.');
    const illustration = container.querySelector<HTMLImageElement>('.track-report-hero-illustration');
    expect(illustration).toHaveAttribute('alt', '');
    expect(illustration?.src).toMatch(/\/my-reports-hero\.webp$/);
    expect(header).toHaveClass('track-report-heading', 'track-report-heading--with-back');
    expect(getComputedStyle(header).borderRadius).toBe('0px');
    expect(getComputedStyle(header).boxShadow).toBe('none');
    expect(getComputedStyle(header).minHeight).toBe('212px');
    expect(getComputedStyle(header).paddingTop).toBe('64px');

    const backButton = screen.getByRole('button', { name: 'Back to Reports' });
    expect(getComputedStyle(backButton).position).toBe('absolute');
    expect(getComputedStyle(backButton).width).toBe('44px');
    expect(getComputedStyle(backButton).height).toBe('44px');
    expect(getComputedStyle(backButton).borderRadius).toBe('50%');
  });

  it('searches by store, reference, or displayed date and clears a filtered dead end', async () => {
    const user = userEvent.setup();
    render(<TrackReport recentReports={recentReports} />);

    const search = screen.getByRole('searchbox', { name: 'Search reports' });
    expect(search).toHaveAttribute('placeholder', 'Search by reference, store or date');
    await user.type(search, 'older store');
    expect(screen.getByRole('button', { name: /open report REP-OLDER/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open report REP-NEWEST/i })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Aug 22, 2026');
    expect(screen.getByRole('button', { name: /open report REP-NEWEST/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open report REP-OLDER/i })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'missing report');
    expect(screen.getByText('No matching reports')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('button', { name: /open report REP-NEWEST/i })).toBeInTheDocument();
  });

  it('uses Prices-style status pills without exposing counts visually', async () => {
    const user = userEvent.setup();
    render(<TrackReport recentReports={recentReports} />);

    const allFilter = screen.getByRole('button', { name: 'All, 3 reports' });
    expect(allFilter).toHaveAttribute('aria-pressed', 'true');
    expect(allFilter).toHaveClass('price-classification-pill', 'is-selected');
    expect(allFilter).toHaveTextContent(/^All$/);
    expect(screen.getByRole('button', { name: 'Ready to review, 1 report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived, 1 report' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /reports?$/ }).map((button) => button.textContent)).toEqual([
      'All',
      'Needs recapture',
      'Processing failed',
      'Processing',
      'Ready to review',
      'Submitted',
      'Under review',
      'Closed',
      'Archived',
    ]);
    expect(screen.queryByRole('button', { name: /open report REP-ARCHIVED/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ready to review, 1 report' }));
    expect(screen.getByRole('button', { name: /open report REP-READY/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open report REP-OLDER/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archived, 1 report' }));
    expect(screen.getByRole('button', { name: /open report REP-ARCHIVED/i })).toBeInTheDocument();
  });

  it('moves status out of the reference row and orders date, time, then status in the footer', () => {
    render(<TrackReport recentReports={recentReports} />);

    const row = screen.getByRole('button', { name: /open report REP-NEWEST/i });
    const metadata = row.querySelector('.track-report-card-meta') as HTMLElement;
    expect(row.querySelector('.track-report-card-icon .lucide-search')).toBeInTheDocument();
    expect(row.querySelector('.track-report-card-top .track-report-status')).not.toBeInTheDocument();
    expect(row.querySelector('.track-report-meta-date')).toHaveTextContent('Aug 22, 2026');
    expect(row.querySelector('.track-report-meta-time')).toHaveTextContent('3:05 PM');
    expect(row.querySelector('.track-report-meta-time .lucide-clock-3')).toBeInTheDocument();
    expect(metadata.querySelector('.track-report-status')).toHaveTextContent('Under review');
    expect(metadata).not.toHaveTextContent('DTI Evaluation');
    expect(Array.from(metadata.querySelectorAll(
      '.track-report-meta-date, .track-report-meta-time, .track-report-status',
    )).map((element) => element.classList[0])).toEqual([
      'track-report-meta-date',
      'track-report-meta-time',
      'track-report-status',
    ]);
    expect(row.querySelector('.track-report-location')).toBeInTheDocument();
    expect(row.querySelector('.track-report-store .lucide-building-2')).not.toBeInTheDocument();

    const readyRow = screen.getByRole('button', { name: /open report REP-READY/i });
    expect(readyRow.querySelector('.track-report-card-icon .lucide-shopping-basket')).toBeInTheDocument();
    expect(readyRow.querySelector('.track-report-card-meta .track-report-status .lucide-circle-check')).toBeInTheDocument();
  });

  it('renders one uninterrupted newest-first report list without date group labels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22, 12, 0, 0));
    const { container } = render(<TrackReport recentReports={recentReports} />);

    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This week' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Earlier' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.track-report-list > .track-report-swipe-row')).toHaveLength(3);
  });

  it('opens the selected report through the list callback', async () => {
    const onOpenReport = vi.fn();
    render(<TrackReport recentReports={recentReports} onOpenReport={onOpenReport} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /open report REP-OLDER/i }));

    expect(onOpenReport).toHaveBeenCalledWith(recentReports[1]);
  });

  it('offers archive and delete actions without requiring a swipe gesture', async () => {
    const onSetArchived = vi.fn();
    const onDeleteReport = vi.fn();
    const user = userEvent.setup();
    render(
      <TrackReport
        recentReports={recentReports}
        onSetArchived={onSetArchived}
        onDeleteReport={onDeleteReport}
      />,
    );

    screen.getByRole('button', { name: 'Archive report REP-NEWEST' }).focus();
    await user.keyboard('{Enter}');
    expect(onSetArchived).toHaveBeenCalledWith(recentReports[0], true);

    screen.getByRole('button', { name: 'Delete report REP-OLDER' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Remove report from this device?' })).toBeInTheDocument();
    expect(onDeleteReport).not.toHaveBeenCalled();
  });

  it('uses an icon-only back control and returns to the Reports page', async () => {
    const setActiveTab = vi.fn();
    render(<TrackReport recentReports={recentReports} setActiveTab={setActiveTab} />);

    const back = screen.getByRole('button', { name: 'Back to Reports' });
    expect(back).not.toHaveTextContent(/back/i);
    expect(getComputedStyle(back).width).toBe('44px');
    expect(getComputedStyle(back).height).toBe('44px');
    await userEvent.setup().click(back);

    expect(setActiveTab).toHaveBeenCalledWith('reports');
  });

  it('separates report identity, status, and metadata into distinct card regions', () => {
    render(<TrackReport recentReports={recentReports} />);

    const card = screen.getByRole('button', { name: /open report REP-NEWEST/i }).closest('.track-report-swipe-row') as HTMLElement;
    const row = screen.getByRole('button', { name: /open report REP-NEWEST/i });
    const identity = row.querySelector('.track-report-list-main') as HTMLElement;
    const status = row.querySelector('.track-report-status') as HTMLElement;
    const metadata = row.querySelector('.track-report-card-meta') as HTMLElement;
    expect(getComputedStyle(card).borderRadius).toBe('18px');
    expect(row).toBeInTheDocument();
    expect(identity).toHaveTextContent('REP-NEWEST');
    expect(identity).toHaveTextContent('Newest Store');
    expect(status).toHaveTextContent('Under review');
    expect(identity).not.toContainElement(status);
    expect(metadata).toContainElement(status);
    expect(metadata).toBeInTheDocument();
    expect(getComputedStyle(row.querySelector('.track-report-status') as HTMLElement).whiteSpace).toBe('nowrap');
  });

  it('soft-swipes an active report into the archive and shows Undo', async () => {
    const onSetArchived = vi.fn();
    const onRestoreReport = vi.fn();
    render(
      <TrackReport
        recentReports={recentReports}
        onSetArchived={onSetArchived}
        onRestoreReport={onRestoreReport}
      />,
    );

    expect(screen.queryByText('Swipe left on a report to archive or delete.')).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: /open report REP-NEWEST/i }).closest('.track-report-swipe-row');
    expect(row).not.toBeNull();
    vi.spyOn(row as HTMLElement, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect);
    fireEvent.pointerDown(row as HTMLElement, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row as HTMLElement, { pointerId: 1, clientX: 205, clientY: 103 });
    fireEvent.pointerUp(row as HTMLElement, { pointerId: 1, clientX: 205, clientY: 103 });

    expect(onSetArchived).toHaveBeenCalledWith(recentReports[0], true);
    expect(screen.getByRole('status')).toHaveTextContent('Report archived');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo archive' }));
    expect(onSetArchived).toHaveBeenLastCalledWith(recentReports[0], false);
  });

  it('hard-swipes to a local-only delete confirmation and supports Undo', async () => {
    const onDeleteReport = vi.fn();
    const onRestoreReport = vi.fn();
    render(
      <TrackReport
        recentReports={recentReports}
        onDeleteReport={onDeleteReport}
        onRestoreReport={onRestoreReport}
      />,
    );

    const row = screen.getByRole('button', { name: /open report REP-OLDER/i }).closest('.track-report-swipe-row');
    vi.spyOn(row as HTMLElement, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect);
    fireEvent.pointerDown(row as HTMLElement, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row as HTMLElement, { pointerId: 2, clientX: 105, clientY: 103 });
    fireEvent.pointerUp(row as HTMLElement, { pointerId: 2, clientX: 105, clientY: 103 });

    const dialog = screen.getByRole('dialog', { name: 'Remove report from this device?' });
    expect(dialog).toHaveTextContent('official report will remain submitted');
    expect(onDeleteReport).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete from My Reports' }));
    expect(onDeleteReport).toHaveBeenCalledWith(recentReports[1]);
    expect(screen.getByRole('status')).toHaveTextContent('Report removed');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo delete' }));
    expect(onRestoreReport).toHaveBeenCalledWith(recentReports[1]);
  });

  it('focuses the safe dialog action and restores focus after Escape', async () => {
    const user = userEvent.setup();
    render(<TrackReport recentReports={recentReports} />);

    const deleteAction = screen.getByRole('button', { name: 'Delete report REP-OLDER' });
    deleteAction.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Remove report from this device?' })).not.toBeInTheDocument();
    expect(deleteAction).toHaveFocus();
  });

  it('traps keyboard focus and prevents background scrolling while removal is open', async () => {
    const user = userEvent.setup();
    render(<TrackReport recentReports={recentReports} />);

    const deleteAction = screen.getByRole('button', { name: 'Delete report REP-OLDER' });
    deleteAction.focus();
    await user.keyboard('{Enter}');

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete from My Reports' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(cancel).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(confirm).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(cancel).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the gray archive stage until the proportional hard-delete threshold', () => {
    render(<TrackReport recentReports={recentReports} />);
    const row = screen.getByRole('button', { name: /open report REP-NEWEST/i }).closest('.track-report-swipe-row') as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ width: 640 } as DOMRect);
    const deleteAction = screen.getAllByText('Delete')[0].closest('.track-report-swipe-delete');

    fireEvent.pointerDown(row, { pointerId: 5, button: 0, clientX: 600, clientY: 100 });
    fireEvent.pointerMove(row, { pointerId: 5, clientX: 405, clientY: 102 });
    expect(deleteAction).not.toHaveClass('active');

    fireEvent.pointerMove(row, { pointerId: 5, clientX: 200, clientY: 102 });
    expect(deleteAction).toHaveClass('active');
    fireEvent.pointerCancel(row, { pointerId: 5 });
  });

  it('uses the soft swipe to unarchive inside the Archived filter', async () => {
    const onSetArchived = vi.fn();
    const user = userEvent.setup();
    render(<TrackReport recentReports={recentReports} onSetArchived={onSetArchived} />);
    await user.click(screen.getByRole('button', { name: 'Archived, 1 report' }));

    const row = screen.getByRole('button', { name: /open report REP-ARCHIVED/i }).closest('.track-report-swipe-row');
    vi.spyOn(row as HTMLElement, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect);
    fireEvent.pointerDown(row as HTMLElement, { pointerId: 3, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row as HTMLElement, { pointerId: 3, clientX: 205, clientY: 102 });
    fireEvent.pointerUp(row as HTMLElement, { pointerId: 3, clientX: 205, clientY: 102 });

    expect(onSetArchived).toHaveBeenCalledWith(recentReports[3], false);
    expect(screen.getByRole('status')).toHaveTextContent('Report restored');
  });

  it('does not trigger a swipe action while the user scrolls vertically', () => {
    const onSetArchived = vi.fn();
    const onDeleteReport = vi.fn();
    render(
      <TrackReport
        recentReports={recentReports}
        onSetArchived={onSetArchived}
        onDeleteReport={onDeleteReport}
      />,
    );

    const row = screen.getByRole('button', { name: /open report REP-NEWEST/i }).closest('.track-report-swipe-row');
    vi.spyOn(row as HTMLElement, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect);
    fireEvent.pointerDown(row as HTMLElement, { pointerId: 4, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row as HTMLElement, { pointerId: 4, clientX: 280, clientY: 170 });
    fireEvent.pointerUp(row as HTMLElement, { pointerId: 4, clientX: 280, clientY: 170 });

    expect(onSetArchived).not.toHaveBeenCalled();
    expect(onDeleteReport).not.toHaveBeenCalled();
  });

  it('offers report submission from an informative empty state', async () => {
    const setActiveTab = vi.fn();
    render(<TrackReport recentReports={[]} setActiveTab={setActiveTab} />);

    expect(screen.getByText('No reports yet')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit a report' }));

    expect(setActiveTab).toHaveBeenCalledWith('reports');
  });
});
