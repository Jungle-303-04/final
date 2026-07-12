import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { Toggle } from "../../shared/ui/primitives/toggle";

export function ResourcesToolbar({
  includeDeleted,
  namespace,
  onIncludeDeletedChange,
  onNamespaceChange,
  onSearchChange,
  search,
}: {
  includeDeleted: boolean;
  namespace: string | null;
  onIncludeDeletedChange: (value: boolean) => void;
  onNamespaceChange: (value: string | null) => void;
  onSearchChange: (value: string) => void;
  search: string;
}) {
  const [namespaceDraft, setNamespaceDraft] = useState(namespace ?? "");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setNamespaceDraft(namespace ?? "");
    });
    return () => { active = false; };
  }, [namespace]);

  function applyNamespace(event: FormEvent) {
    event.preventDefault();
    const value = namespaceDraft.trim();
    onNamespaceChange(value || null);
  }

  return (
    <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">표시된 결과 검색</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="표시된 결과 검색"
          className="pl-8"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="표시된 결과에서 이름과 상태 검색"
          type="search"
          value={search}
        />
      </label>
      <form className="flex min-w-0 gap-2" onSubmit={applyNamespace}>
        <label className="min-w-0 flex-1 lg:w-48 lg:flex-none">
          <span className="sr-only">Namespace 필터</span>
          <Input
            aria-label="Namespace 필터"
            onChange={(event) => setNamespaceDraft(event.target.value)}
            placeholder="Namespace"
            value={namespaceDraft}
          />
        </label>
        <Button size="sm" type="submit" variant="outline">적용</Button>
      </form>
      <Toggle
        aria-label="비활성 리소스 포함"
        onPressedChange={onIncludeDeletedChange}
        pressed={includeDeleted}
        variant="outline"
      >
        <SlidersHorizontal aria-hidden="true" data-icon="inline-start" />
        비활성 포함
      </Toggle>
    </div>
  );
}
