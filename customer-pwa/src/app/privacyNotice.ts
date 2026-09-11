/**
 * The privacy notice shown before receipt capture. Its version is recorded with every report, and the backend only
 * sends a report's photos to the external receipt-reading service when that version is approved
 * (RECEIPT_EXTRACTION_CONSENT_VERSIONS). The text and the version must therefore always change together.
 * The v1.1 wording is pending DPO sign-off.
 */
export const PRIVACY_NOTICE_VERSION = '1.1';

export const PRIVACY_NOTICE_TITLE = `DTI Consumer Evidence Vault Privacy Notice (v${PRIVACY_NOTICE_VERSION})`;

export const PRIVACY_NOTICE_SECTIONS: ReadonlyArray<{ heading: string; body: string }> = [
  {
    heading: 'Scope',
    body: 'Pursuant to R.A. 7581 (Price Act) and the Data Privacy Act of 2012, receipt photos you submit through PRICE-Watch are kept in private DTI storage and used only to evaluate price reports.',
  },
  {
    heading: 'Restricted access',
    body: 'Only authorized DTI personnel can view the original photos during evaluation.',
  },
  {
    heading: 'Tamper-evident originals',
    body: 'The server records a SHA-256 fingerprint of every original photo it receives, so any later change can be detected.',
  },
  {
    heading: 'Automated receipt reading',
    body: 'To read the printed items and prices, DTI may send your receipt photos to Google’s Gemini service, which processes them for DTI as a data processor and may do so outside the Philippines. Only the photos are sent, not your report reference, device details, or tracking codes, and DTI turns off Google’s request storage for them. The results are shown to you read-only and are always checked by DTI staff.',
  },
  {
    heading: 'Your photos',
    body: 'Capture only the receipt. If it shows your name, card number, or other personal details, you may cover them before taking the photo.',
  },
];
