#!/usr/bin/env node
// 데모 ↔ dev ↔ 백엔드 계약 3자 미러 정합 검증(MVP).
// 목적: 미러링 병합 시 더미와 실제 계약의 불일치를 커밋/게이트 단계에서 차단한다.
//
// 검증 규칙(status):
//   A(일치)      : backendSchema+backendField 가 실재(토큰 존재)해야 하고 devRef 파일이 있어야 한다.
//   B(UI有계약無): backendField 가 아직 없어야 한다(있으면 A로 재분류 경고). devRef 는 있어야 한다.
//   C(계약有UI無): backendSchema+backendField 가 실재해야 한다. devRef 는 없어도 된다(추가할 UI).
//   D(데모전용)  : 계약 검증 생략.
// 추가: 원장이 참조하는 스키마의 top-level 필드 중 어느 항목도 참조하지 않는 것을
//       "계약 있음·UI 없음(C 후보)"로 리포트(정보). --strict 시 C 후보도 실패 처리.
//
// 사용: node scripts/mirror-parity-check.mjs [--strict] [--ledger <path>]

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const ledgerIdx = args.indexOf("--ledger");
const LEDGER_PATH = ledgerIdx >= 0 ? args[ledgerIdx + 1] : "docs/mirroring/mirror-ledger.json";

const errors = [];
const warnings = [];
const infos = [];

function readText(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function hasToken(text, token) {
  if (!text) return false;
  // zod 필드는 `field: z...` 또는 배열 요소로 등장 — 단어 경계로 매칭
  const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`);
  return re.test(text);
}

function topLevelFields(schemaText) {
  // `  field: z...` 형태의 top-level 필드명(휴리스틱)
  const fields = new Set();
  for (const m of schemaText.matchAll(/^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)) {
    fields.add(m[1]);
  }
  return fields;
}

const ledgerText = readText(LEDGER_PATH);
if (!ledgerText) {
  console.error(`✗ 원장을 찾을 수 없습니다: ${LEDGER_PATH}`);
  process.exit(2);
}
const ledger = JSON.parse(ledgerText);
const apiDir = ledger.apiDir || "frontend/src/api";
const srcDir = ledger.srcDir || "frontend/src";
const entries = ledger.entries || [];

// 스키마 텍스트 캐시 + 참조 추적(미노출 필드 리포트용)
const schemaCache = new Map();
const referencedBySchema = new Map(); // schema -> Set(field)
function schemaText(schemaFile) {
  if (!schemaCache.has(schemaFile)) {
    // backendSchema 는 파일명(api/ 아래) 또는 srcDir 기준 상대경로 둘 다 허용한다.
    // (예: "recovery-schemas.ts" 또는 "features/resources/resourcesContract.ts")
    const text =
      readText(join(apiDir, schemaFile)) ?? readText(join(srcDir, schemaFile));
    schemaCache.set(schemaFile, text);
  }
  return schemaCache.get(schemaFile);
}

for (const e of entries) {
  const tag = `[${e.surface}] ${e.element} (${e.status})`;
  const needsContract = e.status === "A" || e.status === "C";
  const needsDev = e.status === "A" || e.status === "B";

  // 계약 검증
  if (needsContract) {
    if (!e.backendSchema || !e.backendField) {
      errors.push(`${tag}: status ${e.status}는 backendSchema+backendField 필수인데 비어있음`);
    } else {
      const st = schemaText(e.backendSchema);
      if (st == null) {
        errors.push(`${tag}: 스키마 파일 없음 → ${apiDir}/${e.backendSchema}`);
      } else if (!hasToken(st, e.backendField)) {
        errors.push(`${tag}: 계약 필드 '${e.backendField}' 가 ${e.backendSchema} 에 없음 (계약 드리프트 또는 오타)`);
      } else {
        if (!referencedBySchema.has(e.backendSchema)) referencedBySchema.set(e.backendSchema, new Set());
        referencedBySchema.get(e.backendSchema).add(e.backendField);
      }
    }
  }

  // B: 계약이 아직 없어야 함
  if (e.status === "B" && e.backendSchema && e.backendField) {
    const st = schemaText(e.backendSchema);
    if (st != null && hasToken(st, e.backendField)) {
      warnings.push(`${tag}: 계약 필드 '${e.backendField}' 가 이미 존재 → status A로 재분류 권장`);
    }
  }

  // dev 바인딩 검증(MVP: 파일 존재)
  if (needsDev) {
    if (!e.devRef) {
      errors.push(`${tag}: status ${e.status}는 devRef 필수인데 비어있음`);
    } else if (!existsSync(join(ROOT, srcDir, e.devRef))) {
      errors.push(`${tag}: dev 파일 없음 → ${srcDir}/${e.devRef}`);
    }
  }
}

// 미노출 계약 필드 리포트(C 후보): 원장이 참조한 스키마에 한해
for (const [schemaFile, refFields] of referencedBySchema.entries()) {
  const st = schemaText(schemaFile);
  if (!st) continue;
  const all = topLevelFields(st);
  const uncovered = [...all].filter((f) => !refFields.has(f));
  if (uncovered.length) {
    infos.push(`${schemaFile}: 원장 미참조 계약 필드(=UI 추가 후보 C) → ${uncovered.join(", ")}`);
  }
}

// 요약
const byStatus = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
console.log(`미러 원장: ${entries.length}개 항목 (A:${byStatus.A || 0} B:${byStatus.B || 0} C:${byStatus.C || 0} D:${byStatus.D || 0})`);
if (infos.length) {
  console.log("\n─ 정보(C 후보: 계약 있음·UI 없음) ─");
  for (const i of infos) console.log("  · " + i);
}
if (warnings.length) {
  console.log("\n─ 경고 ─");
  for (const w of warnings) console.log("  ! " + w);
}
if (errors.length) {
  console.log("\n─ 실패 ─");
  for (const er of errors) console.log("  ✗ " + er);
  console.error(`\n미러 정합 실패: ${errors.length}건`);
  process.exit(1);
}
if (STRICT && infos.length) {
  console.error(`\n--strict: 미노출 계약 필드 ${infos.length}건(C 후보) 미해결`);
  process.exit(1);
}
console.log("\n✓ 미러 정합 통과");
