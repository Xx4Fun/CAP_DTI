# Store Communications Input Alignment & Messenger-Style Image Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Store Communications module (`web/src/components/admin/StoreCommunications.tsx` & `admin.css`), perfectly align the attach button, message text area, and send button to the exact same height (44px) across all viewports, and implement Messenger-style image attachment handling: draft thumbnail previews in the composer and inline image viewing with a full lightbox modal in the chat timeline.

**Architecture:** 
1. **Composer Alignment**: Refactor `.comms-composer-row` to use centered flex alignment, matching 44px height, 12px border radius, and synchronized padding across the attach button (`.comms-attach`), single/auto-expanding message input (`.comms-input textarea`), and the primary submit button (`.admin-button.primary`).
2. **Composer Image Preview**: Replace the plain gray file chip with a Messenger-style media thumbnail card featuring an image preview (via object URL), file details, and an overlay remove button.
3. **Chat Timeline Image Message & Lightbox**: For message attachments matching image MIME types or extensions (`image/*`, `.jpg`, `.png`, `.webp`), fetch and display an inline thumbnail bubble (`max-height: 240px`, rounded corners, hover zoom). Clicking the image opens a Messenger-style full-resolution Lightbox overlay modal with close `(X)`, backdrop dismissal, and download/view options.

**Tech Stack:** React 19, TypeScript, Lucide React icons, CSS variables / design tokens from `admin.css`, Vitest for verification.

---

## File Structure

- **Modify**:
  - `web/src/components/admin/StoreCommunications.tsx`
    - Add `isImageAttachment` helper
    - Add `MessageImageAttachment` inline component with blob caching & loading skeleton
    - Add Lightbox modal state (`previewImage: { url: string; name: string } | null`)
    - Add Composer file preview: image thumbnail for images, document pill for PDFs
    - Adjust textarea default rows / height to match 44px
    - Keep all accessibility labels (`Message`, `Attach a file`, `Remove ${file.name}`) and test selectors intact
  - `web/src/components/admin/admin.css`
    - Update `.comms-composer-row` to `align-items: center` with uniform `height: 44px` on attach button, textarea, and send button
    - Add `.comms-composer-img-preview`, `.comms-composer-preview-close`
    - Add `.comms-msg-image-wrap`, `.comms-msg-image`, `.comms-img-skeleton`
    - Add `.comms-lightbox-overlay`, `.comms-lightbox-content`, `.comms-lightbox-img`, `.comms-lightbox-close`
- **Test**:
  - `web/src/components/admin/StoreCommunications.test.tsx` (all 7 existing tests must remain 100% passing)

---

## Tasks

### Task 1: Scoped CSS for Composer Alignment & Messenger Image Components

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Update `.comms-composer-row`, `.comms-attach`, `.comms-input textarea`, and `.comms-composer .admin-button`**
  - Set `align-items: center` on `.comms-composer-row`.
  - Set exact `height: 44px; min-height: 44px;` and `border-radius: 12px;` across attach, textarea, and send button.
  - Set textarea padding to `0.65rem 0.95rem` and `resize: none` with `line-height: 1.4`.

- [ ] **Step 2: Add styles for composer image preview card and chat image bubble**
  - Add `.comms-composer-img-preview`: 70x70px rounded container with image fill and top-right close badge.
  - Add `.comms-msg-image`: max width 280px, max height 240px, `object-fit: cover`, `border-radius: 12px`, cursor pointer.
  - Add `.comms-lightbox-overlay`: fixed full-screen backdrop (`rgba(0,0,0,0.85)`), flex center, z-index 9999.
  - Add `.comms-lightbox-img`: max 90vw, max 85vh, rounded, drop shadow.

---

### Task 2: Implement Composer Image Preview & Timeline Image Lightbox in `StoreCommunications.tsx`

**Files:**
- Modify: `web/src/components/admin/StoreCommunications.tsx`
- Test: `web/src/components/admin/StoreCommunications.test.tsx`

- [ ] **Step 1: Implement image detection & composer preview**
  - Check `file.type.startsWith('image/')` to generate an object URL for composer preview.
  - Clean up object URLs on file removal/unmount to prevent memory leaks.
  - If PDF, keep the document pill with name and size.

- [ ] **Step 2: Implement `MessageImageAttachment` component and Lightbox Modal**
  - For image attachments in message timeline, fetch blob via `adminApi.getMessageAttachment(storeId, message.id)`.
  - Render clickable thumbnail with smooth loading skeleton.
  - On click, set `previewImage` to open the full Lightbox modal.
  - Support `Esc` key and backdrop click to dismiss the Lightbox.
  - Keep non-image files rendered as the standard document button.

- [ ] **Step 3: Run Vitest tests to ensure 100% test suite compatibility**
  - Run: `npx vitest run src/components/admin/StoreCommunications.test.tsx`
  - Expected: 7 passed (100%).

- [ ] **Step 4: Run production build**
  - Run: `npm run build`
  - Expected: Clean build with zero TypeScript errors.

---

### Task 3: Visual Inspection & Responsive Verification

**Files:**
- Test via Playwright: Desktop (1280px), Tablet (820px), Mobile (390px)

- [ ] **Step 1: Verify composer row height alignment**
  - Confirm attach button, textarea, and send button are all exactly 44px high and vertically centered.
- [ ] **Step 2: Verify Messenger-style image attachment preview in composer**
  - Confirm image thumbnail renders cleanly above the composer row with dismiss button.
- [ ] **Step 3: Verify timeline image display and Lightbox**
  - Confirm inline images render with rounded bubble styling and enlarge into the lightbox on click.
