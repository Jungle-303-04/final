# UI Layer Lab

실제 제품 코드와 분리된 예제 전용 샌드박스입니다.

이 앱은 shadcn/ui나 AI Elements 문서처럼 `Preview`에 실제 동작 예제를 보여주고, 바로 아래 `Code`에 같은 예제 파일의 코드를 보여줍니다.

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
  App.tsx                 # Preview + Code 문서 뷰어
  styles.css              # 예제 공통 스타일
  examples/
    registry.ts           # 파일명 기반 자동 등록
    types.ts
    01-command-basic.example.tsx
    ...
```

## 예제 추가 방법

`src/examples/12-my-example.example.tsx` 파일을 추가하면 자동 등록됩니다.

```tsx
export default function MyExample() {
  return <div>Working preview</div>;
}
```

파일명 앞 숫자는 정렬 순서가 되고, 나머지는 제목이 됩니다. 예제 파일 안에는 실제 예제 코드만 둡니다.

## 포함된 예제

- `Command Basic`
- `AI Quick Input`
- `Assistant Drawer`
- `Job Progress Strip`
- `Job Log Drawer`
- `Workflow Drilldown`
- `Resource Drilldown`
- `Drilldown Picker`
- `Heatmap Drilldown`
- `React Flow Workflow`
- `React Flow Subflow`
- `Command Shortcuts`
- `Command Groups`
- `Command Scrollable`
- `Command Rtl`
- `Animated Overlay`
- `Animated Progress`
- `Animated Timeline`
- `Sonner Basic`
- `Sonner Types`
- `Sonner Description`
- `Sonner Position`
- `Sonner Action`

## 참고한 구조

- [AI Elements Workflow](https://elements.ai-sdk.dev/examples/workflow)
- [shadcn/ui Command](https://ui.shadcn.com/docs/components/radix/command)
- [React Flow Examples](https://reactflow.dev/examples)
