# Customer PWA Professional Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the PRICE-Watch Customer PWA into a fully production-ready, professionally deployed application by redirecting the Home "Know your rights" card to the More view, expanding the Consumer Rights knowledge base with the 8 Consumer Rights (R.A. 7394) and Price Act (R.A. 7581) protections, providing a dedicated Terms & Conditions and Privacy Policy reader (`TermsModal`), and polishing UX for offline-first resilience and accessibility.

**Architecture:** 
- A dedicated, typed legal data module (`src/data/termsAndConditions.ts`) defines the 8 Basic Consumer Rights, 5 Consumer Responsibilities, Price Act rules, and official Terms of Service.
- An accessible reader modal (`src/components/TermsModal.tsx`) renders the Terms of Use and Privacy Notice with tabbed navigation, focus-trapping, and keyboard dismissals.
- `MoreView.tsx` supports deep-linking via `#consumer-rights`, auto-expanding and scrolling to the Consumer Rights section, while adding the Legal Policies section.
- `Home.tsx` converts the rights card from an inline accordion into an interactive CTA routing to `/more#consumer-rights`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Lucide React, CSS Variables, Workbox PWA.

---

### Task 1: Create Consumer Rights and Terms & Conditions Data Module

**Files:**
- Create: `customer-pwa/src/data/termsAndConditions.ts`
- Test: `customer-pwa/src/data/termsAndConditions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `customer-pwa/src/data/termsAndConditions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  CONSUMER_RIGHTS,
  CONSUMER_RESPONSIBILITIES,
  PRICE_ACT_REGULATIONS,
  TERMS_OF_USE_SECTIONS,
  TERMS_VERSION,
} from './termsAndConditions';

