import { useState, type FormEvent } from 'react';
import { ArrowRight, ClipboardCheck, FilePlus2, ScanLine, Search } from 'lucide-react';
import type { AppRoute } from '../app/routing';
import type { RegulatoryStatus } from '../app/status';
import { PriceStrip } from './ui/PriceStrip';
import { StatusBanner } from './ui/StatusBanner';

type HomeProps = {
  onNavigate: (route: AppRoute) => void;
  regulatoryStatus: RegulatoryStatus;
};

const popularSearches = ['Canned sardines', 'Evaporated milk', 'Coffee', 'Detergent'];

export function Home({ onNavigate, regulatoryStatus }: HomeProps) {
  const [query, setQuery] = useState('');

  const search = (term: string) => {
    sessionStorage.setItem('srp_search_term', term);
    onNavigate({ name: 'prices' });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) search(query.trim());
  };

  const confirmed = regulatoryStatus.kind === 'available';
  return (
    <div className="home-layout">
      <section className="home-main" aria-labelledby="home-title">
        <p className="page-kicker">DTI reference price service</p>
        <h1 id="home-title">What price do you want to check?</h1>
        <p className="page-intro">Find an official reference price, compare a shelf tag, or report a checkout receipt for evaluation.</p>

        <form className="hero-search" role="search" onSubmit={submitSearch}>
          <label htmlFor="home-search">Search product, brand, or package size</label>
          <div>
            <Search aria-hidden="true" />
            <input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. sardines 155g" />
            <button type="submit">Check price <ArrowRight aria-hidden="true" /></button>
          </div>
        </form>

        <div className="home-primary-actions">
          <button className="action-card action-card--blue" type="button" onClick={() => onNavigate({ name: 'scan' })}>
            <ScanLine aria-hidden="true" />
            <span><strong>Scan a shelf tag</strong><small>Compare the displayed price with a DTI reference.</small></span>
            <ArrowRight aria-hidden="true" />
          </button>
          <button className="action-card action-card--yellow" type="button" onClick={() => onNavigate({ name: 'new-report' })}>
            <FilePlus2 aria-hidden="true" />
            <span><strong>Report a receipt</strong><small>Submit live receipt evidence for human evaluation.</small></span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>

        <button className="track-link-card" type="button" onClick={() => onNavigate({ name: 'track-report' })}>
          <ClipboardCheck aria-hidden="true" />
          <span><strong>Track an existing report</strong><small>Use your reference number and secret token.</small></span>
          <ArrowRight aria-hidden="true" />
        </button>
      </section>

      <aside className="home-aside" aria-label="Bulletin and popular products">
        {confirmed ? (
          <PriceStrip
            label={regulatoryStatus.config.state_of_calamity ? 'Price freeze bulletin' : 'Current DTI bulletin'}
            value={regulatoryStatus.config.state_of_calamity ? 'ACTIVE' : 'AVAILABLE'}
            note={`Source updated ${new Date(regulatoryStatus.config.last_updated_at).toLocaleDateString()}`}
          />
        ) : regulatoryStatus.kind === 'loading' ? (
          <StatusBanner title="Checking the current bulletin">This status will update when DTI configuration is available.</StatusBanner>
        ) : (
          <StatusBanner variant="warning" title="Regulatory status unavailable">We cannot confirm normal monitoring or a price freeze right now.</StatusBanner>
        )}

        <section className="popular-panel" aria-labelledby="popular-title">
          <div className="section-heading">
            <div><p className="page-kicker">Quick lookup</p><h2 id="popular-title">Popular products</h2></div>
          </div>
          <div className="popular-list">
            {popularSearches.map((term) => (
              <button key={term} type="button" onClick={() => search(term)}>
                <span>{term}</span><ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
