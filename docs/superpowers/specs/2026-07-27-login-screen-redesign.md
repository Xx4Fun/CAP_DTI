# PRICE-Watch DTI Admin Login Screen Redesign Spec

## 1. Component Requirements

### Layout & Architecture
- **Layout**: 2-Column Split Layout (`min-height: 100vh`, `display: flex` / `grid-template-columns: 1fr 1fr`).
- **Left Column**:
  - Full height (`100vh`).
  - Background image: `/login-left.png` (`background-size: cover; background-position: center;`).
  - Hides on mobile screens (<900px).
- **Right Column**:
  - Background: `#ffffff`.
  - Full height (`100vh`), flexbox center alignment (`display: flex; flex-direction: column; align-items: center; justify-content: center`).
  - Content container max-width: `440px`.

### Content & UI Design
1. **Header**:
   - Official DTI Logo: `/dti-logo.svg` (`height: 90px`).
   - Title: **PRICE-** (`#0f172a`) **Watch** (`#0052cc` / `#1d4ed8`).
   - Subtitle: `— DTI Admin Portal —` with subtle side line dividers (`#cbd5e1`).
2. **Form**:
   - `Email address` label + Left Mail SVG icon + Input (`placeholder="Enter your official email"`).
   - `Password` label + Left Lock SVG icon + Right Eye SVG icon toggle + Input (`placeholder="Enter your password"`).
   - **Omitted per user directive**: NO `Remember me` checkbox and NO `Forgot your password?` link.
   - `Sign in` full-width button (`#0052cc` / `#1d4ed8`, rounded 8px, `#ffffff` text, font-weight 600).
3. **Footer**:
   - Top border divider (`#f1f5f9`).
   - Shield Icon (`#0052cc`, 32px) + 2 text lines:
     - `Secure. Official. Committed to Fair Trade.`
     - `Protecting Consumers. Supporting Businesses.`
   - Bottom Philippine Flag tri-color accent bar (Blue `#0038a8`, Yellow `#fcd116`, Red `#ce1126`).

---

## 2. Verification Plan
1. `npm run build` in `web/` (0 errors).
2. `npm test -- --run` in `web/` (8/8 tests pass).
3. Push to GitHub `main`.
4. Deploy to Vercel production (`https://web-plum-sigma-99.vercel.app`).