describe('termsAndConditions data module', () => {
  it('defines versioned terms of use', () => {
    expect(TERMS_VERSION).toBe('1.0');
    expect(TERMS_OF_USE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    expect(TERMS_OF_USE_SECTIONS.map((s) => s.heading)).toContain('Acceptable Evidence & Receipt Verification');
  });

  it('contains all 8 basic consumer rights under R.A. 7394', () => {
    expect(CONSUMER_RIGHTS).toHaveLength(8);
    const titles = CONSUMER_RIGHTS.map((r) => r.title);
    expect(titles).toContain('Right to Basic Needs');
    expect(titles).toContain('Right to Safety');
    expect(titles).toContain('Right to Information');
    expect(titles).toContain('Right to Choose');
    expect(titles).toContain('Right to Representation');
    expect(titles).toContain('Right to Redress');
    expect(titles).toContain('Right to Consumer Education');
    expect(titles).toContain('Right to a Healthy Environment');
  });

  it('contains the 5 consumer responsibilities', () => {
    expect(CONSUMER_RESPONSIBILITIES).toHaveLength(5);
    const titles = CONSUMER_RESPONSIBILITIES.map((r) => r.title);
    expect(titles).toContain('Critical Awareness');
    expect(titles).toContain('Action');
  });

  it('details R.A. 7581 and price enforcement rules', () => {
    expect(PRICE_ACT_REGULATIONS.length).toBeGreaterThanOrEqual(3);
    const headings = PRICE_ACT_REGULATIONS.map((p) => p.heading);
    expect(headings).toContain('Baseline SRP Protection');
    expect(headings).toContain('The 10% Normal Market Rule');
    expect(headings).toContain('Automatic Price Freeze in Calamity');
    expect(headings).toContain('Mandatory Price Tag Law');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/data/termsAndConditions.test.ts` (from `customer-pwa/`)
Expected: FAIL with module not found error.

- [ ] **Step 3: Implement `termsAndConditions.ts`**

Create `customer-pwa/src/data/termsAndConditions.ts`:
```typescript
export const TERMS_VERSION = '1.0';

export interface ConsumerRightItem {
  id: number;
  title: string;
  tagalogTitle: string;
  description: string;
  dtiProtection: string;
}

export interface ConsumerResponsibilityItem {
  id: number;
  title: string;
  description: string;
}

export interface RegulationItem {
  id: string;
  heading: string;
  lawReference: string;
  description: string;
}

export interface LegalSection {
  heading: string;
  body: string;
}

export const CONSUMER_RIGHTS: ReadonlyArray<ConsumerRightItem> = [
  {
    id: 1,
    title: 'Right to Basic Needs',
    tagalogTitle: 'Karapatan sa Pangunahing Pangangailangan',
    description: 'Guarantees the availability of essential goods and basic commodities at fair prices and quality standards.',
    dtiProtection: 'DTI sets Suggested Retail Prices (SRP) for canned fish, milk, coffee, bread, and instant noodles to prevent unreasonable price spikes.',
  },
  {
    id: 2,
    title: 'Right to Safety',
    tagalogTitle: 'Karapatan sa Kaligtasan',
    description: 'Protection against the marketing and sale of products and services that are hazardous to consumer health and life.',
    dtiProtection: 'Enforcement of Philippine National Standards (PNS), product certification marks (PS and ICC), and expiration date compliance.',
  },
  {
    id: 3,
    title: 'Right to Information',
    tagalogTitle: 'Karapatan sa Impormasyon',
    description: 'Protection against misleading, dishonest, or fraudulent advertising, labeling, and pricing practices.',
    dtiProtection: 'Enforcement of Republic Act No. 71 (Price Tag Law). All retail goods must bear clear price tags, and cashiers must charge that exact amount.',
  },
  {
    id: 4,
    title: 'Right to Choose',
    tagalogTitle: 'Karapatan sa Pagpili',
    description: 'The right to select products and services at competitive prices with an assurance of satisfactory quality.',
    dtiProtection: 'Prohibits anti-competitive practices, tied sales, and monopolies that restrict fair access to essential commodities.',
  },
  {
    id: 5,
    title: 'Right to Representation',
    tagalogTitle: 'Karapatan sa Paglahok',
    description: 'The right to voice consumer interests in the creation and execution of government economic and trade policies.',
    dtiProtection: 'Consumer participation in DTI public hearings, consultations, and the National Price Coordinating Council (NPCC).',
  },
  {
    id: 6,
    title: 'Right to Redress',
    tagalogTitle: 'Karapatan sa Pagwawasto',
    description: 'The right to be compensated for misrepresentation, substandard goods, or unsatisfactory services through refunds, replacement, or repair.',
    dtiProtection: 'DTI consumer complaint mediation, adjudication, and issuance of formal Show Cause Orders to non-compliant retailers.',
  },
  {
    id: 7,
    title: 'Right to Consumer Education',
    tagalogTitle: 'Karapatan sa Edukasyon',
    description: 'The right to acquire knowledge and skills required to make informed and confident consumer decisions throughout life.',
    dtiProtection: 'Public price monitoring advisories, consumer education campaigns, and digital price matrices via PRICE-Watch.',
  },
  {
    id: 8,
    title: 'Right to a Healthy Environment',
    tagalogTitle: 'Karapatan sa Malinis na Kapaligiran',
    description: 'The right to live and work in an environment that is neither threatening nor dangerous and promotes health and well-being.',
    dtiProtection: 'Support for sustainable packaging, proper waste handling, and phasing out toxic substances in retail distribution.',
  },
];

export const CONSUMER_RESPONSIBILITIES: ReadonlyArray<ConsumerResponsibilityItem> = [
  {
    id: 1,
    title: 'Critical Awareness',
    description: 'The responsibility to be more alert and questioning about the price, quality, and condition of goods and services we use.',
  },
  {
    id: 2,
    title: 'Action',
    description: 'The responsibility to assert ourselves and act to ensure that we get a fair deal. As long as we remain passive consumers, we will continue to be exploited.',
  },
  {
    id: 3,
    title: 'Social Concern',
    description: 'The responsibility to be aware of the impact of our consumption on other citizens, especially disadvantaged or vulnerable groups.',
  },
  {
    id: 4,
    title: 'Environmental Awareness',
    description: 'The responsibility to understand the environmental consequences of our consumption and recognize our duty to conserve resources.',
  },
  {
    id: 5,
    title: 'Solidarity',
    description: 'The responsibility to organize together as consumers to develop the strength and influence to promote and protect our common interests.',
  },
];

export const PRICE_ACT_REGULATIONS: ReadonlyArray<RegulationItem> = [
  {
    id: 'price-act-srp',
    heading: 'Baseline SRP Protection',
    lawReference: 'R.A. 7581 (Price Act) §10',
    description: 'DTI publishes official Suggested Retail Prices (SRP) for basic necessities and prime commodities. Retailers are expected to keep prices at or below these baselines.',
  },
  {
    id: 'price-act-10percent',
    heading: 'The 10% Normal Market Rule',
    lawReference: 'R.A. 7581 Implementing Rules & Regulations',
    description: 'In normal market conditions, any establishment selling more than 10% above the published SRP baseline is flagged as an anomaly, triggering an automatic DTI Letter of Inquiry (LOI) giving the vendor 48 hours to explain.',
  },
  {
    id: 'price-act-freeze',
    heading: 'Automatic Price Freeze in Calamity',
    lawReference: 'R.A. 7581 §6',
    description: 'When a State of Calamity or emergency is officially declared, prices of all basic necessities are automatically frozen at baseline SRP with 0% markup tolerance. Violators face immediate Show Cause Orders and administrative fines.',
  },
  {
    id: 'price-act-tag-law',
    heading: 'Mandatory Price Tag Law',
    lawReference: 'R.A. 71 & R.A. 7394 Art. 81',
    description: 'All articles offered for sale at retail must bear a clear price tag or label indicating the retail price. It is unlawful to charge any price higher than what is printed on the tag or cashier register.',
  },
];

export const TERMS_OF_USE_SECTIONS: ReadonlyArray<LegalSection> = [
  {
    heading: 'Purpose of Platform',
    body: 'PRICE-Watch is an official government-citizen price transparency portal developed in coordination with the Department of Trade and Industry (DTI) Antique Provincial Office. It allows the public to inspect official Suggested Retail Prices (SRP) and submit digital receipt evidence for regulatory review in San Jose de Buenavista, Antique.',
  },
  {
    heading: 'Acceptable Evidence & Receipt Verification',
    body: 'Users who submit price reports must provide genuine, unedited photographs of printed retail sales receipts or official shelf price tags. Submitting intentionally falsified, fabricated, or third-party receipts not originating from the specified establishment is strictly prohibited.',
  },
  {
    heading: 'Digital Chain of Custody & Evidence Vault',
    body: 'To protect the integrity of citizen submissions, the PRICE-Watch client computes a cryptographic SHA-256 checksum of every receipt photo prior to upload. Photos are held in a restricted DTI vault and accessed strictly by authorized DTI evaluators for verification and legal notice generation.',
  },
  {
    heading: 'Regulatory Scope & Advisory Status',
    body: 'Published SRP baselines serve as reference standards. Variations due to promotional discounts, bundled items, or logistical supply disruptions are evaluated through DTI’s formal inquiry process. Submitting a report initiates administrative review but does not constitute a judicial filing.',
  },
  {
    heading: 'Zero Personal Tracking & Privacy',
    body: 'PRICE-Watch does not require account registration, passwords, phone numbers, or credit card details for public price checks. Browsing price bulletins is completely anonymous. Receipt photos are processed in accordance with the Data Privacy Act of 2012 (R.A. 10173).',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/data/termsAndConditions.test.ts`
Expected: PASS with 4 tests passing.

---

### Task 2: Create `TermsModal` Reader Component

**Files:**
- Create: `customer-pwa/src/components/TermsModal.tsx`
- Test: `customer-pwa/src/components/TermsModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `customer-pwa/src/components/TermsModal.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TermsModal } from './TermsModal';

describe('TermsModal component', () => {
  it('renders with Terms of Use tab selected by default', () => {
    render(<TermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />);

    expect(screen.getByRole('dialog', { name: /Terms of Service & Policies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terms of Use/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Purpose of Platform')).toBeInTheDocument();
    expect(screen.getByText(/PRICE-Watch is an official government-citizen price transparency portal/i)).toBeInTheDocument();
  });

  it('switches to Privacy Notice tab when clicked', async () => {
    const user = userEvent.setup();
    render(<TermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />);

    const privacyTab = screen.getByRole('button', { name: /Privacy Notice/i });
    await user.click(privacyTab);

    expect(privacyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/DTI Consumer Evidence Vault Privacy Notice/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={handleClose} initialTab="terms" />);

    const closeBtn = screen.getByRole('button', { name: /Close policies modal/i });
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses modal on Escape key press', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={handleClose} initialTab="terms" />);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/components/TermsModal.test.tsx`
Expected: FAIL with module not found error.

- [ ] **Step 3: Implement `TermsModal.tsx`**

Create `customer-pwa/src/components/TermsModal.tsx`:
```tsx
import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, ShieldCheck, Scale } from 'lucide-react';
import { TERMS_OF_USE_SECTIONS, TERMS_VERSION } from '../data/termsAndConditions';
import { PRIVACY_NOTICE_SECTIONS, PRIVACY_NOTICE_TITLE } from '../app/privacyNotice';

export interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'privacy';
}

export const TermsModal: React.FC<TermsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms',
}) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

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
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="more-dialog-scrim terms-modal-scrim"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="terms-modal-container"
        role="dialog"
        aria-modal="true"
        aria-label="Terms of Service & Policies"
      >
        <div className="terms-modal-header">
          <div className="terms-modal-header-text">
            <div className="terms-modal-tag">
              <Scale size={13} aria-hidden="true" />
              <span>Official DTI Antique Regulations</span>
            </div>
            <h2 className="terms-modal-title">Terms of Service & Policies</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="terms-modal-close-btn"
            onClick={onClose}
            aria-label="Close policies modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="terms-modal-tabs" role="tablist" aria-label="Legal document tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'terms'}
            aria-controls="terms-tab-panel"
            id="terms-tab"
            className={`terms-modal-tab ${activeTab === 'terms' ? 'terms-modal-tab--active' : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            <FileText size={16} aria-hidden="true" />
            <span>Terms of Use (v{TERMS_VERSION})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'privacy'}
            aria-controls="privacy-tab-panel"
            id="privacy-tab"
            className={`terms-modal-tab ${activeTab === 'privacy' ? 'terms-modal-tab--active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Privacy Notice</span>
          </button>
        </div>

        <div className="terms-modal-body">
          {activeTab === 'terms' && (
            <div
              id="terms-tab-panel"
              role="tabpanel"
              aria-labelledby="terms-tab"
              className="terms-modal-content-panel"
            >
              <div className="terms-intro-callout">
                <strong>Public Notice:</strong> By accessing PRICE-Watch, you agree to comply with Republic Act No. 7581 (Price Act) and data integrity protocols enforced by DTI Antique Provincial Office.
              </div>
              <div className="terms-sections-list">
                {TERMS_OF_USE_SECTIONS.map((section, idx) => (
                  <article key={section.heading} className="terms-section-card">
                    <h3 className="terms-section-title">
                      <span className="terms-section-num">{idx + 1}</span>
                      {section.heading}
                    </h3>
                    <p className="terms-section-body">{section.body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div
              id="privacy-tab-panel"
              role="tabpanel"
              aria-labelledby="privacy-tab"
              className="terms-modal-content-panel"
            >
              <div className="terms-intro-callout terms-intro-callout--blue">
                <strong>Data Protection:</strong> In compliance with the Data Privacy Act of 2012 (R.A. 10173), receipt images are cryptographically vaulted and never monetized or shared with unauthorized commercial entities.
              </div>
              <h3 className="terms-subhead">{PRIVACY_NOTICE_TITLE}</h3>
              <div className="terms-sections-list">
                {PRIVACY_NOTICE_SECTIONS.map((section, idx) => (
                  <article key={section.heading} className="terms-section-card">
                    <h4 className="terms-section-title">
                      <span className="terms-section-num">{idx + 1}</span>
                      {section.heading}
                    </h4>
                    <p className="terms-section-body">{section.body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="terms-modal-footer">
          <span className="terms-modal-footer-note">San Jose de Buenavista, Antique · Department of Trade and Industry</span>
          <button type="button" className="btn-primary terms-modal-done-btn" onClick={onClose}>
            Understood & Close
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/components/TermsModal.test.tsx`
Expected: PASS with 4 tests passing.

---

### Task 3: Enhance `MoreView` with Consumer Rights Guide, Deep-Linking, and Terms UX

**Files:**
- Modify: `customer-pwa/src/components/MoreView.tsx`
- Modify: `customer-pwa/src/components/MoreView.test.tsx`

- [ ] **Step 1: Write the failing test**

Update `customer-pwa/src/components/MoreView.test.tsx` to add test cases for:
1. Deep-linking to `#consumer-rights` (auto-expanding the rights section).
2. Rendering the 8 Basic Consumer Rights with their titles.
3. Rendering the Price Act regulation rules.
4. Opening the TermsModal when "Terms of Use" or "Privacy Policy" rows are clicked.

```typescript
  it('renders the 8 Consumer Rights under R.A. 7394 inside the rights section', async () => {
    const user = userEvent.setup();
    render(<MoreView />);

    const rightsTrigger = screen.getByRole('button', { name: /8 Basic Consumer Rights \(R\.A\. 7394\)/i });
    expect(rightsTrigger).toBeInTheDocument();
    await user.click(rightsTrigger);

    expect(screen.getByText('Right to Basic Needs')).toBeInTheDocument();
    expect(screen.getByText('Karapatan sa Pangunahing Pangangailangan')).toBeInTheDocument();
    expect(screen.getByText('Right to Information')).toBeInTheDocument();
    expect(screen.getByText('Right to Redress')).toBeInTheDocument();
  });

  it('renders the Legal & Regulatory Policies card and opens TermsModal on click', async () => {
    const user = userEvent.setup();
    render(<MoreView />);

    expect(screen.getByRole('heading', { name: 'Legal & Regulatory Policies', level: 2 })).toBeInTheDocument();
    const termsRow = screen.getByRole('button', { name: /View Terms of Use/i });
    await user.click(termsRow);

    expect(screen.getByRole('dialog', { name: /Terms of Service & Policies/i })).toBeInTheDocument();
    expect(screen.getByText('Purpose of Platform')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/components/MoreView.test.tsx`
Expected: FAIL due to missing rights section titles and legal policies group.

- [ ] **Step 3: Modify `MoreView.tsx`**

Integrate:
- `termsAndConditions.ts` (`CONSUMER_RIGHTS`, `CONSUMER_RESPONSIBILITIES`, `PRICE_ACT_REGULATIONS`, `TERMS_VERSION`).
- `TermsModal` integration with state `termsModalOpen` and `termsModalTab`.
- Hash listener for `#consumer-rights`:
  ```typescript
  const rightsSectionRef = useRef<HTMLElement>(null);
  const [highlightRights, setHighlightRights] = useState(false);

  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#consumer-rights') {
        setActiveAccordion('consumer-rights-8');
        rightsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlightRights(true);
        setTimeout(() => setHighlightRights(false), 2400);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);
  ```
- Add Accordion 1: **8 Basic Consumer Rights (R.A. 7394)**.
- Add Accordion 2: **Republic Act No. 7581 & Price Regulations** (incorporating SRP, 10% rule, Calamity Freeze, Price Tag Law).
- Add Accordion 3: **Tamper-Proof Evidence Vault**.
- Add Section: **Legal & Regulatory Policies** with interactive rows for Terms of Use, Privacy Notice, and DTI Antique Jurisdiction.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/components/MoreView.test.tsx`
Expected: PASS.

---

### Task 4: Redirect Home "Know your rights" to More View

**Files:**
- Modify: `customer-pwa/src/components/Home.tsx`
- Modify: `customer-pwa/src/components/Home.css`
- Modify: `customer-pwa/src/components/Home.test.tsx`

- [x] **Step 1: Write the failing test**

In `customer-pwa/src/components/Home.test.tsx`, add test:
```typescript
  it('redirects to the More section and sets consumer-rights anchor when rights card is clicked', async () => {
    const setActiveTab = vi.fn();
    const user = userEvent.setup();
    render(<Home setActiveTab={setActiveTab} stateOfCalamity={false} />);

    const rightsCard = screen.getByRole('button', { name: /Know your rights as a customer/i });
    await user.click(rightsCard);

    expect(setActiveTab).toHaveBeenCalledWith('more');
    expect(window.location.hash).toBe('#consumer-rights');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test src/components/Home.test.tsx`
Expected: FAIL because rights card currently toggles local state instead of calling `setActiveTab('more')`.

- [x] **Step 3: Modify `Home.tsx`**

Replace lines 226-254 in `customer-pwa/src/components/Home.tsx`:
```tsx
          <div
            role="button"
            tabIndex={0}
            className="home-rights-card home-rights-card-interactive"
            onClick={() => {
              setActiveTab('more');
              if (typeof window !== 'undefined') {
                window.location.hash = 'consumer-rights';
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab('more');
                if (typeof window !== 'undefined') {
                  window.location.hash = 'consumer-rights';
                }
              }
            }}
            aria-label="Know your rights as a customer. Learn about fair pricing, R.A. 7394, and reporting violations in More section."
          >
            <div className="home-rights-art-frame">
              <img
                className="home-rights-art"
                src="/home/3.webp"
                alt="Consumer rights protection illustration"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="home-rights-copy">
              <h2>Know your rights as a customer</h2>
              <p>Explore the 8 consumer rights, Price Act protections, and DTI reporting procedures.</p>
              <div className="home-rights-badge">
                <span>View Consumer Guide</span>
              </div>
            </div>
            <div className="home-rights-action" aria-hidden="true">
              <ArrowRight size={20} />
            </div>
          </div>
```

- [x] **Step 4: Update `Home.css`**

Add interactive cursor, hover effect, badge style, and focus indicator for `.home-rights-card-interactive` in `Home.css`.

- [x] **Step 5: Run test to verify it passes**

Run: `npm test src/components/Home.test.tsx`
Expected: PASS.

---

### Task 5: Integrate Terms & Conditions Link in `FormalReport`

**Files:**
- Modify: `customer-pwa/src/components/FormalReport.tsx`

- [ ] **Step 1: Check existing privacy notice modal in `FormalReport.tsx`**

In `FormalReport.tsx`, update the privacy modal so users can view the full Terms of Use alongside the privacy notice, ensuring a consistent legal posture across report submission and browsing.

- [ ] **Step 2: Update `FormalReport.tsx` to add quick link to Terms of Use**

Add an action link inside `showPrivacyModal` that allows consumers to open the Terms or review the comprehensive regulatory framework.

- [ ] **Step 3: Run existing tests for FormalReport**

Run: `npm test src/components/FormalReport.test.tsx`
Expected: PASS.

---

### Task 6: Styling in `index.css` for Legal Policies and Terms Reader

**Files:**
- Modify: `customer-pwa/src/index.css`

- [ ] **Step 1: Add CSS rules for TermsModal and Consumer Rights cards**

Append styles to `customer-pwa/src/index.css`:
- `.terms-modal-scrim`, `.terms-modal-container`, `.terms-modal-header`, `.terms-modal-tabs`, `.terms-modal-body`.
- `.terms-section-card`, `.terms-section-num`, `.terms-intro-callout`.
- `.consumer-right-card`, `.consumer-right-tagalog`, `.consumer-right-dti-badge`.
- `.rights-highlight-pulse` animation when navigated from Home.

- [ ] **Step 2: Verify responsive behavior**

Ensure styles display cleanly on both 360px mobile viewports and desktop widths without overflow.

---

### Task 7: Full Test Suite & Build Verification

- [ ] **Step 1: Run all unit tests**

Run: `npm test` from `customer-pwa/`
Expected: All 55+ test files pass.

- [ ] **Step 2: Run production build check**

Run: `npm run build` from `customer-pwa/`
Expected: Successful build with zero TypeScript or asset errors.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-22-customer-pwa-professional-deployment.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
