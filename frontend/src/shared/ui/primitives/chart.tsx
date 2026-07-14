import * as React from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "../../lib/cn";

const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

export function ChartContainer({
  children,
  className,
  config,
  id,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <div
      className={cn(
        "flex aspect-video justify-center text-xs",
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
        "[&_.recharts-cartesian-grid_line]:stroke-border/45",
        "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
        "[&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden",
        className,
      )}
      data-chart={chartId}
      data-slot="chart"
      {...props}
    >
      <ChartStyle config={config} id={chartId} />
      <ResponsiveContainer initialDimension={{ height: 220, width: 360 }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function ChartStyle({ config, id }: { config: ChartConfig; id: string }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.theme ?? item.color);
  if (colorConfig.length === 0) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => `${prefix} [data-chart=${id}] {
${colorConfig.map(([key, item]) => {
  const color = item.theme?.[theme as keyof typeof item.theme] ?? item.color;
  return color ? `  --color-${key}: ${color};` : null;
}).filter(Boolean).join("\n")}
}`)
          .join("\n"),
      }}
    />
  );
}
