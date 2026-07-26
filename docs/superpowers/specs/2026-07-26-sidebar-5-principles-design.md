# PRICE-Watch DTI Admin Sidebar 5-Principle Refactor Spec

## 1. Architectural Goals
This specification refactors the DTI Admin Left Sidebar (`web/src/components/admin/AdminShell.tsx` and `web/src/components/admin/admin.css`) to enforce the 5 core design & engineering principles provided by the user.

---

## 2. The 5 Core Principles

### Principle 1: Color System & Aesthetics
- **Background Gradient**: `linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%)`.
- **Translucent Layers**: Translucent white fills (`rgba(255, 255, 255, 0.10)`) for hover states, card backgrounds (`rgba(255, 255, 255, 0.09)`), and borders (`rgba(255, 255, 255, 0.12)`).
- **Active Indicators**:
  - Main active item: `3px solid #7dd3fc` left border + `rgba(255, 255, 255, 0.18)` fill + `#ffffff` text.
  - Active sub-menu item: `rgba(125, 211, 252, 0.15)` fill + `#e0f2fe` text + `3px solid #7dd3fc` left border.
- **Section Labels**: Uppercase muted text (`10px`, `letter-spacing: 0.1em`, `color: rgba(255, 255, 255, 0.48)`).
- **Logout Action**: Hover fill `rgba(220, 38, 38, 0.20)` with soft-red text (`#fca5a5`).

### Principle 2: Exclusive Accordion State (One Open Dropdown)
- State `openCategory: string | null` in `AdminShell.tsx`.
- Clicking a category toggle button opens that category while automatically collapsing all other open category dropdowns. Clicking the currently open category toggles it closed (`null`).

### Principle 3: Smooth Sub-menu Expansion (`max-height` transition)
- CSS container `.nav-dropdown-container` uses `max-height` transition (`transition: max-height 0.25s ease, opacity 0.25s ease`).
- Collapsed state: `max-height: 0; opacity: 0; overflow: hidden; margin-top: 0; padding: 0;`.
- Expanded state: `max-height: 300px; opacity: 1; margin-top: 0.25rem; padding: 0.35rem 0;`.
- Background fill: `rgba(0, 0, 0, 0.12)`.
- Chevron icon rotates `180deg` (`transform: rotate(180deg)`).

### Principle 4: Fixed-Width Layout Stability & Custom Thin Scrollbar
- Fixed width `290px` with `overflow-x: hidden`.
- All text labels enforce `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`.
- Custom ultra-thin `4px` scrollbar:
  ```css
  .admin-sidebar::-webkit-scrollbar { width: 4px; }
  .admin-sidebar::-webkit-scrollbar-track { background: transparent; }
  .admin-sidebar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
  ```

### Principle 5: Responsiveness & Navigation Behavior
- Flexbox column layout (`display: flex; flex-direction: column; justify-content: space-between`).
- Pinned Top: Logo Header + User Profile Card (`rgba(255, 255, 255, 0.09)`).
- Middle (`flex: 1; overflow-y: auto`): Scrollable nav sections.
- Pinned Bottom: Logout action button.
- Mobile (`<768px`): Hidden off-screen (`transform: translateX(-100%)`), sliding in (`transform: translateX(0)`) with backdrop dimming overlay (`rgba(15, 23, 42, 0.55)`).

---

## 3. Verification & Deployment Plan
1. Build check: `npm run build` in `web/` (0 errors).
2. Test suite: `npm test -- --run` in `web/` (8/8 tests pass).
3. Push to GitHub `main` branch.
4. Deploy to Vercel production (`https://web-plum-sigma-99.vercel.app`).
