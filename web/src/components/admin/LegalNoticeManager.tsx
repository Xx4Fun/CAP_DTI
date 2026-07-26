import React, { useState } from 'react'
import { adminApi } from '../../services/adminApi'

export const LegalNoticeManager: React.FC = () => {
  const [draft, setDraft] = useState('')
  const [blocked, setBlocked] = useState('')

  return (
    <div className="admin-stack" style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="policy-warning" style={{ borderLeft: '4px solid #dc2626', background: '#fef2f2', borderRadius: '0 8px 8px 0', padding: '1rem' }}>
        <strong style={{ color: '#dc2626' }}>LEGAL_POLICY_UNAVAILABLE</strong>
        <p style={{ margin: '0.25rem 0 0', color: '#7f1d1d' }}>
          Official LOI and SCO generation is disabled until DTI-approved rules are configured.
        </p>
      </div>

      <div className="admin-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => void adminApi.legalDraft().then(setDraft)}
          style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1px solid #1d4ed8', background: '#ffffff', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
        >
          Preview watermarked draft
        </button>
        <button
          onClick={() => void adminApi.dispatchLegal().catch((error) => setBlocked(error.response?.data?.status || 'LEGAL_POLICY_UNAVAILABLE'))}
          style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
        >
          Attempt official dispatch
        </button>
      </div>

      {blocked && (
        <p role="alert" style={{ margin: 0, color: '#dc2626', fontWeight: 600 }}>
          {blocked}. No notice or deadline was created.
        </p>
      )}

      {draft && (
        <iframe className="draft-frame" title="Watermarked legal draft preview" srcDoc={draft} style={{ width: '100%', minHeight: '26rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff' }} />
      )}
    </div>
  )
}
