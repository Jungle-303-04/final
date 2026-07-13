# Third-Party Notices

## shadcn/ui

- Project: https://github.com/shadcn-ui/ui
- Source revision: `21e4ceb94418096e21a7f1990027741a8f9b085d`
- License: MIT
- Local license copy: `vendor/shadcn/LICENSE.md`

Product-owned adaptations in `src/product/shared/ui/primitives/` use the following generated Base Nova
components as implementation references:

| Upstream-derived source | Product-owned target | Material changes |
|---|---|---|
| `src/components/ui/button.tsx` | `src/product/shared/ui/primitives/button.tsx` | product-relative utility import, reduced size variants |
| `src/components/ui/button-group.tsx` | `src/product/shared/ui/primitives/button-group.tsx` | product-relative utility import, required accessible group name, protected neutral group/text/separator semantics, parent-derived separator direction, slot-relative boundaries, forced-colors disabled/focus treatment |
| `src/components/ui/badge.tsx` | `src/product/shared/ui/primitives/badge.tsx` | product-relative utility import, reduced variants |
| `src/components/ui/separator.tsx` | `src/product/shared/ui/primitives/separator.tsx` | product-relative utility import |
| `src/components/ui/tooltip.tsx` | `src/product/shared/ui/primitives/tooltip.tsx` | product-relative utility import, compact transition and positioning surface |
| `src/components/ui/dialog.tsx` | `src/product/shared/ui/primitives/dialog.tsx` | product-relative imports, Base UI 1.6 focus treatment and iOS backdrop coverage |
| `src/components/ui/kbd.tsx` | `src/product/shared/ui/primitives/kbd.tsx` | product-relative utility import, corrected `KbdGroup` element prop type |
| `src/components/ui/table.tsx` | `src/product/shared/ui/primitives/table.tsx` | product-relative utility import |
| `src/components/ui/tabs.tsx` | `src/product/shared/ui/primitives/tabs.tsx` | product-relative utility import, nullable controlled/uncontrolled selection with change details, required tablist name, protected root/list/tab/panel semantics, validated default/line variants, reduced-motion and forced-colors treatment |
| `src/components/ui/toggle.tsx` | `src/product/shared/ui/primitives/toggle.tsx` | product-relative utility import, compact icon size variant |
| `src/components/ui/alert.tsx` | `src/product/shared/ui/primitives/alert.tsx` | product-relative utility import, overridable live-region role |
| `src/components/ui/empty.tsx` | `src/product/shared/ui/primitives/empty.tsx` | product-relative utility import, semantic paragraph correction |
| `src/components/ui/skeleton.tsx` | `src/product/shared/ui/primitives/skeleton.tsx` | product-relative utility import, hidden decorative default and reduced-motion behavior |
| `src/components/ui/spinner.tsx` | `src/product/shared/ui/primitives/spinner.tsx` | product-relative utility import, localized status label, decorative mode, and reduced-motion behavior |
| `src/components/ui/card.tsx` | `src/product/shared/ui/primitives/card.tsx` | product-relative utility import, neutral title/description semantics, protected slot and size markers |
| `src/components/ui/progress.tsx` | `src/product/shared/ui/primitives/progress.tsx` | product-relative utility import, fixed accessible 0–100 contract, indeterminate and forced-colors treatment |
| `src/components/ui/item.tsx` | `src/product/shared/ui/primitives/item.tsx` | product-relative utility import, explicit native action contract, context-owned neutral group semantics, protected slot/variant/size markers, forced-colors disabled state |
| `src/components/ui/scroll-area.tsx` | `src/product/shared/ui/primitives/scroll-area.tsx` | product-relative utility import, required accessible viewport name, deterministic axis contract, Base UI overflow-owned focusability, protected viewport/content structure |
| `src/components/ui/sidebar.tsx` | `src/product/shared/ui/primitives/sidebar.tsx` | split product-owned state/layout module, explicit desktop/mobile controlled state, Dialog mobile drawer, localized action labels, no cookie/global shortcut/random/inline style, reduced-motion and forced-colors treatment |
| `src/components/ui/sidebar.tsx` | `src/product/shared/ui/primitives/sidebar-menu.tsx` | split product-owned semantic menu module, stable NavLink render composition, collapsed desktop-only tooltip, mobile close-on-navigation, protected active/disabled states |
| `src/components/ui/sidebar.tsx` | `src/product/shared/ui/primitives/sidebar-menu-contract.ts` | extracted runtime contract guards for neutral landmarks and polymorphic render elements; canonical state and capture-handler bypass protection |
| `src/index.css` Base Nova variables | `src/product/styles/tokens.css` | lab/vendor sources removed, product-only source scan, two-theme contract, product status aliases |

The product does not import the generated catalog or vendor snapshot at runtime. These adaptations are
maintained as product source and retain the upstream MIT notice through this file and the local license copy.
