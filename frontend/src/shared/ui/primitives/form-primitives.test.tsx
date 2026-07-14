import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, FieldError, FieldLabel } from "./field";
import { Input } from "./input";

describe("product form primitives", () => {
  it("keeps label, input, invalid state, and error semantics explicit", () => {
    const markup = renderToStaticMarkup(
      <Field data-invalid="true">
        <FieldLabel htmlFor="email">이메일</FieldLabel>
        <Input aria-describedby="email-error" aria-invalid id="email" />
        <FieldError id="email-error">이메일을 확인하세요.</FieldError>
      </Field>,
    );

    expect(markup).toContain('data-slot="field"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('for="email"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("motion-reduce:transition-none");
    expect(markup).toContain('role="alert"');
  });

  it("does not render an empty error announcement", () => {
    expect(renderToStaticMarkup(<FieldError />)).toBe("");
  });
});

// @ts-expect-error Product primitives own their slot identity.
void <Input data-slot="other" />;
// @ts-expect-error Product primitives own group semantics.
void <Field role="presentation" />;
