# PRICE-Watch Citizen Guided Trust UI Design

**Date:** 2026-07-21  
**Project area:** Flutter mobile application  
**Audience:** Citizen/consumer users reporting commodity-price evidence to DTI Antique  
**Scope:** UI/UX redesign of the complete Citizen journey

## 1. Objective

Replace the current single, vertically dense consumer scanner screen with a modern, accessible, guided journey that makes receipt reporting understandable on first use. The redesign must preserve the existing authentication, camera capture, image hashing, price-text validation, store lookup, and multipart upload behavior.

The Citizen journey has one primary job: help an ordinary citizen submit a trustworthy receipt photograph and understand what happens next.

## 2. Approved Direction

The approved visual and interaction direction is **Guided Trust**.

Guided Trust uses a bright, calm interface designed for outdoor and daylight legibility. It explains the minimum information needed at each stage, uses one primary action per screen, and reassures users that their evidence is handled securely without overwhelming them with technical terminology.

The signature interaction is a compact trust trail:

`Photo -> Check details -> Send`

Every stage combines text, iconography, and state styling. Color is never the only status indicator.

## 3. Journey and Screen Flow

### 3.1 Citizen Sign-In

- Restyle the existing shared mobile sign-in screen with the new light visual system.
- Keep the current authentication behavior and role routing unchanged.
- Present clear email and password fields, an explicit sign-in action, a loading state, and plain-language errors.
- Ensure the visual update remains compatible with the officer role that uses the same entry screen.

### 3.2 Citizen Welcome

- Show one primary action: **Report a receipt**.
- Explain that the report takes three guided steps.
- Explain that the original image is stored in DTI's secure evidence vault.
- Provide a short **How it works** disclosure without blocking the primary path.
- Move logout into a conventional account or overflow control. Remove the floating red logout action from the Citizen journey.

### 3.3 Step 1: Photograph Receipt

- Use a full-width, dark camera surface only while the camera is active.
- Keep the entire receipt guide visible and provide short alignment and lighting instructions.
- Retain hardware camera capture and the absence of gallery upload.
- Preserve SHA-256 calculation from the captured image bytes.
- Retain the existing development/emulator fallback behavior, but present it as a clearly separated non-production state.
- Provide a normal back action before capture.

### 3.4 Step 2: Review Details

- Show the captured receipt preview first.
- Show the selected store using the existing local SQLite store data.
- Present extracted receipt text in a readable review surface rather than as a technical OCR console.
- Show a concise **Photo secured** state after the checksum is created.
- Keep **Retake photo** visually secondary to **Send securely**.
- Confirm before discarding an existing capture.
- Retain the decimal-price validation requirement before submission.

### 3.5 Submission State

- Replace the submit action with a clear progress state while the multipart request is active.
- Prevent duplicate submission taps.
- Keep the captured receipt and review context visible while the request is pending.
- Continue using the existing authenticated multipart `POST /api/tips` request.

### 3.6 Success Confirmation

- Display **Report received** and explain that a DTI evaluator will review the store and receipt details.
- Display the real returned `tip.id` when it is available. Never generate a fabricated reference.
- Provide **Done** and **Report another receipt** actions.
- Starting another report resets only the Citizen journey's local submission state.

### 3.7 Failure and Empty States

- Translate network and API failures into concise, actionable UI messages. Do not expose raw response bodies to citizens.
- Preserve the captured receipt and entered review data after a failed upload so the citizen can retry.
- Explain how to retry camera initialization without exposing implementation details.
- When SQLite contains no stores, replace the unusable dropdown with an unavailable-data state that explains the report cannot yet be submitted on this device.
- Adding or changing consumer store synchronization is outside this UI/UX batch.

## 4. Visual System

### 4.1 Color Tokens

- Cloud background: `#F5F8FC`
- White surface: `#FFFFFF`
- DTI blue / primary action: `#215FBF`
- Trust teal / secured state: `#187B70`
- Primary ink: `#17243A`
- Muted slate: `#68778C`
- Error red: `#C63D4A`

