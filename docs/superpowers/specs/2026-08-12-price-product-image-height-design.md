# Price Product Image Scale Design

## Goal

Make product images visibly smaller overall after the height-only adjustment proved ineffective for width-constrained images.

## Approved Design

Restore the original responsive image boxes:

- Default height: `calc(100% + 18px)`
- Up to 360px height: `calc(100% + 14px)`
- From 520px height: `calc(100% + 20px)`

Apply `scale(0.92)` alongside the existing centering transform. The uniform 8% reduction affects both rendered dimensions regardless of whether `object-fit: contain` is constrained by width or height.

Keep image box width, horizontal position, `object-fit: contain`, card dimensions, text layout, and SRP panel unchanged. The card continues clipping the image underlay at its rounded boundary.

## Verification

Update the existing responsive SRP card regression test before changing CSS. It must require the uniform scale and restored responsive height boxes. Verify the focused SRP test, full Customer PWA suite, lint, and production build.
