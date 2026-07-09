import { Command } from "cmdk";
import { useState } from "react";

export default function CommandProgressiveDisclosureExample() {
  const [advanced, setAdvanced] = useState(false);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="액션 검색..." />
      <Command.List>
        <Command.Group heading="기본">
          <Command.Item>로그 열기</Command.Item>
          <Command.Item>실패 원인 설명</Command.Item>
          <Command.Item onSelect={() => setAdvanced((value) => !value)}>
            <span>{advanced ? "고급 명령 숨기기" : "고급 명령 표시"}</span>
            <kbd>⌘.</kbd>
          </Command.Item>
        </Command.Group>
        {advanced ? (
          <Command.Group heading="고급">
            <Command.Item>캐시 초기화</Command.Item>
            <Command.Item>강제 재빌드</Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
