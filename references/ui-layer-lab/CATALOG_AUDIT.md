# UI Layer Lab Catalog Audit

Last updated: 2026-07-09

## Current Coverage

- Example files: 500
- Exposed representative examples: 64
- Categories: 8
- Exposed per category: 8 each
- Variant groups: 8
- Archived variant ids: 63
- Unique files covered by representative or archived ids: 104
- Files not yet represented or archived: 396

## Status

This is a recovery checkpoint, not a completion report.

The previous catalog exposed only 16 examples, with every category showing exactly 2 examples. That was too aggressive for "deduplicate similar examples" and removed useful browsing diversity. The catalog now exposes 64 representative examples across the same 8 topics so the sidebar no longer looks artificially reduced.

The remaining 396 files still need additional catalog passes:

- merge truly duplicate patterns into existing representatives;
- promote unique patterns to representative examples when they teach a different UI or interaction;
- archive near-duplicates under the closest representative;
- remove or rewrite low-quality examples that cannot meet interaction, theme, or localization standards.

## Minimum Gate For Completion

- No category may expose fewer than 6 representative examples. Current catalog exposes 8 per category.
- React Flow representatives must support real node dragging and edge creation.
- Code panels must be compact when closed and show source only when opened.
- Light and dark mode must apply inside the preview content, not only the outer shell.
- Unclassified files must trend down on every catalog pass.
