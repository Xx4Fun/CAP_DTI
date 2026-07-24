import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, FilePlus2, ScanLine } from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';
import type { AppRoute } from '../app/routing';
import { writeHandoff } from '../app/handoffs';
import { fallbackCommodities } from '../data/srpFallback';
import { PriceStrip } from './ui/PriceStrip';
import { StatusBanner } from './ui/StatusBanner';

type ProductDetailProps = {
  commodityId: number;
  onNavigate: (route: AppRoute) => void;
};

export function ProductDetail({ commodityId, onNavigate }: ProductDetailProps) {
  const bundled = fallbackCommodities.find((item) => item.id === commodityId) ?? null;
  const [commodity, setCommodity] = useState<Commodity | null>(bundled);
  const [source, setSource] = useState<'live' | 'bundled' | 'missing'>(bundled ? 'bundled' : 'missing');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get(`/public/commodities/${commodityId}`)
      .then((response) => {
        if (!active) return;
        if (response.data?.success && response.data.data) {
          setCommodity(response.data.data);
          setSource('live');
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [commodityId]);

  if (!commodity) {
    return (
      <section className="empty-state">
        <h1>Price record not found</h1>
        <p>The requested product is not available in the current or bundled price list.</p>
        <button className="button button--primary" type="button" onClick={() => onNavigate({ name: 'prices' })}>Return to prices</button>
      </section>
    );
  }

  const start = (destination: 'scan' | 'new-report') => {
    writeHandoff({ kind: destination === 'scan' ? 'price-to-scan' : 'price-to-report', commodityId: commodity.id });
    onNavigate({ name: destination });
  };

  return (
    <article className="product-detail">
      <button className="back-link" type="button" onClick={() => onNavigate({ name: 'prices' })}><ArrowLeft aria-hidden="true" /> Back to prices</button>
      <header className="page-header">
        <p className="page-kicker">{commodity.category || 'DTI monitored product'}</p>
        <h1>{commodity.commodity_name}</h1>
        <p className="page-intro">{commodity.unit || commodity.package_size || 'See bulletin for package specification'}</p>
      </header>

      {source === 'bundled' && <StatusBanner variant="warning" title="Bundled reference record">Live product details could not be confirmed. Effective date: {commodity.effective_date || 'date unavailable'}.</StatusBanner>}

      <PriceStrip
        label="DTI reference price"
        value={`₱${commodity.baseline_price.toFixed(2)}`}
        unit={commodity.unit}
        note={`Effective ${new Date(commodity.effective_date).toLocaleDateString()} · ${source === 'live' ? 'Live DTI data' : 'Bundled DTI list'}`}
      />

      <dl className="detail-grid">
        <div><dt>Classification</dt><dd>{commodity.regulatory_classification === 'BASIC_NECESSITY' ? 'Basic necessity' : 'Prime commodity'}</dd></div>
        <div><dt>Geographic scope</dt><dd>Nationwide, subject to bulletin terms</dd></div>
        <div><dt>Price-freeze applicability</dt><dd>{commodity.price_freeze_applicable ? 'May apply during a declared calamity' : 'See current bulletin'}</dd></div>
        <div><dt>Record status</dt><dd>{commodity.is_active ? 'Active reference' : 'Inactive record'}</dd></div>
      </dl>

      <section className="disclosure">
        <button type="button" aria-expanded={open} aria-controls="price-freeze-info" onClick={() => setOpen((value) => !value)}>
          <span>About price freezes and reference prices</span><ChevronDown aria-hidden="true" />
        </button>
        {open && <div id="price-freeze-info" className="prose"><p>A reference price helps consumers compare like-for-like products. During a formally declared state of calamity, applicable basic necessities may be subject to a price freeze under the Price Act and current government issuances.</p><p>A shelf comparison is informational. DTI personnel determine whether a violation occurred after reviewing the applicable facts and evidence.</p></div>}
      </section>

      <div className="product-actions">
        <button className="button button--primary" type="button" onClick={() => start('scan')}><ScanLine aria-hidden="true" /> Scan this product</button>
        <button className="button button--secondary" type="button" onClick={() => start('new-report')}><FilePlus2 aria-hidden="true" /> Report with receipt</button>
      </div>
    </article>
  );
}
