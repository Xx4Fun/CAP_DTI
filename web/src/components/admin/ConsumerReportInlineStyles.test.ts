import { describe, expect, it } from 'vitest'
// Read as raw source via Vite rather than node:fs, so the check needs no @types/node and the
// production typecheck stays clean.
import citizenTipReview from './CitizenTipReview.tsx?raw'
import itemReferenceVerdict from './ItemReferenceVerdict.tsx?raw'
import receiptExtractionPanel from './ReceiptExtractionPanel.tsx?raw'

/**
 * The Consumer Reports panel was the one admin panel that never adopted the stylesheet: 179 inline
 * style objects against 24 classNames, while FieldMonitoringRecords, UserManagementPanel and
 * LegalNoticeManager use zero. That is why it looked unlike the rest of the app, and why an inline
 * grid-template-columns silently overrode the responsive breakpoint.
 *
 * This guards the migration. It matches `style={` rather than `style={{` on purpose: the object
 * literal is only one form, and ReceiptExtractionPanel previously applied shared `style={cell}` and
 * `style={button}` objects that a `style={{` search would have missed entirely.
 */
const COMPONENTS: Array<[string, string]> = [
  ['CitizenTipReview.tsx', citizenTipReview],
  ['ItemReferenceVerdict.tsx', itemReferenceVerdict],
  ['ReceiptExtractionPanel.tsx', receiptExtractionPanel],
]

/**
 * Zoom and rotation are live user state that changes on every click, so they cannot be expressed as
 * a static rule. Any other inline style belongs in admin.css.
 */
const ALLOWED = /style=\{\{ transform: `scale\(\$\{zoom\}\) rotate\(\$\{rotation\}deg\)` \}\}/

describe('Consumer Reports styling', () => {
  it.each(COMPONENTS)('%s carries no inline styles beyond live transforms', (file, source) => {
    const offenders = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => line.includes('style={') && !ALLOWED.test(line))

    expect(offenders, `${file} should use admin.css, not inline styles`).toEqual([])
  })

  it('allows exactly the two live transforms and no more', () => {
    const matches = citizenTipReview.split('\n').filter((line) => ALLOWED.test(line))

    // The evidence viewport and the full-screen modal. A third would mean the exception is spreading.
    expect(matches).toHaveLength(2)
  })
})
