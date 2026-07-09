import { useState } from "react";

const tags = ["라우트", "검사", "배포", "문서", "에이전트"];

export default function DrilldownTagCloudExample() {
  const [tag, setTag] = useState("라우트");

  return (
    <div className="tag-cloud-card">
      <div className="chip-row">
        {tags.map((item) => (
          <button className={tag === item ? "active" : ""} key={item} onClick={() => setTag(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <span>{tag} 기준으로 필터링 중</span>
    </div>
  );
}
