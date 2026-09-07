import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Info,
  Maximize2,
  Minus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  apiClient,
  type Commodity,
  type CommodityHistoryResponse,
  resolveImageUrl,
  type SrpHistoryEntry,
} from '../api/client';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { getPriceLabel, type PriceDataSource } from '../app/priceDataPresentation';
import { ProductImageLightbox } from './ProductImageLightbox';
import { ProgressiveProductImage, type ProductImageSettlement } from './ProgressiveProductImage';

export interface ProductDetailProps {
  commodity: Commodity;
  dataSource: PriceDataSource;
  dataFetchedAt: number | null;
  onBack: () => void;
  stateOfCalamity?: boolean;
}

type DetailTab = 'details' | 'history' | 'source';
type HistoryStatus = 'loading' | 'success' | 'error';
type Trend =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'no-past' }
  | { kind: 'increase'; difference: number }
  | { kind: 'decrease'; difference: number }
  | { kind: 'unchanged'; difference: number };

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'history', label: 'History' },
  { id: 'source', label: 'Source' },
];
const CATEGORY_ACRONYMS = new Set(['DTI', 'LPG', 'NFA', 'PET', 'SRP']);

function formatDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? new Date(value)
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(parsed);
}

function formatCategoryDisplay(value: string): string {
  return value
    .split(/\s+-\s+/)
    .map((segment) => {
      let tokenIndex = 0;
      return segment.replace(/[A-Za-z0-9]+/g, (token) => {
        const upperToken = token.toLocaleUpperCase();
        const isAcronym = CATEGORY_ACRONYMS.has(upperToken);
        const normalized = isAcronym ? upperToken : token.toLocaleLowerCase();
        const result = tokenIndex === 0 && !isAcronym
          ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
          : normalized;
        tokenIndex += 1;
        return result;
      });
    })
    .join(' - ');
}

function deriveTrend(
  commodity: Commodity,
  history: SrpHistoryEntry[],
  status: HistoryStatus,
): Trend {
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'error') return { kind: 'unavailable' };
  if (!commodity.effective_date) return { kind: 'no-past' };

  const currentDate = new Date(`${commodity.effective_date}T00:00:00+08:00`).getTime();
  const previous = history.find((entry) => {
    if (!entry.effective_date || entry.id === commodity.id) return false;
    return new Date(`${entry.effective_date}T00:00:00+08:00`).getTime() < currentDate;
  });
  if (!previous) return { kind: 'no-past' };

  const difference = Number(commodity.baseline_price) - Number(previous.baseline_price);
  if (Math.abs(difference) < 0.005) return { kind: 'unchanged', difference: 0 };
  return difference > 0
    ? { kind: 'increase', difference }
    : { kind: 'decrease', difference };
}

const MetadataRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="product-detail-fact">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const TrendValue: React.FC<{ trend: Trend }> = ({ trend }) => {
  if (trend.kind === 'loading') {
    return <span className="product-detail-trend-loading" aria-label="Loading SRP history" />;
  }
  if (trend.kind === 'unavailable') return <strong>History unavailable</strong>;
  if (trend.kind === 'no-past') return <strong>No past SRP</strong>;

  const IconComponent = trend.kind === 'increase'
    ? TrendingUp
    : trend.kind === 'decrease'
      ? TrendingDown
      : Minus;
  const prefix = trend.kind === 'increase' ? '+' : trend.kind === 'decrease' ? '-' : '';

  return (
    <>
      <strong className={`product-detail-trend-value product-detail-trend-value--${trend.kind}`}>
        <IconComponent size={14} aria-hidden="true" />
        {prefix}{'\u20B1'}{Math.abs(trend.difference).toFixed(2)}
      </strong>
      <span>{trend.kind === 'unchanged' ? 'No change' : 'vs past SRP'}</span>
    </>
  );
};

