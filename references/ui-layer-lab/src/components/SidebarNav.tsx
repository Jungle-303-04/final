import type { CategoryDefinition, RegisteredExample } from "../examples/types";

type CategoryGroup = CategoryDefinition & {
  archivedCount: number;
  examples: RegisteredExample[];
};

export function SidebarNav({
  activeCategory,
  groups,
  onSelect
}: {
  activeCategory: string;
  groups: CategoryGroup[];
  onSelect: (category: string) => void;
}) {
  return (
    <aside className="example-nav" aria-label="주제 선택">
      <strong>주제</strong>
      <nav aria-label="예제 카테고리">
        {groups.map((group) => (
          <button
            aria-current={group.id === activeCategory ? "page" : undefined}
            className={group.id === activeCategory ? "active" : ""}
            data-stable-control="sidebar"
            key={group.id}
            onClick={() => onSelect(group.id)}
            type="button"
          >
            <span>{group.label}</span>
            <small>{group.examples.length}</small>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <small>가능한 많이 노출하되, 같은 패턴만 정리 후보로 계속 묶습니다.</small>
      </div>
    </aside>
  );
}
