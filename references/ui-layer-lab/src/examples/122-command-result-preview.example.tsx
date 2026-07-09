import { Command } from "cmdk";
import { useState } from "react";

const results = [
  { name: "workflow.yaml", type: "파일", preview: "설치, 타입 검사, 빌드, 스모크 단계를 실행합니다." },
  { name: "deploy-preview", type: "실행", preview: "라우트 조회 후 visual-smoke 단계에서 실패했습니다." },
  { name: "target.md", type: "문서", preview: "대상 등록과 스케줄링 프로필 명세입니다." }
];

export default function CommandResultPreviewExample() {
  const [selected, setSelected] = useState(results[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="전체 결과 검색" />
        <Command.List>
          <Command.Group heading="결과">
            {results.map((item) => (
              <Command.Item key={item.name} onSelect={() => setSelected(item)}>
                <span>{item.name}</span>
                <kbd>{item.type}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.preview}</span>
      </aside>
    </div>
  );
}
