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

  // One tone word drives the whole block's colours; the palette lives in admin.css.
  const tone = unresolved ? 'unresolved' : above ? 'above' : 'within'
  const Icon = unresolved ? HelpCircle : above ? AlertTriangle : CheckCircle2

  const headline = unresolved
    ? 'No applicable reference'
    : above
      ? 'Above reference'
      : 'Within reference'

  return (
    <div className={`consumer-report-verdict is-${tone}`}>
      <div className="consumer-report-verdict-head">
        <Icon size={14} aria-hidden="true" />
        <span>{headline}</span>
        {!unresolved && reference?.peso_difference !== null && reference?.peso_difference !== undefined && (
          <span className="consumer-report-verdict-delta">
            {reference.peso_difference > 0 ? '+' : ''}
            {peso(reference.peso_difference)}
            {reference.percent_difference !== null && reference.percent_difference !== undefined
              ? ` (${reference.percent_difference > 0 ? '+' : ''}${reference.percent_difference}%)`
              : ''}
          </span>
        )}
      </div>

      {unresolved ? (
        <span className="consumer-report-verdict-note">
          {/* The resolver's label sometimes restates the headline; say what to do instead. */}
          {reference?.label && reference.label !== headline
            ? reference.label
            : 'Select the commodity so a reference can be applied.'}
        </span>
      ) : (
        <div className="consumer-report-verdict-detail">
          <span>
            Receipt {reference?.receipt_unit_price !== null && reference?.receipt_unit_price !== undefined
              ? peso(reference.receipt_unit_price)
              : 'unit price unavailable'}
            {' vs '}
            {reference?.value !== null && reference?.value !== undefined ? peso(reference.value) : 'reference unavailable'}
          </span>
          {/* Only an emergency ceiling is named: it is a different legal instrument from the
              ordinary SRP, which is the default and needs no label. */}
          {reference?.type === 'emergency_ceiling' && (
            <span className="consumer-report-verdict-source is-emergency">
              {reference.label}
              {reference.effective_date ? ` · effective ${reference.effective_date}` : ''}
            </span>
          )}
        </div>
      )}

      {reference?.auto_matched === false && (reference?.match_candidates?.length ?? 0) > 0 && (
        <span className="consumer-report-verdict-warning">
          Commodity not matched with confidence — confirm the commodity below.
        </span>
      )}
    </div>
  )
}
