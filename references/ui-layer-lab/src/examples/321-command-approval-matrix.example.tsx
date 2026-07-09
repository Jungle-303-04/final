import { Command } from "cmdk";
import { useState } from "react";

const approvals = [
  { action: "미리보기 배포", owner: "관리자", state: "허용됨" },
  { action: "프로덕션 푸시", owner: "릴리스 담당", state: "승인 필요" },
  { action: "시크릿 교체", owner: "운영 관리자", state: "차단됨" }
];

export default function CommandApprovalMatrixExample() {
  const [selected, setSelected] = useState(approvals[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="액션 권한을 확인하세요" />
        <Command.List>
          <Command.Group heading="승인 행렬">
            {approvals.map((approval) => (
              <Command.Item key={approval.action} onSelect={() => setSelected(approval)}>
                <span>{approval.action}</span>
                <kbd>{approval.owner}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{selected.action}</strong>
        <span>{selected.state}</span>
      </aside>
    </div>
  );
}