export const ProductDetail: React.FC<ProductDetailProps> = ({
  commodity,
  dataSource,
  dataFetchedAt,
  onBack,
  stateOfCalamity,
}) => {
  const [isFreezeOpen, setIsFreezeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('loading');
  const [history, setHistory] = useState<SrpHistoryEntry[]>([]);
  const resolvedImageUrl = resolveImageUrl(commodity.image_path);
  const [imageStatus, setImageStatus] = useState<ProductImageSettlement | 'loading'>(
    resolvedImageUrl ? 'loading' : 'missing',
  );
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const imageTriggerRef = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);
  const tabRefs = useRef<Partial<Record<DetailTab, HTMLButtonElement | null>>>({});

  const loadHistory = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setHistoryStatus('loading');
    try {
      const response = await apiClient.get<{ success: boolean; data: CommodityHistoryResponse }>(
        `/public/commodities/${commodity.id}/history`,
      );
      if (requestId !== requestSequence.current) return;
      setHistory(Array.isArray(response.data.data.history) ? response.data.data.history : []);
      setHistoryStatus('success');
    } catch {
      if (requestId !== requestSequence.current) return;
      setHistory([]);
      setHistoryStatus('error');
    }
  }, [commodity.id]);

  useEffect(() => {
    setImageStatus(resolvedImageUrl ? 'loading' : 'missing');
    setIsLightboxOpen(false);
    setIsFreezeOpen(false);
    setActiveTab('details');
    setHistory([]);
    void loadHistory();
    return () => {
      requestSequence.current += 1;
    };
  }, [commodity.id, loadHistory, resolvedImageUrl]);

  const parsed = formatCommodityDisplay(
    commodity.commodity_name,
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
    commodity.effective_date || '',
  );
  const title = parsed.title || commodity.commodity_name;
  const subtitle = formatCategoryDisplay(parsed.categoryPath || commodity.category || 'Category not provided');
  const effectiveDate = formatDate(commodity.effective_date);
  const fetchedDate = formatDate(dataFetchedAt);
  const priceLabel = getPriceLabel(dataSource);
  const trend = useMemo(
    () => deriveTrend(commodity, history, historyStatus),
    [commodity, history, historyStatus],
  );
  const classification = commodity.regulatory_classification === 'BASIC_NECESSITY'
    ? 'Basic Necessity'
    : commodity.regulatory_classification === 'PRIME_COMMODITY'
      ? 'Prime Commodity'
      : 'Not provided';
  const hasActivePriceFreezeCoverage = stateOfCalamity === true && commodity.price_freeze_applicable === true;
  const monitoringLabel = stateOfCalamity === false
    ? 'Normal monitoring'
    : hasActivePriceFreezeCoverage
      ? 'Price freeze coverage'
      : null;

  const selectTab = (tab: DetailTab, focus = false) => {
    setActiveTab(tab);
    if (focus) tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: DetailTab) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(TABS[nextIndex].id, true);
  };

  return (
    <div className="product-detail">
      <section className="product-detail-hero" aria-labelledby="product-detail-title">
        <div className="product-detail-image-stage">
          <button
            type="button"
            className="product-detail-circle-back"
            aria-label="Back to Prices"
            onClick={onBack}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          <div className="product-detail-stage-content">
            <ProgressiveProductImage
              imageUrl={resolvedImageUrl}
              altText={commodity.commodity_name}
              variant="detail"
              decorative={false}
              onSettled={setImageStatus}
            />
            <div className="product-detail-pedestal" aria-hidden="true" />
          </div>

          <div className="product-detail-floating-pill">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{classification !== 'Not provided' ? classification : 'Official SRP'}</span>
          </div>

          {imageStatus === 'loaded' && resolvedImageUrl && (
            <button
              ref={imageTriggerRef}
              type="button"
              className="product-detail-image-trigger"
              aria-label={`View full image of ${commodity.commodity_name}`}
              onClick={() => setIsLightboxOpen(true)}
            >
              <span className="product-detail-image-expand" aria-hidden="true">
                <Maximize2 size={16} />
              </span>
            </button>
          )}
        </div>

        <div className="product-detail-summary">
          <div className="product-detail-category">{subtitle}</div>
          <h1 id="product-detail-title">{title}</h1>
          <div className="product-detail-summary-metrics">
            <div className="product-detail-metric product-detail-price-block">
              <span>{priceLabel}</span>
              <strong className="product-detail-price">{'\u20B1'}{Number(commodity.baseline_price).toFixed(2)}</strong>
            </div>
            <div className="product-detail-metric product-detail-trend">
              <span>Trend</span>
              <TrendValue trend={trend} />
            </div>
            <div className="product-detail-metric">
              <span>Effective</span>
              <strong>{effectiveDate || 'Not provided'}</strong>
            </div>
          </div>
        </div>
      </section>

      {hasActivePriceFreezeCoverage && (
        <section className="product-detail-freeze">
          <button
            type="button"
            onClick={() => setIsFreezeOpen((open) => !open)}
            aria-expanded={isFreezeOpen}
            aria-controls="product-detail-freeze-content"
          >
            <span className="product-detail-freeze-label">
              <Info size={16} aria-hidden="true" />
              Price-freeze information
            </span>
            {isFreezeOpen ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
          {isFreezeOpen && (
            <div id="product-detail-freeze-content" className="product-detail-freeze-content">
              {commodity.price_freeze_treatment || 'A price-freeze treatment is marked for this item. Check the cited bulletin for the applicable terms.'}
            </div>
          )}
        </section>
      )}

      <section className="product-detail-information" aria-label="Product information">
        <div className="product-detail-tabs" role="tablist" aria-label="Product information sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[tab.id] = node; }}
              type="button"
              role="tab"
              id={`product-detail-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`product-detail-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className="product-detail-tab-panel"
          role="tabpanel"
          id={`product-detail-panel-${activeTab}`}
          aria-labelledby={`product-detail-tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'details' && (
            <dl className="product-detail-facts">
              <MetadataRow label="Category">{subtitle}</MetadataRow>
              <MetadataRow label="Official unit">{commodity.unit || commodity.package_size || 'Not provided'}</MetadataRow>
              <MetadataRow label="Classification">{classification}</MetadataRow>
              {monitoringLabel && <MetadataRow label="Monitoring status">{monitoringLabel}</MetadataRow>}
            </dl>
          )}

          {activeTab === 'history' && historyStatus === 'loading' && (
            <div className="product-detail-panel-state" role="status">Loading price history…</div>
          )}
          {activeTab === 'history' && historyStatus === 'error' && (
            <div className="product-detail-panel-state">
              <strong>Price history is unavailable.</strong>
              <span>Check your connection and try again.</span>
              <button type="button" onClick={() => void loadHistory()} aria-label="Retry price history">Retry</button>
            </div>
          )}
          {activeTab === 'history' && historyStatus === 'success' && history.length <= 1 && (
            <div className="product-detail-panel-state">No past SRP is available for comparison.</div>
          )}
          {activeTab === 'history' && historyStatus === 'success' && history.length > 1 && (
            <ol className="product-detail-history-list">
              {history.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{formatDate(entry.effective_date) || 'Date not provided'}</strong>
                    {entry.id === commodity.id && <span className="product-detail-current-pill">Current</span>}
                  </div>
                  <span>{'\u20B1'}{Number(entry.baseline_price).toFixed(2)}</span>
                </li>
              ))}
            </ol>
          )}

          {activeTab === 'source' && (
            <dl className="product-detail-facts">
              <MetadataRow label="Bulletin source">{commodity.source_reference || 'Not provided'}</MetadataRow>
              <MetadataRow label="Effective date">{effectiveDate || 'Not provided'}</MetadataRow>
              <MetadataRow label="Data status">{dataSource === 'live' ? 'Live data' : 'Saved copy'}</MetadataRow>
              <MetadataRow label={dataSource === 'live' ? 'Live data checked' : 'Saved data date'}>
                {fetchedDate || 'Not provided'}
              </MetadataRow>
            </dl>
          )}
        </div>
      </section>

      {resolvedImageUrl && (
        <ProductImageLightbox
          open={isLightboxOpen && imageStatus === 'loaded'}
          imageUrl={resolvedImageUrl}
          altText={commodity.commodity_name}
          triggerRef={imageTriggerRef}
          onDismiss={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default ProductDetail;
