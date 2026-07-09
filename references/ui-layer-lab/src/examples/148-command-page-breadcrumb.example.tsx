import { Command } from "cmdk";
import { useState } from "react";

type PageKey = "root" | "jobs" | "files" | "ai";

const pages: Record<PageKey, Array<{ label: string; next?: PageKey }>> = {
  root: [
    { label: "작업", next: "jobs" },
    { label: "파일", next: "files" },
    { label: "AI", next: "ai" }
  ],
  jobs: [{ label: "실패한 실행" }, { label: "실행 중인 작업" }, { label: "대기열" }],
  files: [{ label: "변경 파일" }, { label: "설정 파일" }],
  ai: [{ label: "설명" }, { label: "수정" }, { label: "요약" }]
};

const pageLabels: Record<PageKey, string> = {
  root: "홈",
  jobs: "작업",
  files: "파일",
  ai: "AI"
};

export default function CommandPageBreadcrumbExample() {
  const [page, setPage] = useState<PageKey>("root");

  return (
    <Command className="command-dialog inline-command">
      <div className="command-breadcrumb">
        <button onClick={() => setPage("root")} type="button">홈</button>
        {page !== "root" ? <span>/ {pageLabels[page]}</span> : null}
      </div>
      <Command.Input placeholder="페이지 검색..." />
      <Command.List>
        <Command.Group heading={pageLabels[page]}>
          {pages[page].map((item) => (
            <Command.Item key={item.label} onSelect={() => item.next && setPage(item.next)}>
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
