import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("../../src/server/db", () => ({ getDatabase: () => ({}) }));
vi.mock("../../src/server/auth/factory", () => ({ createAuth: () => ({}), createAuthHandler: () => handle }));
import { handleAuthRequest } from "../../src/server/auth/index";

afterEach(() => { vi.restoreAllMocks(); handle.mockReset(); });

it.each(["throw", "response"])("sanitizes authentication %s failures and returns a correlated reference", async failure => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const privateValue = "private-password-cookie-url";
  if (failure === "throw") handle.mockRejectedValueOnce(new Error(privateValue));
  else handle.mockResolvedValueOnce(new Response(privateValue, { status: 500, headers: { "set-cookie": privateValue } }));
  const response = await handleAuthRequest(new Request("https://example.invalid/api/auth/sign-in/email"));
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "auth.request", reference: body.reference });
  expect(JSON.stringify([body, output.mock.calls])).not.toContain(privateValue);
});

it.each([200, 401, 403, 429])("preserves normal authentication responses (%s) without unexpected-failure logs", async status => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const original = new Response("normal result", { status });
  handle.mockResolvedValueOnce(original);
  expect(await handleAuthRequest(new Request("https://example.invalid/api/auth/get-session"))).toBe(original);
  expect(output).not.toHaveBeenCalled();
});
