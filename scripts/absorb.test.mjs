import assert from 'node:assert/strict'
import test from 'node:test'

import { findManualReviewItems, normalizeRelativePath, transformText } from './absorb.mjs'

test('명시한 투명도를 기본 투명도보다 우선한다', () => {
  const { output } = transformText(
    'bg-theme-hover/50 text-theme-text-tertiary ring-offset-theme-base var(--color-theme-surface)',
  )
  assert.equal(output, 'bg-accent/50 text-muted-foreground/75 ring-offset-background var(--card)')
})

test('옛 테마 별칭 정의는 제거하고 직접 참조만 시맨틱 변수로 바꾼다', () => {
  const { output } = transformText(
    '--color-theme-surface: var(--bg-surface);\n.value { color: var(--color-theme-text-primary); }',
  )
  assert.equal(output, '.value { color: var(--foreground); }')
})

test('상태 팔레트를 시맨틱 토큰으로 바꾼다', () => {
  const { output } = transformText(
    'text-red-400 bg-rose-500/20 border-amber-300 fill-yellow-400 stroke-emerald-500 ring-green-600/30',
  )
  assert.equal(
    output,
    'text-destructive bg-destructive/20 border-warning fill-warning stroke-success ring-success/30',
  )
})

test('브랜드 토큰과 이름을 제품 소유 표현으로 바꾼다', () => {
  const { output } = transformText(
    'bg-skyhook-500/30 var(--color-radar-accent) Radar radar Skyhook skyhook',
  )
  assert.equal(output, 'bg-primary/30 var(--primary) Opsia opsia Opsia opsia')
})

test('clsx import와 호출을 cn으로 바꾼다', () => {
  const { output } = transformText("import { clsx } from 'clsx'\nconst value = clsx('a')")
  assert.equal(output, "import { cn } from '@/shared/lib/cn'\nconst value = cn('a')")
})

test('출력 경로에서 원본 이름과 테마 폴더를 제거한다', () => {
  assert.equal(normalizeRelativePath('assets/radar/radar-icon-loading.svg'), 'assets/product/loading-icon.svg')
  assert.equal(normalizeRelativePath('theme/tailwind-theme.css'), 'styles/tailwind-semantic.css')
})

test('문맥이 필요한 팔레트는 바꾸지 않고 검토 목록에 남긴다', () => {
  const input = 'text-slate-400 bg-sky-100 border-theme-unmapped'
  const { output } = transformText(input)
  const review = findManualReviewItems(output, 'sample.tsx')
  assert.equal(output, input)
  assert.deepEqual(
    review.map(({ token, reason }) => [token, reason]),
    [
      ['text-slate-400', 'neutral-palette-needs-context'],
      ['bg-sky-100', 'sky-palette-needs-context'],
      ['border-theme-unmapped', 'unknown-theme-utility'],
    ],
  )
})
