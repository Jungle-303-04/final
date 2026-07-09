import { Command } from "cmdk";
import { useState } from "react";

export default function AnimatedCommandSearchSkeletonExample() {
  const [loading, setLoading] = useState(true);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="원격 액션을 검색하세요" />
      <Command.List>
        {loading ? (
          <div className="command-loading">원격 액션을 불러오는 중...</div>
        ) : (
          <Command.Group heading="원격 액션">
            <Command.Item>배포 로그 열기</Command.Item>
            <Command.Item>시각 검사 재시도</Command.Item>
          </Command.Group>
        )}
      </Command.List>
      <button className="command-trigger stable-wide" onClick={() => setLoading((value) => !value)} type="button">
        {loading ? "결과 표시" : "로딩 표시"}
      </button>
    </Command>
  );
}