Red is reserved for genuine failures or destructive confirmation. It is not used as a general Citizen accent.

### 4.2 Typography

- Use the platform-native sans-serif family to retain offline reliability and avoid runtime font downloads.
- Use high-weight, compact headlines for screen purpose.
- Use regular-weight body text with comfortable line height for instructions.
- Use monospace only for a returned hash or report identifier when such technical detail is displayed.
- Support Android text scaling without clipping or hiding actions.

### 4.3 Layout and Controls

- Respect safe areas, keyboard insets, and narrow Android screens.
- Use at least 48 logical pixels for primary touch targets.
- Keep the main action near the lower reachable area without obscuring scrollable content.
- Use one visually dominant action per screen.
- Keep secondary and destructive actions visibly distinct.
- Avoid glass effects, ornamental gradients, and dense technical panels.

### 4.4 Motion and Feedback

- Use one restrained transition when advancing between journey stages.
- Avoid ambient or repeated animation.
- Disable nonessential motion when the platform requests reduced motion.
- Pair loading indicators with clear action text such as **Sending report**.

## 5. Component Boundaries

The redesigned Citizen flow should be composed from focused Flutter widgets:

- `CitizenJourneyScreen`: owns the current journey stage and coordinates existing operations.
- `CitizenWelcomeView`: explains the task and starts a report.
- `CitizenCaptureView`: renders camera preview, receipt frame, instructions, capture, and camera error state.
- `CitizenReviewView`: renders the preview, store selector, extracted text, secured state, validation, retake, and submit controls.
- `CitizenSuccessView`: renders successful receipt confirmation and next actions.
- Shared Citizen UI widgets: trust trail, status banner, primary/secondary buttons, privacy card, and empty state.

The journey stages are:

`welcome -> capture -> review -> submitting -> success`

The component split is an internal UI organization change. It must not alter API routes, backend contracts, database schema, role behavior, or officer screens.

## 6. Preserved Data and Behavior

- Authentication and role routing remain unchanged.
- Stores continue to come from `DbHelper.searchStores` and the existing SQLite cache.
- Camera input continues to use the Flutter `camera` package.
- Gallery uploads remain unavailable.
- SHA-256 continues to be calculated from the captured image bytes.
- Decimal validation continues to use the existing `RegExp(r'\d+\.\d{2}')` requirement.
- The report remains serialized into `extracted_text_json`.
- Submission continues to use the existing bearer token and multipart `/api/tips` endpoint.
- Backend, Supabase schema, and DTI officer behavior are not changed.

## 7. Accessibility and Usability Requirements

- All actionable icons have semantic labels or adjacent text.
- Focus order follows the visual journey.
- Status is communicated using text and iconography as well as color.
- Text and controls maintain sufficient contrast in both light screens and the dark camera surface.
- Narrow-screen and large-text layouts remain scrollable without overflow.
- Keyboard appearance must not cover the active review field or submission action.
- Plain-language labels replace internal terms such as “vault gateway,” “OCR JSON payload,” and “checksum hash” in primary citizen-facing copy.

## 8. Verification

Implementation verification must include:

1. `dart format` for modified Dart files.
2. `flutter analyze` with no new issues.
3. `flutter test`, including the existing login smoke test.
4. Focused widget tests for:
   - Citizen welcome and report start.
   - Journey stage navigation.
   - Empty store data.
   - Camera initialization failure.
   - Receipt text validation failure.
   - Upload loading, failure, retry, and success states.
   - Display of a real returned report identifier when available.
5. Narrow-screen and large-text overflow checks.
6. Semantics checks for major actions and status messages.
7. Android debug build.
8. A final diff audit confirming no backend, Supabase, database, or officer-workflow changes entered this UI/UX batch.

## 9. Explicitly Out of Scope

- Implementing real on-device OCR.
- Changing the consumer authentication implementation.
- Adding a new store synchronization endpoint or changing sync permissions.
- Direct mobile access to Supabase.
- Backend validation or storage changes.
- Officer inspection UI redesign.
- DTI web dashboard redesign.
- New citizen report-history or case-tracking features.
