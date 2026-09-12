import React from 'react'
import type { ReceiptEvidenceAssetRecord, ReceiptExtractionAmountLine, ReceiptExtractionResult } from '../../types/admin'

const FIELD_LABELS: Record<string, string> = { raw_description: 'name', quantity: 'qty', unit_price: 'unit price', line_total: 'line total' }

const CHECK_LABELS: Record<string, string> = {
  line_arithmetic: 'Qty × unit price',
  items_vs_subtotal: 'Items vs subtotal',
  expected_vs_total: 'Expected vs total',
}

const ADJUSTMENT_LABELS: Record<string, string> = { vat_exemption: 'VAT exemption', rounding: 'Rounding', service_charge: 'Service charge', other: 'Adjustment' }

type Tone = 'ok' | 'bad' | 'warn' | 'muted' | 'info'

const TONES: Record<Tone, React.CSSProperties> = {
  ok: { background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' },
  bad: { background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' },
  warn: { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' },
  muted: { background: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' },
  info: { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' },
}

const statusTone = (status: string | undefined): Tone => (status === 'matched' ? 'ok' : status === 'mismatch' ? 'bad' : 'muted')

const Badge: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'warn', children }) => (
  <span style={{ ...TONES[tone], display: 'inline-block', border: '1px solid', borderRadius: '4px', padding: '0.05rem 0.35rem', fontSize: '0.68rem', fontWeight: 700, marginRight: '0.25rem', whiteSpace: 'nowrap' }}>
    {children}
  </span>
)

const peso = (value: unknown): string | null => {
  const amount = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(amount) ? `₱${amount.toFixed(2)}` : null
}

const cell: React.CSSProperties = { padding: '0.3rem 0.4rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', textAlign: 'left' }

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
    <span style={{ color: '#64748b' }}>{label}</span>
    <strong style={{ color: '#0f172a', textAlign: 'right' }}>{children}</strong>
  </div>
)

const AmountRow: React.FC<{ label: string; line: ReceiptExtractionAmountLine; sign: string }> = ({ label, line, sign }) => {
  const amount = peso(line.amount)
  return (
    <Field label={label}>
      {amount ? `${sign}${amount}` : 'Not available'}
      {line.description ? ` (${line.description})` : ''}
      {line.uncertain && <> <Badge>uncertain</Badge></>}
    </Field>
  )
}

/**
 * The structured (Gemini) extraction as DTI sees it. Every value is shown exactly as validated; uncertain values,
 * possible overlap duplicates, and reconciliation results are marked, and missing values read "Not available".
 */
export const ReceiptExtractionPanel: React.FC<{ result: ReceiptExtractionResult | null | undefined }> = ({ result }) => {
  if (!result || result.engine?.provider !== 'gemini') return null

  const items = result.items ?? []
  const reasonFor = (index: number, field: string): string | undefined => {
    const flags = result.item_flags?.[index]
    return flags && !Array.isArray(flags) ? flags[field] : undefined
  }
  const position = (sequence: number) => items.findIndex((item) => item.sequence === sequence) + 1
  const reconciliation = result.reconciliation
  const evidence = result.evidence_assessment

  return (
    <section aria-label="System extraction" style={{ display: 'grid', gap: '0.6rem', fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>System extraction (read-only)</h4>
        <span>
          <Badge tone="info">{result.engine?.model || 'Gemini'}</Badge>
          {result.engine?.route && <Badge tone="muted">route: {result.engine.route}</Badge>}
        </span>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', display: 'grid', gap: '0.4rem' }}>
        <Field label="Merchant">
          {result.merchant?.display_name || 'Not available'}{' '}
          {result.merchant?.status && <Badge tone={result.merchant.status === 'matched' ? 'ok' : 'warn'}>{result.merchant.status}</Badge>}
          {result.merchant?.uncertain && <Badge>uncertain</Badge>}
        </Field>
        <Field label="Date">{result.transaction_date || 'Not available'}</Field>
        <Field label="Receipt no.">{result.receipt_number || 'Not available'}</Field>
        {evidence && <Field label="Photo quality">
          {evidence.legibility || 'Not available'}
          {(evidence.problems ?? []).map((problem) => <Badge key={problem}>{problem.replaceAll('_', ' ')}</Badge>)}
          {evidence.total_region_visible === false && <Badge>total not visible</Badge>}
        </Field>}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Extracted items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ color: '#64748b' }}>
              <th style={cell}>#</th><th style={cell}>Sec.</th><th style={cell}>Description</th><th style={cell}>Qty</th>
              <th style={cell}>Unit price</th><th style={cell}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const uncertain = item.uncertain_fields ?? []
              return (
                <tr key={item.sequence} aria-label={`Extracted item ${index + 1}`}>
                  <td style={cell}>{index + 1}</td>
                  <td style={cell}>{item.section ?? '—'}</td>
                  <td style={cell}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.item_name || 'Not available'}</div>
                    {(uncertain.length > 0 || item.possible_duplicate_of != null) && <div style={{ marginTop: '0.15rem' }}>
                      {uncertain.map((field) => {
                        const reason = reasonFor(index, field)
                        return <Badge key={field}>{FIELD_LABELS[field] ?? field} uncertain{reason ? ` (${reason.replaceAll('_', ' ')})` : ''}</Badge>
                      })}
                      {item.possible_duplicate_of != null && <Badge tone="bad">possible duplicate of #{position(item.possible_duplicate_of) || item.possible_duplicate_of + 1}</Badge>}
                    </div>}
                    {item.raw_text && <pre style={{ margin: '0.2rem 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.68rem', color: '#64748b' }}>{item.raw_text}</pre>}
                  </td>
                  <td style={cell}>{item.quantity ?? 'Not available'}</td>
                  <td style={cell}>{peso(item.unit_price) ?? 'Not available'}</td>
                  <td style={cell}>{peso(item.line_total) ?? 'Not available'}</td>
                </tr>
              )
            })}
            {items.length === 0 && <tr><td style={cell} colSpan={6}>No items extracted.</td></tr>}
          </tbody>
        </table>
      </div>

      {(result.rejected_item_lines?.length ?? 0) > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', color: '#475569' }}>{result.rejected_item_lines!.length} line(s) not treated as items</summary>
          <pre style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.68rem', color: '#64748b' }}>{result.rejected_item_lines!.join('\n')}</pre>
        </details>
      )}

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', display: 'grid', gap: '0.4rem' }}>
        <Field label="Subtotal">{peso(result.subtotal) ?? 'Not available'}{result.subtotal_uncertain && <> <Badge>uncertain</Badge></>}</Field>
        {(result.discounts ?? []).map((line, index) => <AmountRow key={`discount-${index}`} label="Discount" line={line} sign="−" />)}
        {(result.adjustments ?? []).map((line, index) => (
          <AmountRow key={`adjustment-${index}`} label={ADJUSTMENT_LABELS[line.kind ?? 'other'] ?? 'Adjustment'} line={line} sign={line.direction === 'subtract' ? '−' : '+'} />
        ))}
        <Field label="Total">{peso(result.total) ?? 'Not available'}{result.total_uncertain && <> <Badge>uncertain</Badge></>}</Field>
      </div>

      <div aria-label="Reconciliation" style={{ display: 'grid', gap: '0.3rem' }}>
        <div>
          <strong style={{ color: '#0f172a', marginRight: '0.35rem' }}>Reconciliation</strong>
          <Badge tone={statusTone(reconciliation?.status)}>{reconciliation?.status || 'Not available'}</Badge>
          {reconciliation?.items_sum && <span style={{ color: '#64748b' }}>items sum {peso(reconciliation.items_sum)}</span>}
        </div>
        <div>
          {Object.entries(reconciliation?.checks ?? {}).map(([check, status]) => (
            <Badge key={check} tone={statusTone(status)}>{CHECK_LABELS[check] ?? check}: {status}</Badge>
          ))}
        </div>
        {reconciliation?.duplicates_are_likely_genuine && (
          <span style={{ color: '#92400e' }}>Counting the flagged duplicates makes the amounts reconcile, so they may be genuine repeat purchases.</span>
        )}
      </div>

      {(result.warnings?.length ?? 0) > 0 && (
        <ul aria-label="Extraction warnings" style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.2rem', color: '#92400e' }}>
          {result.warnings!.map((warning) => <li key={warning.code}><Badge>{warning.code}</Badge>{warning.message}</li>)}
        </ul>
      )}
    </section>
  )
}

