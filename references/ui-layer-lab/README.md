# UI Layer Lab

실제 제품 코드와 분리된 예제 전용 샌드박스입니다.

이 앱은 shadcn/ui 문서처럼 실제 예제 preview와 접을 수 있는 code view를 보여주되, 긴 문서 스크롤 대신 주제별 카테고리 화면으로 나눕니다.

## 실행

```bash
cd references/ui-layer-lab
npm install
npm run dev
```

기본 URL은 `http://localhost:5180`입니다.

## 구조

```text
src/
  App.tsx                 # 카테고리 상태와 앱 shell
  components/             # viewer, code panel, sidebar, theme toggle
  styles/                 # token, layout, viewer, motion, example style
  examples/
    catalog.ts            # 노출 대표 예제 metadata
    registry.ts           # catalog 기반 lazy 등록
    types.ts
    01-command-basic.example.tsx
    ...
```

## 예제 추가 방법

`src/examples/12-my-example.example.tsx` 파일을 추가한 뒤 `catalog.ts`에 대표 예제로 등록하거나 기존 대표 예제의 `variantIds`로 묶습니다.

```tsx
export default function MyExample() {
  return <div>Working preview</div>;
}
```

파일명 앞 숫자는 참조용 순서가 되고, 화면 노출 여부는 `catalog.ts`가 결정합니다. 예제 파일 안에는 실제 예제 코드만 둡니다.

## 포함된 예제

현재 500개 예제 파일 중 64개 대표 예제를 노출합니다. 나머지는 archive/variant 후보로 유지합니다.

- 명령 팔레트와 오버레이
- AI 입력, 스트리밍, 근거, 도구 승인
- 작업 진행, Git 상태, 로그 tail
- workflow/job/step/log 드릴다운
- React Flow workflow, inspector, 편집 패턴
- 트리맵 히트맵과 차트 패턴
- motion 상태 전환
- 기본 컴포넌트와 안정된 컨트롤

## 참고한 구조

- [AI Elements Workflow](https://elements.ai-sdk.dev/examples/workflow)
- [shadcn/ui Command](https://ui.shadcn.com/docs/components/radix/command)
- [shadcn/ui Sonner](https://ui.shadcn.com/docs/components/radix/sonner)
- [shadcn/ui Charts](https://ui.shadcn.com/charts/area)
- [React Flow Examples](https://reactflow.dev/examples)
