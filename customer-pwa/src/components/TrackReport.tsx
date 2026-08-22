import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileCheck,
  FileClock,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import myReportsHero from '../assets/my-reports-hero.webp';
import {
  filterReportList,
  getReportFilterCounts,
  REPORT_LIST_FILTERS,
  type ReportListFilter,
} from '../app/reportListPresentation';
import { toRecentReportTicket, type StoredRecentReport } from '../app/recentReports';
import { reportStatusTone } from '../app/reportPresentation';
import { getStoreLocation } from '../app/storeLocationLookup';
import './TrackReport.css';

export interface ReportListViewState {
  query: string;
  filter: ReportListFilter;
}

interface TrackReportProps {
  recentReports?: StoredRecentReport[];
  setActiveTab?: (tab: string) => void;
  showBackButton?: boolean;
  onOpenReport?: (report: StoredRecentReport) => void;
  onSetArchived?: (report: StoredRecentReport, archived: boolean) => void;
  onDeleteReport?: (report: StoredRecentReport) => void;
  onRestoreReport?: (report: StoredRecentReport) => void;
  initialViewState?: ReportListViewState;
  onViewStateChange?: (state: ReportListViewState) => void;
}

interface SwipeableReportRowProps {
  report: StoredRecentReport;
  onOpen?: (report: StoredRecentReport) => void;
  onArchive: (report: StoredRecentReport) => void;
  onDelete: (report: StoredRecentReport, trigger?: HTMLButtonElement) => void;
}

interface SwipeStart {
  pointerId: number;
  x: number;
  y: number;
  vertical: boolean;
}

interface SnackbarState {
  message: string;
  actionLabel: string;
  onUndo: () => void;
}

const pluralizeReports = (count: number): string => `${count} ${count === 1 ? 'report' : 'reports'}`;

const ReportStatusIcon = ({ status, size = 18, leading = false }: { status: ReportListFilter; size?: number; leading?: boolean }) => {
  switch (status) {
    case 'Needs recapture': return <Camera size={size} aria-hidden="true" />;
    case 'Processing failed': return <AlertTriangle size={size} aria-hidden="true" />;
    case 'Processing': return <RefreshCw size={size} aria-hidden="true" />;
    case 'Ready to review': return leading
      ? <ShoppingBasket size={size} aria-hidden="true" />
      : <CircleCheck size={size} aria-hidden="true" />;
    case 'Submitted': return <FileCheck size={size} aria-hidden="true" />;
    case 'Under review': return <Search size={size} aria-hidden="true" />;
    case 'Closed': return <BadgeCheck size={size} aria-hidden="true" />;
    case 'Archived': return <Archive size={size} aria-hidden="true" />;
    default: return null;
  }
};

