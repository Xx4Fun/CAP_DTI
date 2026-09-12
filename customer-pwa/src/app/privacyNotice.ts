/**
 * The privacy notice shown before receipt capture. Its version is recorded with every report, and the backend only
 * sends a report's photos to the external receipt-reading service when that version is approved
 * (RECEIPT_EXTRACTION_CONSENT_VERSIONS). The text and the version must therefore always change together: once a
 * version appears in that list, any wording change needs a new version, because reports have consented to the old text.
 *
 * v1.2 is the version the project team approved for the capstone demonstration (see docs/DECISIONS.md). It states the
 * free-tier terms plainly; v1.1 described a paid-tier arrangement the project does not have and was never consented to.
 */
export const PRIVACY_NOTICE_VERSION = '1.2';

export const PRIVACY_NOTICE_TITLE = `DTI Consumer Evidence Vault Privacy Notice (v${PRIVACY_NOTICE_VERSION})`;

export const PRIVACY_NOTICE_SECTIONS: ReadonlyArray<{ heading: string; body: string }> = [
  {
    heading: 'Scope',
    body: 'Pursuant to R.A. 7581 (Price Act) and the Data Privacy Act of 2012, receipt photos you submit through PRICE-Watch are kept in private DTI storage and used only to evaluate price reports.',
  },
  {
    heading: 'Restricted access',
    body: 'Apart from the automated reading described below, only authorized DTI personnel can view the original photos during evaluation.',
  },
  {
    heading: 'Tamper-evident originals',
    body: 'The server records a SHA-256 fingerprint of every original photo it receives, so any later change can be detected. Each submission is also logged with the time, your IP address, and your browser details for audit purposes.',
  },
  {
    heading: 'Automated receipt reading',
    body: 'To read the printed items and prices, DTI may send your receipt photos to Google’s Gemini service, which may process them outside the Philippines. Only the photos are sent, not your report reference, device details, or tracking codes. The results are shown to you read-only and are always checked by DTI staff.',
  },
  {
    heading: 'Free service plan during this demonstration',
    body: 'This system currently uses Google’s free service plan. On that plan Google may use the photos that are sent to improve its own services, and Google staff may review them. Because of this, only receipts belonging to the project team are captured while the demonstration runs. Using this system for the public requires a paid plan, on which submitted photos are not used to improve Google’s services.',
  },
  {
    heading: 'Your photos',
    body: 'Capture only the receipt. If it shows your name, card number, or other personal details, you may cover them before taking the photo.',
  },
];
