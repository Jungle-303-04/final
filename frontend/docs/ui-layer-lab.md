# UI Layer Reference Lab

로컬 실행용 프론트 레퍼런스 모음입니다.

## 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173/dev/ui-layer-lab`를 엽니다.

## 폴더

- `src/dev/ui-layer-lab/index.tsx`: 랩 페이지와 탭 구성
- `src/dev/ui-layer-lab/data.tsx`: 외부 참고 출처, 모듈 목록, 샘플 데이터
- `src/dev/ui-layer-lab/types.ts`: 샘플 타입
- `src/dev/ui-layer-lab/icons.tsx`: 랩 전용 작은 SVG 아이콘
- `src/dev/ui-layer-lab/components/AiCommandPaletteDemo.tsx`: AI quick layer, command palette
- `src/dev/ui-layer-lab/components/AiWorkspacePanelDemo.tsx`: AI chat panel, plan, tool, artifact
- `src/dev/ui-layer-lab/components/GlobalJobCenterDemo.tsx`: git pull/push/deploy 전역 작업 센터
- `src/dev/ui-layer-lab/components/ExecutionDrilldownDemo.tsx`: workflow, job, step, log 드릴다운
- `src/dev/ui-layer-lab/components/ReactFlowReferenceDemo.tsx`: React Flow 공식 패턴 레퍼런스

## 참고 출처

- Raycast: 전역 핫키 런처
- shadcn Command, kbar: command palette 구조
- assistant-ui, CopilotKit, AI Elements: AI 대화, 도구 호출, generative UI
- Sonner: promise lifecycle toast
- Vercel Build Logs, GitHub Actions workflow logs: 긴 작업 로그와 드릴다운
- React Flow: node, edge, controls, minimap, background, panel, custom node, sub flow

외부 화면을 복제하지 않고, 우리 서비스에 맞는 재사용 컴포넌트 샘플로 재구성했습니다.