const SwipeableReportRow = ({ report, onOpen, onArchive, onDelete }: SwipeableReportRowProps) => {
  const [offset, setOffset] = useState(0);
  const [rowWidth, setRowWidth] = useState(1);
  const startRef = useRef<SwipeStart | null>(null);
  const offsetRef = useRef(0);
  const suppressClickRef = useRef(false);
  const archived = Boolean(report.archivedAt);

  const reset = () => {
    offsetRef.current = 0;
    setOffset(0);
    startRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setRowWidth(Math.max(event.currentTarget.getBoundingClientRect().width, 1));
    startRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      vertical: false,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId || start.vertical) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) return;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      startRef.current = null;
      reset();
      return;
    }
    if (deltaX >= 0) return;
    event.preventDefault();
    const width = Math.max(event.currentTarget.getBoundingClientRect().width, 1);
    const nextOffset = Math.max(deltaX, width * -0.7);
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) {
      reset();
      return;
    }
    const width = Math.max(event.currentTarget.getBoundingClientRect().width, 1);
    const distance = -offsetRef.current;
    reset();
    if (distance >= width * 0.55) {
      suppressClickRef.current = true;
      onDelete(report);
    } else if (distance >= width * 0.24) {
      suppressClickRef.current = true;
      onArchive(report);
    }
  };

  const canonicalStatus = toRecentReportTicket(report).status;
  const ticket = toRecentReportTicket(report);
  const statusTone = reportStatusTone(report.status);
  const displayedTone = archived ? 'archived' : statusTone;
  const displayedStatus: ReportListFilter = archived ? 'Archived' : canonicalStatus;
  const deleteActive = -offset >= rowWidth * 0.55;
  const location = getStoreLocation(report.storeName);

  return (
    <div
      className={`track-report-swipe-row track-report-row-tone-${displayedTone}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSwipe}
      onPointerCancel={reset}
    >
      <div className="track-report-swipe-actions" aria-hidden="true">
        <span className="track-report-swipe-action track-report-swipe-archive">
          {archived ? <RotateCcw size={22} /> : <Archive size={22} />}
          {archived ? 'Unarchive' : 'Archive'}
        </span>
        <span className={`track-report-swipe-action track-report-swipe-delete ${deleteActive ? 'active' : ''}`}>
          <Trash2 size={22} /> Delete
        </span>
      </div>
      <div
        className="track-report-row-surface"
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
      >
        <button
          type="button"
          className="track-report-list-item"
          aria-label={`Open report ${report.reportReference}: ${canonicalStatus}`}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onOpen?.(report);
          }}
        >
          <div className="track-report-card-top-section">
            <span className={`track-report-card-icon track-report-card-icon--${displayedTone}`} aria-hidden="true">
              <ReportStatusIcon status={displayedStatus} size={24} leading />
              {displayedStatus === 'Needs recapture' && <span className="track-report-icon-alert-dot" aria-hidden="true" />}
            </span>
            <div className="track-report-list-main">
              <div className="track-report-card-top">
                <strong className="track-report-id">{ticket.reportId}</strong>
              </div>
              <span className="track-report-store">{report.storeName}</span>
              <span className="track-report-location">
                <MapPin size={13} aria-hidden="true" />
                <span>{location}</span>
              </span>
            </div>
          </div>
          <div className="track-report-card-meta">
            <div className="track-report-meta-left">
              <span className="track-report-meta-date">
                <CalendarDays size={14} aria-hidden="true" /> {ticket.date}
              </span>
              {ticket.time && (
                <>
                  <span className="track-report-meta-divider" aria-hidden="true" />
                  <span className="track-report-meta-time">
                    <Clock3 size={13} className="track-report-time-clock" aria-hidden="true" />
                    {ticket.time}
                  </span>
                </>
              )}
            </div>
            <div className="track-report-meta-right">
              <span className={`track-report-status track-report-status-${displayedTone}`}>
                <ReportStatusIcon status={displayedStatus} size={13} />
                <span>{displayedStatus}</span>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </div>
          </div>
        </button>
        <div className="track-report-inline-actions" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            aria-label={`${archived ? 'Restore' : 'Archive'} report ${report.reportReference}`}
            onClick={(event) => {
              event.stopPropagation();
              onArchive(report);
            }}
          >
            {archived ? <RotateCcw size={17} aria-hidden="true" /> : <Archive size={17} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="track-report-inline-delete"
            aria-label={`Delete report ${report.reportReference}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(report, event.currentTarget);
            }}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const TrackReport = ({
  recentReports = [],
  setActiveTab,
  showBackButton,
  onOpenReport,
  onSetArchived,
  onDeleteReport,
  onRestoreReport,
  initialViewState,
  onViewStateChange,
}: TrackReportProps) => {
  const [query, setQuery] = useState(initialViewState?.query ?? '');
  const [filter, setFilter] = useState<ReportListFilter>(initialViewState?.filter ?? 'All');
  const [pendingDelete, setPendingDelete] = useState<StoredRecentReport | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const snackbarTimerRef = useRef<number | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    if (snackbarTimerRef.current) window.clearTimeout(snackbarTimerRef.current);
  }, []);

  useEffect(() => {
    if (!pendingDelete) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelDeleteRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingDelete(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const returnTarget = dialogReturnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [pendingDelete]);

  const updateViewState = (nextQuery: string, nextFilter: ReportListFilter) => {
    setQuery(nextQuery);
    setFilter(nextFilter);
    onViewStateChange?.({ query: nextQuery, filter: nextFilter });
  };

  const showUndo = (next: SnackbarState) => {
    if (snackbarTimerRef.current) window.clearTimeout(snackbarTimerRef.current);
    setSnackbar(next);
    snackbarTimerRef.current = window.setTimeout(() => setSnackbar(null), 5000);
  };

  const handleArchive = (report: StoredRecentReport) => {
    const shouldArchive = !report.archivedAt;
    onSetArchived?.(report, shouldArchive);
    showUndo({
      message: shouldArchive ? 'Report archived' : 'Report restored',
      actionLabel: shouldArchive ? 'Undo archive' : 'Undo unarchive',
      onUndo: () => onSetArchived?.(report, !shouldArchive),
    });
  };

  const handleDeleteRequest = (report: StoredRecentReport, trigger?: HTMLButtonElement) => {
    dialogReturnFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPendingDelete(report);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deletedReport = pendingDelete;
    setPendingDelete(null);
    onDeleteReport?.(deletedReport);
    showUndo({
      message: 'Report removed',
      actionLabel: 'Undo delete',
      onUndo: () => onRestoreReport?.(deletedReport),
    });
  };

  const counts = useMemo(() => getReportFilterCounts(recentReports), [recentReports]);
  const visibleReports = useMemo(
    () => filterReportList(recentReports, query, filter),
    [filter, query, recentReports],
  );
  const hasBackButton = Boolean(setActiveTab && showBackButton !== false);
  return (
    <div className="track-report-page track-report-library-page">
      <header className={`track-report-heading${hasBackButton ? ' track-report-heading--with-back' : ''}`}>
        {hasBackButton && (
          <button
            type="button"
            className="track-report-back"
            aria-label="Back to Reports"
            onClick={() => setActiveTab?.('reports')}
          >
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
        )}
        <div className="track-report-heading-copy">
          <h1 id="my-reports-title">My Reports</h1>
          <p>View and manage all your submitted reports.</p>
        </div>
        <img className="track-report-hero-illustration" src={myReportsHero} alt="" />
      </header>

      {recentReports.length > 0 && (
        <section className="track-report-controls" aria-label="Report search and filters">
          <div className="track-report-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search reports"
              placeholder="Search by reference, store or date"
              value={query}
              onChange={(event) => updateViewState(event.target.value, filter)}
            />
            {query && (
              <button type="button" aria-label="Clear report search" onClick={() => updateViewState('', filter)}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="track-report-filters" aria-label="Filter reports by status">
            {REPORT_LIST_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                className={`price-classification-pill${filter === item ? ' is-selected' : ''}`}
                aria-pressed={filter === item}
                aria-label={`${item}, ${pluralizeReports(counts[item])}`}
                onClick={() => updateViewState(query, item)}
              >
                <ReportStatusIcon status={item} size={16} />
                <span>{item}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recentReports.length === 0 ? (
        <section className="track-report-empty" aria-labelledby="my-reports-title">
          <span className="track-report-empty-icon"><FileClock size={26} aria-hidden="true" /></span>
          <h2>No reports yet</h2>
          <p>Reports you submit from this device will appear here automatically.</p>
          {setActiveTab && (
            <button type="button" className="btn-primary track-report-empty-action" onClick={() => setActiveTab('reports')}>
              <Plus size={18} aria-hidden="true" /> Submit a report
            </button>
          )}
        </section>
      ) : visibleReports.length > 0 ? (
        <section className="track-report-list" aria-labelledby="my-reports-title">
          {visibleReports.map((report) => (
            <SwipeableReportRow
              key={report.reportReference}
              report={report}
              onOpen={onOpenReport}
              onArchive={handleArchive}
              onDelete={handleDeleteRequest}
            />
          ))}
        </section>
      ) : (
        <section className="track-report-empty track-report-no-results" aria-live="polite">
          <span className="track-report-empty-icon"><Search size={25} aria-hidden="true" /></span>
          <h2>No matching reports</h2>
          <p>Try another reference, store, or report status.</p>
          <button type="button" className="track-report-clear-results" onClick={() => updateViewState('', 'All')}>
            Clear search and filters
          </button>
        </section>
      )}

      {pendingDelete && (
        <div className="track-report-dialog-scrim" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setPendingDelete(null);
        }}>
          <section ref={deleteDialogRef} className="track-report-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-report-title">
            <span className="track-report-delete-icon"><Trash2 size={24} aria-hidden="true" /></span>
            <h2 id="delete-report-title">Remove report from this device?</h2>
            <p>This removes <strong>{pendingDelete.reportReference}</strong> from My Reports on this device. Your official report will remain submitted to DTI.</p>
            <div className="track-report-dialog-actions">
              <button ref={cancelDeleteRef} type="button" className="track-report-dialog-cancel" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className="track-report-dialog-delete" onClick={confirmDelete}>Delete from My Reports</button>
            </div>
          </section>
        </div>
      )}

      {snackbar && (
        <div className="track-report-snackbar" role="status" aria-live="polite">
          <span>{snackbar.message}</span>
          <button type="button" aria-label={snackbar.actionLabel} onClick={() => {
            snackbar.onUndo();
            setSnackbar(null);
          }}>Undo</button>
        </div>
      )}
    </div>
  );
};

export default TrackReport;
