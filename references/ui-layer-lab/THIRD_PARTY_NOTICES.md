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
| `src/components/ui/badge.tsx` | `src/product/shared/ui/primitives/badge.tsx` | product-relative utility import, reduced variants |
| `src/components/ui/separator.tsx` | `src/product/shared/ui/primitives/separator.tsx` | product-relative utility import |
| `src/components/ui/tooltip.tsx` | `src/product/shared/ui/primitives/tooltip.tsx` | product-relative utility import, compact transition and positioning surface |
| `src/components/ui/dialog.tsx` | `src/product/shared/ui/primitives/dialog.tsx` | product-relative imports, Base UI 1.6 focus treatment and iOS backdrop coverage |
| `src/components/ui/kbd.tsx` | `src/product/shared/ui/primitives/kbd.tsx` | product-relative utility import, corrected `KbdGroup` element prop type |
| `src/components/ui/table.tsx` | `src/product/shared/ui/primitives/table.tsx` | product-relative utility import |
| `src/components/ui/toggle.tsx` | `src/product/shared/ui/primitives/toggle.tsx` | product-relative utility import, compact icon size variant |
| `src/index.css` Base Nova variables | `src/product/styles/tokens.css` | lab/vendor sources removed, product-only source scan, two-theme contract, product status aliases |

The product does not import the generated catalog or vendor snapshot at runtime. These adaptations are
maintained as product source and retain the upstream MIT notice through this file and the local license copy.
