import type { ComponentProps } from "react";
import {
  siArgo,
  siGithub,
  siPostgresql,
  siRedis,
  type SimpleIcon,
} from "simple-icons/icons";

import { ProviderLogo } from "@/shared/brand/ProviderLogo";
import { cn } from "@/shared/lib/cn";
import "./brand.css";

export type BrandIconKind =
  | "argocd"
  | "aws"
  | "github"
  | "postgresql"
  | "redis";

const simpleIconByBrand: Readonly<
  Record<Exclude<BrandIconKind, "aws">, SimpleIcon>
> = {
  argocd: siArgo,
  github: siGithub,
  postgresql: siPostgresql,
  redis: siRedis,
};

export interface BrandIconProps extends Omit<ComponentProps<"svg">, "children"> {
  brand: BrandIconKind;
  label: string;
}

export function BrandIcon({
  brand,
  className,
  label,
  ...props
}: BrandIconProps) {
  if (brand === "aws") {
    return (
      <span
        aria-label={label}
        className={cn("brand-icon inline-grid size-5 place-items-center", className)}
        data-brand={brand}
        role="img"
      >
        <ProviderLogo className="h-3.5 w-5" provider="eks" />
      </span>
    );
  }

  const icon = simpleIconByBrand[brand];
  return (
    <svg
      {...props}
      aria-label={label}
      className={cn("brand-icon size-5 shrink-0", className)}
      data-brand={brand}
      fill="currentColor"
      role="img"
      viewBox="0 0 24 24"
    >
      <path d={icon.path} />
    </svg>
  );
}

type NamedBrandIconProps = Omit<BrandIconProps, "brand">;

export function AwsBrandIcon(props: NamedBrandIconProps) {
  return <BrandIcon {...props} brand="aws" />;
}

export function GitHubBrandIcon(props: NamedBrandIconProps) {
  return <BrandIcon {...props} brand="github" />;
}

export function RedisBrandIcon(props: NamedBrandIconProps) {
  return <BrandIcon {...props} brand="redis" />;
}

export function PostgreSqlBrandIcon(props: NamedBrandIconProps) {
  return <BrandIcon {...props} brand="postgresql" />;
}

export function ArgoCdBrandIcon(props: NamedBrandIconProps) {
  return <BrandIcon {...props} brand="argocd" />;
}
