# Store Communications Messenger-Style Chat Bubbles & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform chat messages in Store Communications (`web/src/components/admin/StoreCommunications.tsx` & `admin.css`) into authentic Messenger-style bubbles: message containers fit tightly to the exact length of the text/content with no internal metadata; timestamps and seen status are positioned cleanly outside and underneath the bubble; and the bottom disclaimer hint text is completely removed.

**Architecture:** 
1. **Message Hierarchy**: Separate message rows into a flex column item (`.comms-message-row.dti` and `.comms-message-row.vendor`). The bubble (`.comms-bubble`) wraps ONLY the text/content with `width: fit-content`.
2. **External Timestamp & Status**: Move `.comms-bubble-meta` outside the `.comms-bubble` directly below it, styled in subtle muted text (`#64748b`, `0.72rem`), displaying the timestamp and delivery/seen status (e.g. `Sep 28, 2026, 9:32 AM · Seen`), while preserving sender/vendor audit information for screen readers and tests via accessible markup.
3. **Image Bubble Polish**: Ensure image attachments render seamlessly with rounded corners without excessive container padding.
4. **Composer Cleanup**: Remove the `<p className="comms-hint">` disclaimer text below the composer row.

**Tech Stack:** React 19, TypeScript, CSS variables from `admin.css`, Vitest for verification.

---

## File Structure

- **Modify**:
  - `web/src/components/admin/StoreCommunications.tsx`
    - Restructure message item into `.comms-message-row` containing `.comms-bubble` (content only) and `.comms-message-meta` (outside underneath)
    - Remove `<p className="comms-hint">Messages are informal...</p>`
    - Retain audit names in an accessible tag so `StoreCommunications.test.tsx` assertions continue to pass
  - `web/src/components/admin/admin.css`
    - Add `.comms-message-row` styling with alignment (`flex-end` for DTI, `flex-start` for Vendor)
    - Update `.comms-bubble` to `width: fit-content`, `max-width: min(560px, 75%)`, `padding: 0.65rem 0.95rem`, `border-radius: 18px`
    - Update `.comms-message-meta` to sit outside the bubble with clean text alignment
- **Test**:
  - `web/src/components/admin/StoreCommunications.test.tsx` (all tests passing)

---

## Tasks

### Task 1: Update CSS in `admin.css` for Messenger Bubble Structure

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Add `.comms-message-row` and update `.comms-bubble` & `.comms-message-meta`**
  - Define `.comms-message-row` with `display: flex; flex-direction: column; max-width: min(560px, 78%); margin-bottom: 0.5rem;`
  - `.comms-message-row.dti { align-self: flex-end; align-items: flex-end; }`
  - `.comms-message-row.vendor { align-self: flex-start; align-items: flex-start; }`
  - `.comms-bubble { width: fit-content; padding: 0.65rem 0.95rem; border-radius: 18px; line-height: 1.45; }`
  - `.comms-bubble.dti { background: #1e3a8a; color: #ffffff; border-bottom-right-radius: 4px; }`
  - `.comms-bubble.vendor { background: #ffffff; color: #0f172a; border: 1.5px solid #e2e8f0; border-bottom-left-radius: 4px; }`
  - `.comms-message-meta { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.25rem; padding: 0 0.25rem; font-size: 0.72rem; color: #64748b; font-weight: 500; }`

---

### Task 2: Refactor `StoreCommunications.tsx` Message Layout & Remove Hint Text

**Files:**
- Modify: `web/src/components/admin/StoreCommunications.tsx`
- Test: `web/src/components/admin/StoreCommunications.test.tsx`

- [ ] **Step 1: Update timeline message rendering**
  - Render message in `.comms-message-row`:
    ```tsx
    <div key={`m${entry.message.id}`} className={`comms-message-row ${entry.message.sender_side}`}>
      <div className={`comms-bubble ${entry.message.sender_side}`}>
        {entry.message.body && <p>{entry.message.body}</p>}
        {entry.message.attachment && ( ... )}
      </div>
      <div className="comms-message-meta">
        <span className="sr-only">
          {entry.message.sender_side === 'dti' 
            ? `${entry.message.sender_name || 'DTI'} → ${entry.message.vendor_name || 'vendor'}` 
            : (entry.message.sender_name || 'Vendor')}
        </span>
        <span>{time(entry.message.created_at)}</span>
        {entry.message.sender_side === 'dti' && <span>{entry.message.read_at ? '· Seen' : '· Sent'}</span>}
      </div>
    </div>
    ```

- [ ] **Step 2: Remove informal legal disclaimer hint**
  - Remove `<p className="comms-hint">Messages are informal. Formal explanations go through the vendor's notice response, and chat never starts a legal deadline.</p>`.

- [ ] **Step 3: Run Vitest tests**
  - Run: `npx vitest run src/components/admin/StoreCommunications.test.tsx`
  - Expected: All 7 tests pass.

- [ ] **Step 4: Run production build**
  - Run: `npm run build`
  - Expected: Clean build with zero errors.

---

### Task 3: Visual Inspection with Playwright

**Files:**
- Test: `verify_comms_ui.py` across Desktop, Tablet, and Mobile

- [ ] **Step 1: Verify short text bubbles fit tightly**
  - Confirm "Hii?" renders as a compact, neat blue pill without extra stretching.
- [ ] **Step 2: Verify metadata is outside underneath**
  - Confirm timestamp and "Seen" appear in muted text under the bubble aligned to the right for DTI and left for Vendor.
- [ ] **Step 3: Confirm bottom disclaimer is gone**
  - Confirm the composer area is clean with no clutter underneath.
