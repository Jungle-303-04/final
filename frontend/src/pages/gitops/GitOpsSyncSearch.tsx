import { Search, X } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";

export function GitOpsSyncSearch({
  onChange,
  query,
}: {
  onChange: (query: string) => void;
  query: string;
}) {
  const { t } = useI18n();
  return (
    <label className="relative block min-w-0 max-w-xl">
      <span className="sr-only">{t("workflows.sync.search.label")}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="h-10 pl-9 pr-10"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={t("workflows.sync.search.placeholder")}
        type="search"
        value={query}
      />
      {query ? (
        <Button
          aria-label={t("workflows.sync.search.clear")}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => onChange("")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </label>
  );
}
