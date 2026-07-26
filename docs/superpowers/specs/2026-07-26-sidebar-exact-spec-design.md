# PRICE-Watch DTI Admin Sidebar Component Exact Design Spec

## 1. Component Requirements

### Layout & Dimensions
- **Width**: `290px` (fixed on desktop, `100vh` height).
- **Layout**: Flexbox column (`display: flex; flex-direction: column; justify-content: space-between`).
- **Background Gradient**: `linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%)`.
- **Font Family**: `'Inter', sans-serif`.

### Color & Styling System
- **Base Text**: `rgba(255, 255, 255, 0.85)`
- **Active Item Indicator**: `3px solid #7dd3fc` left border with `rgba(255, 255, 255, 0.18)` background fill and `#ffffff` text.
- **Active Sub-Menu Item**: `rgba(125, 211, 252, 0.15)` background fill with `#e0f2fe` text and `3px solid #7dd3fc` left indicator line.
- **Hover Fill**: `rgba(255, 255, 255, 0.10)` with `#ffffff` text.
- **Muted Labels / Subtitles**: `rgba(255, 255, 255, 0.48)` (10px, uppercase, letter-spacing `0.1em`).
- **User Profile Card**: Surface `rgba(255, 255, 255, 0.09)` with `1px solid rgba(255, 255, 255, 0.12)`, `10px` border-radius, and `38px` avatar circle (`rgba(255, 255, 255, 0.2)` fill).
- **Dropdown Sub-Menu Container**: Inset background fill `rgba(0, 0, 0, 0.12)` when expanded, with smooth height transition.
- **Logout Button**: Bottom-pinned action, default `rgba(255, 255, 255, 0.08)` background, hover fill `rgba(220, 38, 38, 0.20)` with `#fca5a5` red text.
- **Mobile Overlay**: Backdrop fill `rgba(15, 23, 42, 0.55)` with smooth drawer slide-in transition (`transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)`).

---

## 2. Nav Menu Structure & Iconography (Lucide SVG Icons)

- **Header**: DTI Seal SVG / Emblem + Title (`PRICE-Watch`) + Subtitle (`DTI Officer Portal`).
- **User Profile Card**: Initial Avatar Circle (`E`) + Name (`user.name`) + Role Badge (`user.role`).
- **Menu Sections**:
  - `MAIN MENU` (rgba(255, 255, 255, 0.48), 10px uppercase)
    - `LayoutDashboard` SVG: Dashboard Overview (`overview`)
    - `MapPin` SVG: GIS Store Registry (`stores`)
  - `REGULATORY ENGINE`
    - `TrendingUp` SVG + Chevron: Price Regulation (`analytics`)
      - Sub-item: Four-Week Analytics (`analytics`)
      - Sub-item: SRP Bulletins (`srp`)
    - `Receipt` SVG: Consumer OCR Queue (`reports`)
    - `Scale` SVG + Chevron: Legal Engine (`legal`)
      - Sub-item: Notice Drafts (`legal`)
      - Sub-item: Audit Trail (`audit`)
  - `SYSTEM`
    - `Siren` SVG: Emergency Protocol (`emergency`)
- **Footer**: `LogOut` SVG + Pinned Logout Button.
