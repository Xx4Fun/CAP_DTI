# Customer Scanner Result Actions and Product Name Design

Date: 2026-08-10
Status: Approved

## Scope

Refine only the Customer PWA shelf-scanner comparison result. No backend response, catalog record, matching, OCR, or regulatory calculation changes are required.

## Result actions

The result actions will be rendered in normal document flow after the comparison content. They will not use fixed or sticky positioning. The page will retain enough bottom spacing for the shared mobile navigation, so every action remains reachable without being covered.

`Report using receipt` will appear only when the comparison is above the reference price. An above-reference result is one where `is_above_reference` is true or `comparison_status` is `ABOVE_SRP`.

The following actions remain available for every result:

- `Correct product or price`
- `Scan another item`
- `View price history`

For a matching or below-reference result, the report action is omitted. The positive result message, such as `Matches Current SRP baseline`, remains visible.

## Product display name

The result card will use the existing shared commodity display formatter instead of displaying the raw catalog string. The formatter keeps the consumer-facing final segment of a hyphen-delimited DTI catalog title.

Example:

- Raw catalog value: `Instant Mami Noodles - Chicken & Beef Flavor - Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)`
- Result display: `Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)`

If a name is not hyphen-delimited, it remains unchanged.

## Accessibility and mobile behavior

Buttons remain at least 42 pixels high, use visible text labels, and retain the existing color hierarchy. Normal-flow placement avoids overlap with the shared bottom navigation and allows the page to scroll naturally on small screens.

## Verification

Regression coverage will verify:

- above-reference results show `Report using receipt`;
- matching and below-reference results hide it;
- the result action container is not fixed or sticky;
- the requested Lucky Me catalog name is shortened correctly;
- existing correction, rescan, history, and report handoff behavior remains functional.

After the Customer PWA test suite and production build pass, the PWA will be redeployed to its existing Vercel production alias. The connected Render service will be redeployed without backend code changes as requested, followed by live PWA and API smoke checks.
