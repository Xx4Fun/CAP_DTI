import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { TERMS_OF_USE_SECTIONS } from '../data/termsAndConditions';
import { PRIVACY_NOTICE_SECTIONS } from '../app/privacyNotice';

interface LegalDocDetailProps {
  docType: 'terms' | 'privacy';
  onBack: () => void;
}

export const LegalDocDetail: React.FC<LegalDocDetailProps> = ({
  docType,
  onBack,
}) => {
  const isTerms = docType === 'terms';
  const title = isTerms ? 'Terms of Use' : 'Privacy Notice';

  return (
    <div className="shelf-compare-page" role="region" aria-label={title}>
      {/* TOP HEADER WITH VERTICALLY ALIGNED BACK BUTTON & TITLE */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <button
          type="button"
          className="shelf-compare-back-btn"
          style={{ margin: 0, flexShrink: 0 }}
          onClick={onBack}
          aria-label="Back to More"
        >
          <ArrowLeft size={20} />
        </button>
        <h1
          style={{
            fontSize: '1.28rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            lineHeight: 1.2,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          {title}
        </h1>
      </div>

      {/* STRAIGHT-UP NUMBERED SECTIONS LIST */}
      <div
        className="legal-doc-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {(isTerms ? TERMS_OF_USE_SECTIONS : PRIVACY_NOTICE_SECTIONS).map((section, idx) => (
          <article key={section.heading}>
            <h2
              style={{
                margin: '0 0 6px 0',
                fontSize: '0.98rem',
                fontWeight: 700,
                color: 'var(--text-main, #0f172a)',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              {idx + 1}. {section.heading}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.88rem',
                color: '#475569',
                lineHeight: 1.6,
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              {section.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
};

export default LegalDocDetail;
