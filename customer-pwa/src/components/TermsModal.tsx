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
