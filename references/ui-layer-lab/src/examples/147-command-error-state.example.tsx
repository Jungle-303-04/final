import { Command } from "cmdk";
import { useState } from "react";

export default function CommandErrorStateExample() {
  const [error, setError] = useState(false);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="원격 작업 검색..." onValueChange={(value) => setError(value.length > 4)} />
      <Command.List>
        {error ? (
          <div className="command-error">원격 검색에 실패했습니다. 다시 시도하세요.</div>
        ) : (
          <Command.Group heading="로컬">
            <Command.Item>로그 열기</Command.Item>
            <Command.Item>빌드 실행</Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
