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
      <nav aria-label="대표 카테고리">
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
        <small>대표 예제만 노출하고 유사 변형은 archive로 묶었습니다.</small>
      </div>
    </aside>
  );
}
