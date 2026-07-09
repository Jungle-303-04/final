import { Command } from "cmdk";
import { useState } from "react";

export default function CommandPagesExample() {
  const [page, setPage] = useState<"root" | "ai" | "git">("root");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder={page === "root" ? "액션을 검색하세요" : "현재 페이지 액션을 검색하세요"} />
      <Command.List>
        {page !== "root" ? (
          <Command.Item onSelect={() => setPage("root")}>← 뒤로</Command.Item>
        ) : null}

        {page === "root" ? (
          <Command.Group heading="페이지">
            <Command.Item onSelect={() => setPage("ai")}>AI 액션 →</Command.Item>
            <Command.Item onSelect={() => setPage("git")}>Git 액션 →</Command.Item>
          </Command.Group>
        ) : null}

        {page === "ai" ? (
          <Command.Group heading="AI 액션">
            <Command.Item>현재 화면 질문하기</Command.Item>
            <Command.Item>선택 로그 요약하기</Command.Item>
            <Command.Item>실패 원인 설명하기</Command.Item>
          </Command.Group>
        ) : null}

        {page === "git" ? (
          <Command.Group heading="Git 액션">
            <Command.Item>최신 변경 가져오기</Command.Item>
            <Command.Item>브랜치 푸시</Command.Item>
            <Command.Item>변경 diff 열기</Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
