# PRICE-Watch DTI Admin Portal Blue Palette & Sidebar Design Spec

## 1. Overview
This specification details the UI/UX redesign of the **PRICE-Watch DTI Admin & Vendor Web Portal (`web/`)**. Inspired by the color palette and sidebar structure of the user's reference prototype (`DTI-ui/image.png`), the design applies a rich royal blue sidebar theme, clean ice-white workspace surfaces, left-accent metric cards, and rounded royal blue action badges to the DTI Price Act regulatory domain.

---

## 2. Color Palette System (Inspired by Prototype)

| Element / Token | Color Hex / Value | Description |
| :--- | :--- | :--- |
| `--sidebar-bg` | `linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%)` | Rich Deep Blue to Royal Blue gradient sidebar |
| `--sidebar-text` | `#ffffff` | Primary sidebar text |
| `--sidebar-muted` | `#bfdbfe` | Sidebar section headers & subtitle text |
| `--sidebar-active` | `rgba(255, 255, 255, 0.18)` | Active menu item pill background |
| `--bg-main` | `#f1f5f9` | Soft Crisp Ice White / Slate page background |
| `--bg-card` | `#ffffff` | Pure White panel surfaces |
| `--border-color` | `#e2e8f0` | Subtle clean card borders |
| `--primary-blue` | `#1d4ed8` | Primary brand accent & button fill |
| `--text-dark` | `#0f172a` | High-contrast dark slate body text |
| `--text-muted` | `#64748b` | Muted subtitles & labels |

### Left-Border Metric Accents
- **Compliant / Released**: Emerald Green (`#059669`)
- **Pending Review**: Warning Amber (`#f59e0b`)
- **Active LOIs**: Royal Blue (`#2563eb`)
- **Escalated SCOs**: Royal Purple (`#8b5cf6`)
- **Resolved Cases**: Dark Teal (`#0d9488`)

---

## 3. Sidebar Architecture & Menu Structure

### Left Sidebar (Fixed 260px Width)
- **Header**: DTI Seal logo + `PRICE-Watch Regulation` + `DTI Officer Portal` + Collapse toggle button (`‹`).
- **User Profile Pill**: Translucent dark card (`rgba(0, 0, 0, 0.2)`) with circular avatar initial (`E`), officer name (*Elsie Elizalde*), and role badge (*DTI Evaluator*).
- **Categorized Menu Groups**:
  - `MAIN MENU`
    - 📊 **Dashboard Overview** (Active)
    - 📍 **GIS & Establishments** (Expandable `v`)
  - `REGULATORY ENGINE`
    - 📈 **Temporal Volatility Graphs** (Expandable `v`)
    - 🧾 **Consumer OCR Review Queue** (Expandable `v`)
    - ⚖️ **Legal Engine & LOI/SCO Notices** (Expandable `v`)
  - `SYSTEM`
    - 🚨 **State of Calamity Control**
- **Bottom Action**: Fixed `Logout` button with exit door icon.

---

## 4. Top Header & Main Content Area

### Top Header Bar
- **Left**: Home icon badge + `DTI Officer Dashboard` title + `DTI Antique Provincial Office` subtitle.
- **Right**: Blue pill `Messages` button + User profile avatar pill.

### Main Content Grid
- **Greeting Banner**: `Good Evening, Officer.`
- **5-Metric Card Row**: White cards with colored left borders (Compliant, Pending Scans, Active LOIs, Escalated SCOs, Resolved Cases).
- **Quick Access Grid**: 4 action cards with rounded royal blue icon badges (`#1d4ed8`), short module descriptions, and blue `Open module →` links.
- **Detailed Module Workspaces**:
  - GIS Store Leaflet Map with CartoDB Light tiles.
  - 4-Week Volatility Graphs vs SRP Baseline.
  - OCR Citizen Receipt Review Modal.
  - DomPDF LOI & SCO Notice Dispatch Manager.

---

## 5. Verification & Deployment Plan
1. **Local Build**: Run `npm run build` in `web/` to verify zero TypeScript or Vite errors.
2. **Test Suite**: Run `npm test` to verify Vitest suites pass.
3. **Git Commit**: Commit changes to `main` branch.
4. **Vercel Production Deployment**: Deploy via `npx vercel --prod` to `https://web-plum-sigma-99.vercel.app`.
