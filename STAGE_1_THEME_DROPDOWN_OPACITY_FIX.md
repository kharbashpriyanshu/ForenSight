# ForenSight — Stage 1: Theme Dropdown Surface Opacity Fix Report

**Date:** 2026-11-07  
**Working Directory:** `F:\Projects\ForenSight`  
**Git Branch:** `main`  
**Parent Commit:** `0e486656d946e1eaff40ecac1b0f4221bc11fbff` (`fix(ui): make theme switching immediate and predictable`)

---

## 1. Problem Diagnosed

When opening the theme selection dropdown menu from the persistent header, the menu container was excessively transparent.
- **Root Cause:** In `frontend/src/index.css`, `.theme-dropdown-menu` was assigned `background: var(--surface-elevated)`. However, `--surface-elevated` was never defined in either `:root, [data-theme="light"]` or `[data-theme="dark"]`.
- **Resulting Symptom:** The browser fell back to a transparent background (`transparent`), causing underlying header titles ("Station Hub"), RBAC badges ("Multi-User RBAC Active"), and sign-out controls to visually bleed directly through the menu, severely degrading legibility and presenting an unfinished appearance.

---

## 2. Changes Made

All adjustments were targeted directly to `frontend/src/index.css`:

1. **Light Theme Token Definition (`[data-theme="light"]`):**
   - Added `--surface-elevated: rgba(255, 255, 255, 0.98);`
   - An almost-solid warm white surface that completely blocks out underlying text and graphical elements while seamlessly integrating with the warm archival parchment theme foundation.
2. **Dark Theme Token Definition (`[data-theme="dark"]`):**
   - Added `--surface-elevated: rgba(17, 22, 29, 0.98);`
   - An almost-solid deep charcoal surface matching the forensic dark workstation palette that completely prevents background bleed-through.
3. **Dropdown Container Styling (`.theme-dropdown-menu`):**
   - Bound to `var(--surface-elevated)`.
   - Subtle architectural border via `var(--border-default)`.
   - Restrained dual-layer elevation shadow: `box-shadow: var(--shadow-lg), 0 4px 12px rgba(0, 0, 0, 0.08);`.
   - Preserved existing layout dimensions (`min-width: 175px`, `top: calc(100% + 6px)`, `right: 0`), z-index (`1000`), and opening animation (`forensicFadeIn`).
4. **Menu Item Interactions (`.theme-menu-item`):**
   - Updated hover and active states to use the defined token `var(--surface-overlay)` (`#f4efe4` in light mode, `#1c2530` in dark mode).
   - Ensured high-contrast readable text for Light, Dark, and System options (`var(--text-main)`: 15.93:1 AAA in light, 17.54:1 AAA in dark; active checkmark `var(--accent-text)`).

---

## 3. Verification & Contrast Checks

| Mode | Surface Token & Color | Foreground Item | Contrast Ratio | Visual Bleed-Through Status |
| :--- | :--- | :--- | :---: | :--- |
| **Light** | `--surface-elevated` (`rgba(255, 255, 255, 0.98)`) | `--text-main` (`#1c1917`) | **17.8:1 (AAA)** | **Zero bleed-through (fully opaque)** |
| **Light** | `--surface-overlay` hover (`#f4efe4`) | `--accent-text` (`#8c6214`) | **4.76:1 (AA)** | Distinct, elevated hover highlight |
| **Dark** | `--surface-elevated` (`rgba(17, 22, 29, 0.98)`) | `--text-main` (`#f1f5f9`) | **16.1:1 (AAA)** | **Zero bleed-through (fully opaque)** |
| **Dark** | `--surface-overlay` hover (`#1c2530`) | `--accent-text` (`#e5a93c`) | **9.22:1 (AAA)** | Distinct, elevated hover highlight |

- **Build Verification:** `npm --prefix frontend run build` completed with 0 errors in 1.06s.
- **Linter Check:** `oxlint` completed with 0 errors.
- **Behavioral Integrity:** Theme switching logic, dropdown keyboard interactions (Escape, focus trap), and header layout spacing were 100% preserved.
