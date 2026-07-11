import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, apiRequestNoContent } from "./client";

describe("API transport no-content contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([204, 205])(
    "accepts an empty %i response with the shared credential and CSRF policy",
    async (status) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status }),
      );

      await expect(apiRequestNoContent("/api/things/thing-1", {
        method: "DELETE",
      })).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledOnce();
      const [path, init] = fetchMock.mock.calls[0] ?? [];
      const headers = new Headers(init?.headers);
      expect(path).toBe("/api/things/thing-1");
      expect(init).toMatchObject({
        credentials: "include",
        method: "DELETE",
      });
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("x-service-csrf")).toBe("same-origin");
    },
  );

  it.each([
    ["an empty 200 response", emptyResponse(200)],
    ["a body on a 204 response", responseWithText(204, "{}")],
    ["a body on a 205 response", responseWithText(205, "null")],
    ["whitespace bytes on a 204 response", responseWithText(204, "   ")],
    ["whitespace bytes on a 205 response", responseWithText(205, "\r\n")],
  ])("rejects %s as an invalid no-content contract", async (_label, response) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(apiRequestNoContent("/api/things/thing-1", {
      method: "DELETE",
    })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: response.status,
    } satisfies Partial<ApiError>);
  });

  it("reuses structured HTTP error metadata for non-2xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      detail: {
        code: "rate_limited",
        detail: "Try again later.",
        retry_after: 17,
      },
    }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "99" },
    }));

    await expect(apiRequestNoContent("/api/things/thing-1", {
      method: "DELETE",
    })).rejects.toMatchObject({
      code: "rate_limited",
      detail: "Try again later.",
      kind: "rate-limited",
      retryAfter: 17,
      status: 429,
    } satisfies Partial<ApiError>);
  });

  it("preserves AbortError and does not retry a possibly-sent mutation", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    const controller = new AbortController();
    controller.abort();

    await expect(apiRequestNoContent("/api/things/thing-1", {
      method: "DELETE",
      signal: controller.signal,
    })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/things/thing-1",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserves AbortError while reading the response body", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const response = responseWithText(204, "");
    vi.mocked(response.text).mockRejectedValue(abortError);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(apiRequestNoContent("/api/things/thing-1", {
      method: "DELETE",
    })).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves the existing apiRequest empty-body rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(emptyResponse(200));

    await expect(apiRequest(
      "/api/things/thing-1",
      z.strictObject({ id: z.string() }),
    )).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function responseWithText(status: number, text: string): Response {
  return {
    headers: new Headers(),
    ok: true,
    status,
    statusText: "",
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response;
}
