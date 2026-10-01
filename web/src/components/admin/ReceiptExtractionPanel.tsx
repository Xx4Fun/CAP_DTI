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

const statusTone = (status: string | undefined): Tone => (status === 'matched' ? 'ok' : status === 'mismatch' ? 'bad' : 'muted')

/** The caller names the meaning; admin.css owns what each meaning looks like. */
const Badge: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'warn', children }) => (
  <span className={`receipt-badge tone-${tone}`}>{children}</span>
)

const peso = (value: unknown): string | null => {
  const amount = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(amount) ? `₱${amount.toFixed(2)}` : null
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="receipt-extraction-field">
    <span>{label}</span>
    <strong>{children}</strong>
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
    <section aria-label="System extraction" className="receipt-extraction">
      <div className="receipt-extraction-head">
        <h4>System extraction (read-only)</h4>
      </div>

      <div className="receipt-extraction-group">
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

      <div className="receipt-extraction-tablewrap">
        <table aria-label="Extracted items" className="receipt-extraction-table">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th>Qty</th>
              <th>Unit price</th><th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const uncertain = item.uncertain_fields ?? []
              return (
                <tr key={item.sequence} aria-label={`Extracted item ${index + 1}`}>
                  <td>{index + 1}</td>
                  <td>
                    <div className="receipt-extraction-itemname">{item.item_name || 'Not available'}</div>
                    {(uncertain.length > 0 || item.possible_duplicate_of != null) && <div className="receipt-extraction-flags">
                      {uncertain.map((field) => {
                        const reason = reasonFor(index, field)
                        return <Badge key={field}>{FIELD_LABELS[field] ?? field} uncertain{reason ? ` (${reason.replaceAll('_', ' ')})` : ''}</Badge>
                      })}
                      {item.possible_duplicate_of != null && <Badge tone="bad">possible duplicate of #{position(item.possible_duplicate_of) || item.possible_duplicate_of + 1}</Badge>}
                    </div>}
                  </td>
                  <td>{item.quantity ?? 'Not available'}</td>
                  <td>{peso(item.unit_price) ?? 'Not available'}</td>
                  <td>{peso(item.line_total) ?? 'Not available'}</td>
                </tr>
              )
            })}
            {items.length === 0 && <tr><td colSpan={5}>No items extracted.</td></tr>}
          </tbody>
        </table>
      </div>

      {(result.rejected_item_lines?.length ?? 0) > 0 && (
        <details className="receipt-extraction-rejected">
          <summary>{result.rejected_item_lines!.length} line(s) not treated as items</summary>
          <pre className="receipt-extraction-raw">{result.rejected_item_lines!.join('\n')}</pre>
        </details>
      )}

      <div className="receipt-extraction-group">
        <Field label="Subtotal">{peso(result.subtotal) ?? 'Not available'}{result.subtotal_uncertain && <> <Badge>uncertain</Badge></>}</Field>
        {(result.discounts ?? []).map((line, index) => <AmountRow key={`discount-${index}`} label="Discount" line={line} sign="−" />)}
        {(result.adjustments ?? []).map((line, index) => (
          <AmountRow key={`adjustment-${index}`} label={ADJUSTMENT_LABELS[line.kind ?? 'other'] ?? 'Adjustment'} line={line} sign={line.direction === 'subtract' ? '−' : '+'} />
        ))}
        <Field label="Total">{peso(result.total) ?? 'Not available'}{result.total_uncertain && <> <Badge>uncertain</Badge></>}</Field>
      </div>

      <div aria-label="Reconciliation" className="receipt-extraction-reconciliation">
        <div>
          <strong>Reconciliation</strong>
          <Badge tone={statusTone(reconciliation?.status)}>{reconciliation?.status || 'Not available'}</Badge>
          {reconciliation?.items_sum && <span className="receipt-extraction-sum">items sum {peso(reconciliation.items_sum)}</span>}
        </div>
        <div>
          {Object.entries(reconciliation?.checks ?? {}).map(([check, status]) => (
            <Badge key={check} tone={statusTone(status)}>{CHECK_LABELS[check] ?? check}: {status}</Badge>
          ))}
        </div>
        {reconciliation?.duplicates_are_likely_genuine && (
          <span className="receipt-extraction-caution">Counting the flagged duplicates makes the amounts reconcile, so they may be genuine repeat purchases.</span>
        )}
      </div>

      {(result.warnings?.length ?? 0) > 0 && (
        <ul aria-label="Extraction warnings" className="receipt-extraction-warnings">
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
  return (
    <div className="evidence-section-nav">
      <button type="button" disabled={busy || index === 0} onClick={() => onSelect(sections[index - 1])}>Previous section</button>
      <strong>Section {index + 1} of {sections.length}</strong>
      {selected.attempt_number ? <span className="evidence-section-nav-attempt">attempt {selected.attempt_number}{selected.is_current ? ' (current)' : ''}</span> : null}
      <button type="button" disabled={busy || index === sections.length - 1} onClick={() => onSelect(sections[index + 1])}>Next section</button>
    </div>
  )
}
