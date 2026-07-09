import { useState } from "react";

const branches = {
  failures: {
    label: "실패",
    items: ["시각 스모크", "배포 미리보기"]
  },
  warnings: {
    label: "경고",
    items: ["번들 크기"]
  },
  skipped: {
    label: "건너뜀",
    items: []
  }
};

export default function DrilldownEmptyBranchExample() {
  const [branch, setBranch] = useState<keyof typeof branches>("failures");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {Object.entries(branches).map(([item, value]) => (
          <button aria-pressed={branch === item} className={branch === item ? "row-button selected" : "row-button"} key={item} onClick={() => setBranch(item as keyof typeof branches)} type="button">
            {value.label}
          </button>
        ))}
      </div>
      <aside className="detail-panel stable-branch-detail">
        <strong>{branches[branch].label}</strong>
        {branches[branch].items.length ? branches[branch].items.map((item) => <span key={item}>{item}</span>) : <span>이 분기에는 항목이 없습니다.</span>}
      </aside>
    </div>
  );
}
