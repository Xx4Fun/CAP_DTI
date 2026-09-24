import React from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import type { ItemPriceReference } from '../../types/admin'

const peso = (value: number) => `₱${value.toFixed(2)}`

/**
 * States how one receipt line compares with the regulatory reference that applied on the purchase
 * date. This is arithmetic the system can do for the evaluator, not a determination: the finding
 * control below it stays the evaluator's.
 *
 * Renders three distinct outcomes and never collapses them. An item with no resolvable reference
 * reads "No applicable reference" — never a reassuring "within reference" the evidence cannot support.
 */
export const ItemReferenceVerdict: React.FC<{ reference?: ItemPriceReference }> = ({ reference }) => {
  const above = reference?.is_above_reference
  const unresolved = !reference || reference.status !== 'available' || above === null || above === undefined

  const tone = unresolved
    ? { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', icon: HelpCircle }
    : above
      ? { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', icon: AlertTriangle }
      : { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857', icon: CheckCircle2 }
  const Icon = tone.icon

  const headline = unresolved
    ? 'No applicable reference'
    : above
      ? 'Above reference'
      : 'Within reference'

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.3rem',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: '6px',
        padding: '0.5rem 0.6rem',
        fontSize: '0.74rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: tone.text, fontWeight: 800 }}>
        <Icon size={14} aria-hidden="true" />
        <span>{headline}</span>
        {!unresolved && reference?.peso_difference !== null && reference?.peso_difference !== undefined && (
          <span style={{ fontWeight: 700 }}>
            {reference.peso_difference > 0 ? '+' : ''}
            {peso(reference.peso_difference)}
            {reference.percent_difference !== null && reference.percent_difference !== undefined
              ? ` (${reference.percent_difference > 0 ? '+' : ''}${reference.percent_difference}%)`
              : ''}
          </span>
        )}
      </div>

      {unresolved ? (
        <span style={{ color: '#64748b' }}>
          {/* The resolver's label sometimes restates the headline; say what to do instead. */}
          {reference?.label && reference.label !== headline
            ? reference.label
            : 'Select the commodity so a reference can be applied.'}
        </span>
      ) : (
        <div style={{ display: 'grid', gap: '0.15rem', color: '#475569' }}>
          <span>
            Receipt {reference?.receipt_unit_price !== null && reference?.receipt_unit_price !== undefined
              ? peso(reference.receipt_unit_price)
              : 'unit price unavailable'}
            {' vs '}
            {reference?.value !== null && reference?.value !== undefined ? peso(reference.value) : 'reference unavailable'}
          </span>
          {/* Naming the reference type matters: an emergency ceiling and an ordinary SRP are
              different legal instruments, and the evaluator must see which one governed. */}
          <span style={{ fontWeight: 600, color: reference?.type === 'emergency_ceiling' ? '#b45309' : '#475569' }}>
            {reference?.label}
            {reference?.effective_date ? ` · effective ${reference.effective_date}` : ''}
          </span>
        </div>
      )}

      {reference?.auto_matched === false && (reference?.match_candidates?.length ?? 0) > 0 && (
        <span style={{ color: '#b45309', fontWeight: 600 }}>
          Commodity not matched with confidence — confirm the key below.
        </span>
      )}
    </div>
  )
}
