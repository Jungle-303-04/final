import { Activity } from "lucide-react";
import { useI18n } from "../shared/i18n";
import { Badge } from "../shared/ui/primitives/badge";
import { SidebarHeader, SidebarText } from "../shared/ui/primitives/sidebar";
import { ProductSidebarTrigger } from "./ProductShellSidebar";

interface ProductShellBrandProps {
  isMobile: boolean;
  mode: "api" | "demo";
}

export function ProductShellBrand({ isMobile, mode }: ProductShellBrandProps) {
  const { t } = useI18n();

  return (
    <SidebarHeader className="h-14 flex-row items-center gap-2 px-2 py-0">
      <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[state=collapsed]/sidebar:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary-soft-border bg-primary-soft text-primary-soft-foreground">
          <Activity aria-hidden="true" className="size-4" />
        </span>
        <SidebarText className="text-sm font-semibold tracking-tight">
          {t("product.name")}
        </SidebarText>
        {mode === "demo" ? (
          <Badge className="h-4 px-1.5 text-[0.625rem]" variant="secondary">
            {t("shell.demo.badge")}
          </Badge>
        ) : null}
      </div>
      {!isMobile ? <ProductSidebarTrigger labelMode="sr-only" /> : null}
    </SidebarHeader>
  );
}
