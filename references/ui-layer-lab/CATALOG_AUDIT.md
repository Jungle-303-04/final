# UI Layer Lab Catalog Audit

Last updated: 2026-07-10

## Current Coverage

- Example files: 500
- Runtime exposed examples: 500
- Curated metadata overrides: 64 (not an exposure cap)
- Categories: 8
- Exposed per category: 71, 64, 129, 42, 53, 55, 65, 21
- Variant groups: 8
- Archived variant ids: 63
- Duplicate runtime ids: 0

## Status

This is a recovery checkpoint, not a completion report.

The previous catalog exposed only 16 examples, with every category showing exactly 2 examples. A later pass capped the page at 64 examples, 8 per category, which still misunderstood the goal. The current registry now exposes every available example file. The curated catalog is metadata only; it must never reduce the visible example count.

The remaining catalog work is quality curation, not hiding examples:

- merge only truly duplicate patterns into the closest exposed example;
- keep unique patterns visible when they teach a different UI or interaction;
- archive near-duplicates under the closest exposed example;
- remove or rewrite low-quality examples that cannot meet interaction, theme, or localization standards.

## Minimum Gate For Completion

- Runtime exposed count must equal the number of `.example.tsx` files.
- Duplicate runtime ids must stay at 0.
- React Flow exposed examples must support real node dragging and edge creation where the pattern claims editability.
- Code panels must be compact when closed and show source only when opened.
- Light and dark mode must apply inside the preview content, not only the outer shell.
- Mobile and desktop layouts must have no page-level horizontal overflow.
- Category switching and search must not crash the app or move scroll position unexpectedly.
- Stable controls must keep width and height across label/theme/code state changes.
- High-priority visible English samples must stay translated unless they are technical names.

## Latest Gate

- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run visual-quality`: passed
- Visual gate evidence: 500 exposed / 500 files, duplicate ids 0, category counts 71 / 64 / 129 / 42 / 53 / 55 / 65 / 21, data-viz search 55 -> 18, theme/code button delta 0, code panel closed height 65px, code source visible in 60ms in the latest verified run, light command preview `rgb(255, 255, 255)`, dark command preview `rgb(11, 11, 13)`, React Flow drag 105px, edge count 2 -> 3, source English matches 0, visible English samples checked 127 / violations 0, mobile overflow 0
- Screenshots: `output/playwright/visual-light-command.png`, `output/playwright/visual-dark-command.png`, `output/playwright/visual-flow.png`, `output/playwright/visual-mobile.png`
