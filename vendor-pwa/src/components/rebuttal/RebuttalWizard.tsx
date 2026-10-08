import React, { useRef, useState } from 'react';
import { Upload, AlertTriangle, Trash2, ArrowLeft, ArrowRight, Send, Paperclip } from 'lucide-react';
import type { AttachmentCategory, LegalNotice, ReasonCategory, ResponseDraft } from '../../app/types';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  ATTACHMENT_CATEGORIES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MIN_RESPONSE_LENGTH,
  REASON_CATEGORIES,
  canRespond,
  reasonLabel,
  responseBlockedReason,
} from '../../app/rules';
import { apiError, isSessionInvalid } from '../../services/vendorApi';
import { useDraft } from '../../offline/useDraft';

interface RebuttalWizardProps {
  accountId: number;
  notice: LegalNotice;
  onCancel: () => void;
  onSubmit: (draft: ResponseDraft, revision?: string) => Promise<void>;
}

type DraftAttachment = { id: string; file: File; category: AttachmentCategory };

export const RebuttalWizard: React.FC<RebuttalWizardProps> = ({ accountId, notice, onCancel, onSubmit }) => {
  const saved = useDraft(accountId, `response/${notice.id}`, { storeId: notice.store_id, step: 1 as 1 | 2 | 3 | 4, reasonCategory: REASON_CATEGORIES[0].id as ReasonCategory, justification: '', attachments: [] as DraftAttachment[], certified: false }, (value) => value.step > 1 || !!value.justification || !!value.attachments.length);
  const { step, reasonCategory, justification, attachments, certified } = saved.value;
  const setStep = (next: 1 | 2 | 3 | 4) => saved.update((value) => ({ ...value, step: next }));
  const setReasonCategory = (next: ReasonCategory) => saved.update((value) => ({ ...value, reasonCategory: next, certified: false }));
  const setJustification = (next: string) => saved.update((value) => ({ ...value, justification: next, certified: false }));
  const setAttachments = (next: React.SetStateAction<DraftAttachment[]>) => saved.update((value) => ({ ...value, attachments: typeof next === 'function' ? next(value.attachments) : next, certified: false }));
  const setCertified = (next: boolean) => saved.update((value) => ({ ...value, certified: next }));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reference = notice.control_number ?? `Notice #${notice.id}`;
  const closed = !canRespond(notice);
  const started = step > 1 || justification.trim().length > 0 || attachments.length > 0;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setError('');
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Attach at most ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of files) {
      // Some platforms report no MIME type; fall back to the extension. The server's own type validation stays authoritative.
      const typeAccepted = file.type ? ACCEPTED_ATTACHMENT_TYPES.includes(file.type) : /\.(pdf|jpe?g|png)$/i.test(file.name);
      if (!typeAccepted) {
        setError(`${file.name} is not accepted. Only PDF, JPEG, and PNG files can be submitted.`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is larger than 5 MB.`);
        return;
      }
    }
    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => ({ id: `${Date.now()}-${index}-${file.name}`, file, category: 'DELIVERY_RECEIPT' as AttachmentCategory })),
    ]);
  };

  const handleSubmit = async () => {
    if (!canRespond(notice)) return setError(responseBlockedReason(notice) ?? 'Responses are closed for this notice.');
    if (!certified) return setError('Confirm the sworn certification before submitting.');
    if (justification.trim().length < MIN_RESPONSE_LENGTH) return setError(`Write at least ${MIN_RESPONSE_LENGTH} characters of explanation.`);
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit({
        reason_category: reasonCategory,
        response_text: justification.trim(),
        certified_under_oath: certified,
        attachments: attachments.map(({ file, category }) => ({ file, category })),
      }, saved.value.__revision);
    } catch (submitError) {
      // An ended session is handled by the portal (sign-out); every other failure stays here with the server's reason.
      if (!isSessionInvalid(submitError)) setError(apiError(submitError, 'The response could not be submitted. Check your connection and try again.'));
      setIsSubmitting(false);
    }
  };

  // Only an untouched response shows the closed card; a started draft stays visible so the vendor can keep a copy.
  if (!saved.ready) return <div className="v-card" role="status">{saved.status}<button className="btn btn-secondary btn-sm" onClick={onCancel}>Back to notices</button></div>;
  if (closed && !started) {
    return (
      <div className="v-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
        <AlertTriangle size={42} color="var(--danger-color)" style={{ margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--danger-color)', marginBottom: '8px' }}>Responses are closed for {reference}</h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 16px' }}>{responseBlockedReason(notice)}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          For questions, coordinate directly with the DTI Antique Provincial Office.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <ArrowLeft size={16} />
          <span>Return</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rebuttal-wizard v-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
        <div>
          <span className="badge badge-navy">Formal Response</span>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--dti-navy)', marginTop: '4px' }}>In Response to {reference}</h2>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={isSubmitting}>
          <ArrowLeft size={14} />
          <span>{closed ? 'Leave draft' : 'Cancel'}</span>
        </button>
      </div>

      <ol aria-label="Response steps" className="wizard-stepper">
        {['Reason', 'Explanation', 'Evidence', 'Certify'].map((title, index) => {
          const number = index + 1;
          return (
            <li
              key={title}
              aria-current={step === number ? 'step' : undefined}
              className={`wizard-step-item ${step === number ? 'active' : ''} ${step > number ? 'completed' : ''}`}
            >
              <span className="wizard-step-circle">{step > number ? '✓' : number}</span>
              <span className="wizard-step-label">{title}</span>
            </li>
          );
        })}
      </ol>

      <p role="status">{saved.status}</p>
      {saved.status.startsWith('Save failed') && <button className="btn btn-secondary btn-sm" onClick={saved.retry}>Retry saving draft</button>}
      {closed && (
        <div role="status" className="portal-error">
          <AlertTriangle size={16} />
          <span>{responseBlockedReason(notice)} Submission is disabled; your draft stays here so you can copy it before leaving.</span>
        </div>
      )}

      {error && (
        <div role="alert" className="portal-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Select the main reason</legend>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Identify the principal reason for the recorded shelf prices:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {REASON_CATEGORIES.map((category) => (
              <label key={category.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: reasonCategory === category.id ? '2px solid var(--dti-navy)' : '1px solid var(--border-color)', background: reasonCategory === category.id ? 'rgba(27, 54, 93, 0.03)' : '#FFFFFF', cursor: 'pointer' }}>
                <input type="radio" name="reason_category" checked={reasonCategory === category.id} onChange={() => setReasonCategory(category.id)} style={{ marginTop: '3px' }} />
                <span>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', display: 'block' }}>{category.label}</strong>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{category.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
              <span>Next: Written Explanation</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <div>
          <label htmlFor="response-text" style={{ display: 'block', fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Detailed written explanation</label>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Explain the circumstances behind the pricing{notice.flagged_items.length ? <> on <strong>{notice.flagged_items.map((item) => item.commodity_name).filter(Boolean).join(', ')}</strong></> : null}:
          </p>
          <div className="form-group">
            <textarea
              id="response-text"
              className="form-control"
              rows={6}
              maxLength={10000}
              placeholder="e.g. On August 28, 2026, our primary supplier from Iloilo adjusted the wholesale price per case from ₱1,150 to ₱1,320 due to increased logistics costs..."
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              style={{ fontSize: '0.86rem', lineHeight: '1.5' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Minimum {MIN_RESPONSE_LENGTH} characters. Current: {justification.trim().length} characters.
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (justification.trim().length < MIN_RESPONSE_LENGTH) return setError(`Write at least ${MIN_RESPONSE_LENGTH} characters of explanation.`);
                setError('');
                setStep(3);
              }}
            >
              <span>Next: Attach Evidence</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Attach supporting documents (optional)</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Documents strengthen your explanation. Up to <strong>{MAX_ATTACHMENTS} files</strong>, PDF, JPG, or PNG, <strong>5 MB each</strong>. Choose what each document is.
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
            onChange={handleFileUpload}
            className="visually-hidden-file"
            tabIndex={-1}
            aria-label="Attach supporting documents"
          />
          <button
            type="button"
            className="upload-dropzone"
            onClick={() => fileInput.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            style={{ width: '100%' }}
          >
            <span className="upload-icon-circle"><Upload size={22} /></span>
            <strong>{attachments.length >= MAX_ATTACHMENTS ? 'Maximum documents attached' : 'Choose documents'}</strong>
            <span>Delivery receipts, invoices, freight bills, or shelf tag photos</span>
          </button>

          {attachments.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Attached documents ({attachments.length}/{MAX_ATTACHMENTS}):</strong>
              {attachments.map((attachment) => (
                <div key={attachment.id} className="attachment-chip">
                  <div className="attachment-chip-info">
                    <Paperclip size={16} color="var(--dti-navy)" />
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{attachment.file.name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '8px' }}>({Math.max(1, Math.round(attachment.file.size / 1024))} KB)</span>
                    </div>
                  </div>
                  <select
                    className="form-control attachment-category-select"
                    aria-label={`Document type for ${attachment.file.name}`}
                    value={attachment.category}
                    onChange={(event) => setAttachments((current) => current.map((item) => item.id === attachment.id ? { ...item, category: event.target.value as AttachmentCategory } : item))}
                  >
                    {ATTACHMENT_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                  <button type="button" className="remove-chip-btn" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} aria-label={`Remove ${attachment.file.name}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => { setError(''); setStep(4); }}>
              <span>Next: Certify & Review</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px' }}>Review & sworn certification</h3>
          <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px', fontSize: '0.82rem' }}>
            <div style={{ marginBottom: '8px' }}><span style={{ color: 'var(--text-muted)' }}>Notice:</span> <strong>{reference}</strong></div>
            <div style={{ marginBottom: '8px' }}><span style={{ color: 'var(--text-muted)' }}>Reason:</span> <strong>{reasonLabel(reasonCategory)}</strong></div>
            <div style={{ marginBottom: '8px' }}><span style={{ color: 'var(--text-muted)' }}>Documents:</span> <strong>{attachments.length ? attachments.map((attachment) => attachment.file.name).join(', ') : 'None attached'}</strong></div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Explanation:</span>
              <p style={{ marginTop: '4px', background: '#FFFFFF', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>{justification.trim()}</p>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '20px' }}>
            <input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} style={{ marginTop: '3px' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
              <strong>Sworn certification:</strong> I certify under oath that this explanation and any attached documents are true and correct, and I understand that DTI may verify them.
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(3)} disabled={isSubmitting}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={isSubmitting || !certified || closed}>
              <Send size={16} />
              <span>{isSubmitting ? 'Submitting to DTI…' : 'Submit Official Response'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