/** "Section i of N" navigation across the original sections of the attempt currently being viewed. */
export const EvidenceSectionNav: React.FC<{
  assets: ReceiptEvidenceAssetRecord[]
  selected: ReceiptEvidenceAssetRecord | null
  /** Blocks navigation while a section is loading: each move is an audited evidence read. */
  busy?: boolean
  onSelect: (asset: ReceiptEvidenceAssetRecord) => void
}> = ({ assets, selected, busy = false, onSelect }) => {
  if (!selected || selected.kind !== 'source_frame') return null
  const sections = assets
    .filter((asset) => asset.kind === 'source_frame' && asset.attempt_number === selected.attempt_number)
    .sort((a, b) => a.sequence - b.sequence)
  const index = sections.findIndex((asset) => asset.id === selected.id)
  if (index < 0) return null
  const button: React.CSSProperties = { padding: '0.25rem 0.55rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#334155' }}>
      <button type="button" style={button} disabled={busy || index === 0} onClick={() => onSelect(sections[index - 1])}>Previous section</button>
      <strong>Section {index + 1} of {sections.length}</strong>
      {selected.attempt_number ? <span style={{ color: '#64748b' }}>attempt {selected.attempt_number}{selected.is_current ? ' (current)' : ''}</span> : null}
      <button type="button" style={button} disabled={busy || index === sections.length - 1} onClick={() => onSelect(sections[index + 1])}>Next section</button>
    </div>
  )
}
