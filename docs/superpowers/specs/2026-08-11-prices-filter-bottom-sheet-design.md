# Prices Filter Bottom Sheet Design

## Goal

Restore the Customer PWA Prices filter experience as a compact mobile-first interface: retain the three regulatory classification pills, remove the always-visible category dropdown, and move multi-category selection into an accessible bottom sheet with staged Clear and Apply actions.

## Scope

This change is limited to the Customer PWA Prices section and its automated tests. It does not change commodity APIs, catalog data, price calculations, sorting semantics, the scanner, reporting, the shared navbar, or backend behavior.

## Existing Interface

The Prices page currently renders:

- the `All`, `Basic Necessities`, and `Prime Commodities` classification pills;
- an always-visible single-select `Category:` dropdown;
- a `Filters` button that expands an inline panel;
- a separate Sort control.

The inline panel supports only a single regulatory classification value and does not behave as a mobile bottom sheet.

## Approved Interface

### Page-level controls

The Prices page keeps the existing search field and the three rounded regulatory classification pills:

- `All`
- `Basic Necessities`
- `Prime Commodities`

The always-visible `Category:` dropdown is removed. The `Filters` button and the separate Sort control remain in their current two-column row.

The Filters badge shows:

- one count for each applied product category; and
- one additional count when the selected regulatory classification is not `All`.

Sorting is not counted as a filter because it remains a separate control and changes ordering rather than eligibility.

### Bottom-sheet structure

Pressing `Filters` opens a modal bottom sheet above a dimmed backdrop. The sheet contains, from top to bottom:

1. a centered drag handle;
2. a `Filters` heading;
3. an `X` close button in the top-right;
4. a labeled, vertically scrollable Category section;
5. one checkbox row per available category;
6. persistent `Clear filters` and `Apply filters` buttons above the device safe area.

The sheet may occupy up to approximately 75 percent of the dynamic viewport height. Its category list scrolls inside the sheet while the title and bottom actions remain visible. The sheet must not be obscured by the Customer PWA bottom navbar.

Each category row is at least 44 pixels high, has at least 8 pixels of separation from adjacent interactive controls, and exposes the category label and checked state to assistive technology. No separate `All categories` checkbox is required: no checked categories means all product categories are included.

### Staged multi-category selection

Applied and draft category selections are separate values:

- `appliedCategories: string[]` controls the visible product list.
- `draftCategories: string[]` controls checkboxes while the sheet is open.

Opening the sheet copies `appliedCategories` into `draftCategories`. Tapping a category toggles only the draft selection, allowing several categories to be selected before the visible result set changes.

`Apply filters` copies the draft selection into the applied selection and closes the sheet. Filtering uses OR semantics within the Category group: a product is included when its normalized category matches any applied category. Regulatory classification and category filters combine using AND semantics.

Examples:

- `Basic Necessities` plus `Canned Goods` shows products that satisfy both conditions.
- `Canned Goods` plus `Milk` shows products belonging to either selected category.
- no applied categories shows products from every category allowed by the selected regulatory pill.

`Clear filters` clears the draft category selections, but does not close the sheet or alter the currently visible result set until `Apply filters` is pressed. The page-level regulatory pills and the separate Sort control remain unchanged because they are not edited inside the sheet.

### Closing and cancellation

The following actions close the sheet without applying draft changes:

- tapping the `X` button;
- tapping the backdrop;
- pressing Escape;
- using the supported Android browser Back action;
- dragging the sheet downward past the dismissal threshold.

Cancellation restores draft values from the currently applied filters the next time the sheet opens.

Downward dismissal begins from the drag handle or sheet header. A downward gesture started inside the category list dismisses the sheet only when the list is already scrolled to the top. This prevents conflicts between category scrolling and sheet dismissal.

## Motion

The backdrop fades between transparent and dimmed over approximately 180 milliseconds. The sheet translates vertically over approximately 220 milliseconds when opening and slightly faster when closing. Motion uses transform and opacity only.

When `prefers-reduced-motion: reduce` is active, transitions complete immediately without sliding or fading.

## Accessibility and Input Behavior

The bottom sheet uses dialog semantics with an accessible `Filters` label and modal state. Opening the sheet:

- locks background page scrolling;
- moves focus into the sheet;
- keeps keyboard focus within the sheet; and
- records the Filters trigger for focus restoration.

Closing the sheet restores focus to the Filters button. The `X`, category rows, Clear, and Apply controls meet the 44-by-44-pixel minimum touch target. Keyboard users can toggle checkboxes, activate actions, and dismiss with Escape. Backdrop taps are distinguished from interactions inside the sheet.

## Component Boundaries

`SrpSearch` remains responsible for search, sorting, applied classification, applied categories, and the resulting commodity list.

A focused `PriceFilterSheet` component owns presentation and interaction for:

- draft multi-category selection;
- opening and closing animation state;
- focus management;
- scroll locking; and
- pointer-based downward dismissal.

The component receives the available categories and applied category values and emits either an Apply event with the complete staged category values or a Cancel event with no data mutation.

No third-party drawer or animation dependency is added. The implementation uses React state, pointer events, and scoped CSS so it follows the existing Customer PWA stack and keeps the bundle small.

## Data Flow

1. `SrpSearch` derives the sorted unique list of available category names from commodities.
2. The user opens Filters.
3. `PriceFilterSheet` initializes draft values from the applied filter values.
4. The user toggles any number of categories.
5. Clear changes only the draft values.
6. Apply sends the final draft values to `SrpSearch`, updates the product list, and closes the sheet.
7. X, backdrop, Escape, Back, or swipe-down closes the sheet without changing the applied values.

Category comparison trims whitespace and compares case-insensitively so equivalent API category labels behave consistently.

## Empty and Dynamic States

If no product categories are available, the sheet shows `No categories available` and keeps Apply enabled so the user can close the sheet normally.

If an applied category disappears after commodity data refresh, it is removed from the applied selection before filtering so the page cannot remain trapped in an impossible filter state.

After Apply, the existing Prices empty state is used when the combined filters produce no products. No backend error handling changes are required.

## Test Coverage

Automated tests must verify:

- the three page-level classification pills remain visible;
- the old always-visible Category dropdown is absent;
- Filters opens a modal bottom sheet with category checkboxes;
- several categories can be staged simultaneously;
- staged changes do not affect visible products before Apply;
- Apply commits the complete category selection;
- category filters use OR semantics and combine with classification using AND semantics;
- Clear resets draft category values without closing or applying;
- X, backdrop, Escape, and downward swipe discard draft changes;
- the badge counts applied categories plus a non-All classification and excludes sorting;
- focus enters the dialog and returns to Filters on close;
- background scrolling is locked only while the sheet is open;
- reduced-motion styling disables transitions; and
- the sheet actions include safe-area spacing and remain accessible above the shared navbar.

## Acceptance Criteria

The change is complete when the Customer PWA Prices page has no standalone Category dropdown, retains the three rounded classification pills, and provides staged multi-category filtering through a mobile bottom sheet. Users can clear or apply several category choices together, dismiss the sheet naturally without accidental application, and use the complete interaction with touch, keyboard, or assistive technology.
