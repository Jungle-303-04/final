import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbPage,
  Button,
  MOTION_DURATION_MS,
  MOTION_RECIPE,
  NativeSelect,
  NativeSelectOption,
  Separator,
  Spinner,
  cx,
} from ".";

describe("design-system contracts", () => {
  it("keeps native button semantics and exposes stable variant metadata", () => {
    const markup = renderToStaticMarkup(
      <Button size="sm" variant="outline">
        Inspect
      </Button>,
    );

    expect(markup).toContain('type="button"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-variant="outline"');
    expect(markup).toContain("ds-button--sm");
  });

  it("keeps native select semantics and a decorative icon convention", () => {
    const markup = renderToStaticMarkup(
      <NativeSelect aria-label="Metric" defaultValue="cpu">
        <NativeSelectOption value="cpu">CPU</NativeSelectOption>
      </NativeSelect>,
    );

    expect(markup).toContain("<select");
    expect(markup).toContain('aria-label="Metric"');
    expect(markup).toContain('data-icon="inline-end"');
    expect(markup).toContain('value="cpu" selected="">CPU</option>');
  });

  it("does not announce a decorative spinner but labels an independent loading state", () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain('aria-hidden="true"');

    const labelledMarkup = renderToStaticMarkup(<Spinner label="Loading topology" />);
    expect(labelledMarkup).toContain('role="status"');
    expect(labelledMarkup).toContain('aria-label="Loading topology"');
  });

  it("uses explicit accessibility roles for alerts, separators, and breadcrumb pages", () => {
    expect(renderToStaticMarkup(<Alert>Disconnected</Alert>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Separator />)).toContain('role="presentation"');
    expect(renderToStaticMarkup(<Separator decorative={false} />)).toContain('role="separator"');

    const breadcrumbMarkup = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbPage>Topology</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(breadcrumbMarkup).toContain('aria-label="Breadcrumb"');
    expect(breadcrumbMarkup).toContain('aria-current="page"');
  });

  it("centralizes semantic classes and motion durations", () => {
    expect(cx("base", false, undefined, "active")).toBe("base active");
    expect(renderToStaticMarkup(<Badge variant="success">Healthy</Badge>)).toContain('data-variant="success"');
    expect(MOTION_DURATION_MS.hierarchyMorph).toBe(360);
    expect(MOTION_DURATION_MS.zoomableHierarchy).toBe(750);
    expect(MOTION_RECIPE.zoomableHierarchy.duration).toBe(0.75);
    expect(MOTION_RECIPE.loading.duration).toBe(0.8);
  });
});
