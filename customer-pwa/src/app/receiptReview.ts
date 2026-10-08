export interface ReceiptReviewItem {
  sequence: number;
  raw_text: string | null;
  item_name: string | null;
  quantity: number | null;
  unit: string | null;
  observed_price: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  /** Structured extraction only: fields that could not be read with confidence. */
  uncertain_fields?: string[] | null;
  section?: number | null;
  /** Sequence of an earlier item this line may repeat where two photos overlap. */
  possible_duplicate_of?: number | null;
  ocr_confidence: number | null;
}

export type ReceiptEvidence = { id: number; sequence: number; mime_type: string; size_bytes: number };

type ReceiptAmountLine = { description?: string | null; kind?: string; direction?: 'add' | 'subtract'; amount: string | null; uncertain: boolean };

export interface ReceiptReviewData {
  read_only?: boolean;
  can_submit?: boolean;
  can_change_store?: boolean;
  submission_block_reason?: { code: string; message: string } | null;
  submitted_at?: string | null;
  results_available?: boolean;
  attempt_number?: number;
  transaction_date?: string | null;
  report_reference: string;
  status: string;
  store: { id: number; store_name: string; address: string } | null;
  items: ReceiptReviewItem[];
  continuity: { status: string; continuity_score?: number; reasons?: string[] } | null;
  merchant: { status: string; observed?: string[]; display_name?: string | null; uncertain?: boolean } | null;
  detected_total: number | null;
  receipt_number?: string | null;
  subtotal?: string | null;
  subtotal_uncertain?: boolean;
  total?: string | null;
  total_uncertain?: boolean;
  discounts?: ReceiptAmountLine[];
  adjustments?: ReceiptAmountLine[];
  reconciliation?: { status: string; checks?: Record<string, string> } | null;
  /** `gemini` for structured extraction; uncertainty then comes from `uncertain_fields`, never from `ocr_confidence`. */
  extraction_provider?: string | null;
  warnings: Array<{ code: string; message: string }>;
  manual_review_required: boolean;
  lines: string[];
  evidence: ReceiptEvidence[];
}

/** Only a confidently read merchant name that differs from the selected store counts as a wrong store. */
export const isWrongStore = (review: ReceiptReviewData) => review.merchant?.status === 'mismatch' && Boolean(review.merchant.display_name?.trim())
  && review.merchant.uncertain !== true && Boolean(review.store);
