# Phase 2: React Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a React web application with Vite and TypeScript, implement premium Vanilla CSS styling, configure Axios for Laravel Sanctum API consumption, and build the onboarding map, charts, and rebuttal screens.

**Architecture:** A single-page application (SPA) consuming Laravel API endpoints. Employs Leaflet.js for interactive mapping, Chart.js for data visualization, and Vanilla CSS variables for a premium dark-mode/glassmorphism design system.

**Tech Stack:** React, TypeScript, Vite, Axios, Leaflet.js, Chart.js, Vanilla CSS.

---

## Plan Decomposition

### Task 1: Scaffold React App and Design System

**Files:**
- Create: `web/src/index.css`
- Create: `web/src/App.tsx`
- Create: `web/package.json`

- [ ] **Step 1: Check create-vite help options**
  Run:
  ```powershell
  npx create-vite@latest --help
  ```
  Expected: Displays available templates and options.

- [ ] **Step 2: Scaffold Vite project**
  Create a directory `web` and run:
  ```powershell
  npx -y create-vite@latest web --template react-ts
  ```
  Expected: Project scaffolded successfully in `/web`.

- [ ] **Step 3: Setup Design System tokens**
  Write a custom premium Vanilla CSS variable system in `web/src/index.css`:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

  :root {
      --font-primary: 'Outfit', sans-serif;
      --bg-dark: #09090b;
      --bg-card: rgba(20, 20, 25, 0.6);
      --border-color: rgba(255, 255, 255, 0.08);
      --primary: #f59e0b; /* Amber */
      --primary-hover: #d97706;
      --accent: #ef4444; /* Alert Red */
      --text-main: #f4f4f5;
      --text-muted: #a1a1aa;
      --glass-blur: blur(12px);
  }

  body {
      margin: 0;
      font-family: var(--font-primary);
      background-color: var(--bg-dark);
      color: var(--text-main);
      overflow-x: hidden;
  }
  ```

- [ ] **Step 4: Install dependencies**
  Run:
  ```powershell
  cd web
  npm install axios leaflet chart.js react-chartjs-2 @types/leaflet
  ```

- [ ] **Step 5: Verify build works**
  Run:
  ```powershell
  npm run build
  ```
  Expected: Build succeeds with 0 errors.

- [ ] **Step 6: Commit**
  Run:
  ```bash
  git add web
  git commit -m "feat: scaffold Vite React project and configure CSS variables"
  ```

---

### Task 2: Authentication and Axios Client Setup

**Files:**
- Create: `web/src/services/api.ts`
- Create: `web/src/components/Login.tsx`

- [ ] **Step 1: Create API Axios instance**
  Write an Axios client with Sanctum interceptor in `web/src/services/api.ts`:
  ```typescript
  import axios from 'axios';

  const api = axios.create({
      baseURL: 'http://localhost:8000/api', // local Laravel dev server
      headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
      }
  });

  api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
  });

  export default api;
  ```

- [ ] **Step 2: Implement Login UI**
  Create a login component `web/src/components/Login.tsx` with a premium glassmorphic dark interface, email/password validation, Axios authentication call, and token caching.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add web/src
  git commit -m "feat: add Axios client and Login component"
  ```

---

### Task 3: GIS Onboarding with Leaflet.js

**Files:**
- Create: `web/src/components/StoreOnboarding.tsx`

- [ ] **Step 1: Implement Store Onboarding Component**
  Create `web/src/components/StoreOnboarding.tsx` containing:
  - Form inputs: SEC Number, Store Name, Owner Name, Address.
  - Interactive Leaflet map container: allows the user to click to drop a pin, automatically updating the latitude/longitude input fields.
  - Onboard submission: submits coordinates and details to `/api/stores` (we will build this backend controller next).

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add web/src/components/StoreOnboarding.tsx
  git commit -m "feat: implement Leaflet store onboarding component"
  ```

---

### Task 4: DTI Temporal Analytics Dashboard (Volatily Charts)

**Files:**
- Create: `web/src/components/Dashboard.tsx`

- [ ] **Step 1: Implement Volatity Graph & Citizen Tips review**
  Create `web/src/components/Dashboard.tsx` containing:
  - **Temporal Charts**: Uses `react-chartjs-2` to render a 4-week line graph of price history vs. flat SRP baseline.
  - **State of Calamity Toggle**: A checkbox/switch to toggle the Laravel boolean settings `/api/calamity`. When checked, changes the dashboard background accent border colors to emergency crimson.
  - **Manual Review Queue**: Displays a list of reported receipts from `citizen_tips`. Allows DTI Admins to select and review extracted JSON texts.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add web/src/components/Dashboard.tsx
  git commit -m "feat: implement temporal charts and calamity settings"
  ```

---

### Task 5: Vendor Rebuttal Portal

**Files:**
- Create: `web/src/components/VendorPortal.tsx`

- [ ] **Step 1: Implement Rebuttal Portal Component**
  Create `web/src/components/VendorPortal.tsx` containing:
  - Displays issued notices (Letters of Inquiry or Show Cause Orders) in a responsive list.
  - Allows vendors to view the notice details and click to open the PDF.
  - File upload component: uploads rebuttal PDFs/images (`application/pdf`, `image/jpeg`, `image/png`) to Laravel's rebuttal endpoint.
  - Rebuttal validation: visually displays the remaining duration (48-hour countdown). Disables upload button with a "Notice Expired (403)" message if the timestamp is exceeded.

- [ ] **Step 2: Compile and Build check**
  Run:
  ```powershell
  npm run build
  ```
  Expected: Successful production build.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add .
  git commit -m "feat: implement Vendor Rebuttal portal and verify build"
  ```
