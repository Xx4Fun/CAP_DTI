import React, { useState } from 'react'
import { adminApi } from '../../services/adminApi'
import {
  AlertCircle,
  Scale,
  ShieldAlert,
} from 'lucide-react'

export const LegalNoticeManager: React.FC = () => {
  const [draft, setDraft] = useState('')
  const [noticeType, setNoticeType] = useState<'LOI' | 'SCO'>('LOI')
  const [storeName, setStoreName] = useState('')
  const [secNumber, setSecNumber] = useState('')
  const [address, setAddress] = useState('')
  const [commodityName, setCommodityName] = useState('')
  const [srpBaseline, setSrpBaseline] = useState(0)
  const [recordedPrice, setRecordedPrice] = useState(0)

  const priceVariancePct = srpBaseline > 0
    ? (((recordedPrice - srpBaseline) / srpBaseline) * 100).toFixed(1)
    : null

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Top Warning Banner for Policy Controls */}
      <div className="policy-warning" style={{ borderLeft: '4px solid #dc2626', background: '#fef2f2', borderRadius: '0 8px 8px 0', padding: '1rem' }}>
        <strong style={{ color: '#dc2626' }}>LEGAL_POLICY_UNAVAILABLE</strong>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d' }}>
          Official LOI and SCO generation is disabled until DTI-approved rules are configured.
        </p>
      </div>

      {/* Interactive Controls & Notice Configuration Toolbar */}
      <section className="admin-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Scale size={20} style={{ color: '#1d4ed8' }} /> Legal Notice Engine & Document Previewer
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
              Configure and preview watermarked Letters of Inquiry (LOI) and Show Cause Orders (SCO) under R.A. 7581.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.35rem 0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Notice Template:</span>
            <button
              type="button"
              onClick={() => setNoticeType('LOI')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: noticeType === 'LOI' ? '#2563eb' : '#cbd5e1',
                background: noticeType === 'LOI' ? '#eff6ff' : '#ffffff',
                color: noticeType === 'LOI' ? '#1d4ed8' : '#64748b',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              LOI (Letter of Inquiry)
            </button>
            <button
              type="button"
              onClick={() => setNoticeType('SCO')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: noticeType === 'SCO' ? '#dc2626' : '#cbd5e1',
                background: noticeType === 'SCO' ? '#fef2f2' : '#ffffff',
                color: noticeType === 'SCO' ? '#dc2626' : '#64748b',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              SCO (Show Cause Order)
            </button>
          </div>
        </div>

        {/* Notice Parameter Fields Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <label htmlFor="notice-store" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
              Target Establishment
            </label>
            <input
              id="notice-store"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="notice-sec" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
              DTI / SEC Registration
            </label>
            <input
              id="notice-sec"
              type="text"
              value={secNumber}
              onChange={(e) => setSecNumber(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="notice-address" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
              Establishment Address
            </label>
            <input
              id="notice-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="notice-commodity" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
              Flagged Commodity
            </label>
            <input
              id="notice-commodity"
              type="text"
              value={commodityName}
              onChange={(e) => setCommodityName(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label htmlFor="notice-prices" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
              SRP Baseline vs Shelf Price (₱)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="notice-prices"
                type="number"
                step="0.50"
                value={srpBaseline}
                onChange={(e) => setSrpBaseline(Number(e.target.value))}
                title="SRP Baseline Price"
                style={{ width: '50%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'monospace' }}
              />
              <input
                type="number"
                step="0.50"
                value={recordedPrice}
                onChange={(e) => setRecordedPrice(Number(e.target.value))}
                title="Recorded Shelf Price"
                style={{ width: '50%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'monospace', color: '#dc2626', fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Warning Alert Bar */}
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: noticeType === 'SCO' ? '#fff1f2' : '#f0f9ff', border: '1px solid', borderColor: noticeType === 'SCO' ? '#fecdd3' : '#bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {noticeType === 'SCO' ? <ShieldAlert size={18} style={{ color: '#e11d48' }} /> : <AlertCircle size={18} style={{ color: '#0284c7' }} />}
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: noticeType === 'SCO' ? '#9f1239' : '#0369a1' }}>
              {noticeType === 'SCO'
                ? `Emergency draft context${priceVariancePct ? `: +${priceVariancePct}% entered price variance` : ': enter a verified baseline and observed price'}`
                : `Draft inquiry context${priceVariancePct ? `: +${priceVariancePct}% entered price variance` : ': enter a verified baseline and observed price'}`}
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '0.25rem 0.65rem', borderRadius: '20px', border: '1px solid #cbd5e1' }}>
            <strong style={{ fontSize: '0.78rem', color: '#1e3a8a' }}>
              Draft only — no rebuttal period starts from this preview.
            </strong>
          </div>
        </div>
      </section>

      {/* Official DOM Draft Document Previewer (DTI Letterhead Format) */}
      <section className="admin-card" style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '12px', padding: '2rem', boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)', position: 'relative', overflow: 'hidden' }}>
        {/* Watermark Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            opacity: 0.04,
            transform: 'rotate(-25deg)',
            fontSize: '4.5rem',
            fontWeight: 900,
            color: '#0f172a',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            userSelect: 'none',
          }}
        >
          DTI ANTIQUE UNOFFICIAL DRAFT
        </div>

        {/* Letterhead Header */}
        <header style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.05em', boxShadow: '0 4px 10px rgba(30, 58, 138, 0.3)' }}>
              DTI
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b' }}>
                Republic of the Philippines
              </span>
              <h2 style={{ margin: '0.1rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Department of Trade and Industry
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                Antique Provincial Office • 2nd Floor, Executive Bldg, San Jose de Buenavista, Antique 5700
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Document Control No.</span>
            <strong style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: '#1d4ed8' }}>
              {noticeType}-2026-0801-042
            </strong>
            <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '0.2rem' }}>Date: August 1, 2026</small>
          </div>
        </header>

        {/* Notice Header Title */}
        <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: noticeType === 'SCO' ? '#991b1b' : '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {noticeType === 'LOI' ? 'DRAFT NOTICE OF INQUIRY (LOI)' : 'DRAFT SHOW CAUSE ORDER (SCO)'}
          </h3>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            Under R.A. 7581 (Price Act) & DTI Administrative Regulations
          </span>
        </div>

        {/* Respondent Summary Box */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Respondent Establishment</span>
            <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{storeName}</strong>
            <small style={{ display: 'block', color: '#475569', fontSize: '0.8rem' }}>Registration: {secNumber}</small>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Establishment Address</span>
            <span style={{ fontSize: '0.88rem', color: '#0f172a' }}>{address}</span>
          </div>
        </div>

        {/* Legal Body Paragraphs */}
        <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.6, display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          {noticeType === 'LOI' ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>WHEREAS</strong>, pursuant to Section 6 of Republic Act No. 7581 (The Price Act of the Philippines) and DTI Department Administrative Order No. 20-07, the Department of Trade and Industry Antique Provincial Office conducts regular temporal monitoring of prime commodities across establishments in San Jose de Buenavista;
              </p>
              <p style={{ margin: 0 }}>
                <strong>DRAFT ONLY:</strong> Enter verified inspection evidence before using this text. The current draft fields contain a price of <strong>₱{recordedPrice.toFixed(2)}</strong> for <strong>{commodityName || 'an unspecified commodity'}</strong>{priceVariancePct ? <>, representing an entered variance of <strong>+{priceVariancePct}%</strong> above an entered SRP baseline of <strong>₱{srpBaseline.toFixed(2)}</strong></> : <>. No variance is calculated until a non-zero verified baseline is supplied</>}.
              </p>
              <p style={{ margin: 0 }}>
                <strong>YOU ARE HEREBY DIRECTED</strong> to submit a formal written explanation and supporting invoices to the DTI Antique Provincial Office within <strong>forty-eight (48) hours</strong> from receipt of this notice, stating reasons why administrative proceedings should not be instituted against your establishment.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, color: '#991b1b', fontWeight: 700 }}>
                PURSUANT TO REPUBLIC ACT NO. 7581 AND EMERGENCY REGULATORY CONTROLS, YOU ARE HEREBY ORDERED TO SHOW CAUSE WITHIN FORTY-EIGHT (48) HOURS WHY ADMINISTRATIVE PENALTIES, SEIZURE OF NON-COMPLIANT COMMODITIES, OR BUSINESS SUSPENSION SHOULD NOT BE EXECUTED.
              </p>
              <p style={{ margin: 0 }}>
                This draft contains user-entered values only. Verify the regulatory inspection, commodity, observed price, and applicable price freeze or APC source before any official action. Current entered values: <strong>{commodityName || 'commodity not supplied'}</strong>, <strong>₱{recordedPrice.toFixed(2)}</strong>{priceVariancePct ? <> against <strong>₱{srpBaseline.toFixed(2)}</strong> (+{priceVariancePct}% entered variance)</> : <> with no valid baseline for a variance calculation</>}.
              </p>
              <p style={{ margin: 0 }}>
                Failure to submit verified evidentiary justification within the prescribed 48-hour window shall constitute a waiver of your right to be heard, and immediate legal escalation to the DTI Adjudication Executive Board will proceed without further delay.
              </p>
            </>
          )}
        </div>

        {/* Regulatory Signature Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Issued By Authority Of</span>
            <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a', marginTop: '0.2rem' }}>DTI Antique Regulatory Evaluation Bureau</strong>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Provincial Monitoring & Enforcement Division</span>
          </div>

          <div style={{ border: '2px solid #1d4ed8', borderRadius: '8px', padding: '0.5rem 1rem', background: '#eff6ff', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              UNOFFICIAL WATERMARKED DRAFT
            </span>
            <small style={{ fontSize: '0.72rem', color: '#3b82f6', fontFamily: 'monospace' }}>Not dispatched • Not legally effective</small>
          </div>
        </div>
      </section>

      {/* Action Buttons Toolbar & Preview Trigger */}
      <div className="admin-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void adminApi.legalDraft().then(setDraft)}
          style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1px solid #1d4ed8', background: '#ffffff', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
        >
          Preview watermarked draft
        </button>
      </div>

      <p role="status" style={{ margin: 0, color: '#7f1d1d', fontWeight: 600 }}>
        Draft preview only. No notice, deadline, notification, or vendor state change will be created.
      </p>

      {draft && (
        <iframe sandbox="" className="draft-frame" title="Watermarked legal draft preview" srcDoc={draft} style={{ width: '100%', minHeight: '26rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }} />
      )}
    </div>
  )
}
