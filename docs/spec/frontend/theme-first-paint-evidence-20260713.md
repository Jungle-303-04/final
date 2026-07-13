# 테마 첫 페인트 검증 — 2026-07-13

## 목적

저장된 제품 테마가 운영체제 테마와 반대일 때도 React 마운트 전에 올바른 배경을 적용해
새로고침 플래시가 발생하지 않는지 검증한다.

## 조건

- 대상: `http://127.0.0.1:5180/product`
- 뷰포트: 1440×960
- 저장 키: `kubeheal-theme`
- light 검증: 저장 테마 `light`, 시스템 테마 `dark`
- dark 검증: 저장 테마 `dark`, 시스템 테마 `light`
- 각 조건에서 새 브라우저 context로 5회 새로고침
- 각 새로고침의 최초 5개 `requestAnimationFrame`에서 `class`, `colorScheme`, 배경색 기록

## 결과

| 저장 테마 | 새로고침 | 최초 5프레임 클래스 | `colorScheme` | 배경 |
|---|---:|---|---|---|
| light | 5/5 | `""` | `light` | `oklch(1 0 0)` |
| dark | 5/5 | `dark` | `dark` | `oklch(0.145 0 0)` |

모든 프레임의 배경은 불투명했고 프레임 사이 값 변화가 없었다. 인수 조건인 새로고침 플래시 0을
충족한다.

## 연속 증거

- light: `theme-flash-light-1.png` ~ `theme-flash-light-5.png`
- dark: `theme-flash-dark-1.png` ~ `theme-flash-dark-5.png`

각 파일은 독립 새로고침의 최초 페인트 증거다.
