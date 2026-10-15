// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useQrLogin } from "../src/hooks/use-qr-login.js";
import { beginQrLogin, pollQrLogin } from "../src/lib/api/client.js";
import type { QrBeginResponse, QrPollResponse } from "../src/bridge/contracts.js";
vi.mock("../src/lib/api/client.js", async (original) => ({
  ...(await original<object>()),
  beginQrLogin: vi.fn(),
  pollQrLogin: vi.fn(),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (sessionId: string): QrBeginResponse => ({
  sessionId,
  qr: { mediaType: "image/png", imageBase64: "aGVsbG8=" },
  status: "waiting_for_scan",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 120000).toISOString(),
});
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return renderHook(() => useQrLogin(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
});
describe("QR asynchronous ownership", () => {
  it.each(["success", "error"])("ignores late begin %s after cancel", async (kind) => {
    const request = deferred<QrBeginResponse>();
    vi.mocked(beginQrLogin).mockReturnValue(request.promise);
    const hook = setup();
    act(() => {
      hook.result.current.start();
      hook.result.current.start();
    });
    await waitFor(() => expect(beginQrLogin).toHaveBeenCalledTimes(1));
    act(() => hook.result.current.cancel());
    await act(async () => {
      if (kind === "success") request.resolve(response("old"));
      else request.reject(new Error("late"));
      await request.promise.catch(() => {});
    });
    await waitFor(() => expect(hook.result.current.viewState.kind).toBe("idle"));
    expect(pollQrLogin).not.toHaveBeenCalled();
  });
  it("ignores an old connected poll after cancel and a new begin", async () => {
    const oldPoll = deferred<QrPollResponse>();
    vi.mocked(beginQrLogin)
      .mockResolvedValueOnce(response("old"))
      .mockResolvedValueOnce(response("new"));
    vi.mocked(pollQrLogin).mockImplementation((id) =>
      id === "old"
        ? oldPoll.promise
        : Promise.resolve({ sessionId: "new", status: "waiting_for_scan", connected: false }),
    );
    const hook = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(pollQrLogin).toHaveBeenCalled());
    act(() => hook.result.current.cancel());
    act(() => hook.result.current.start());
    await waitFor(() =>
      expect(hook.result.current.viewState).toMatchObject({
        kind: "active",
        begin: { sessionId: "new" },
      }),
    );
    await act(async () => {
      oldPoll.resolve({ sessionId: "old", status: "connected", connected: true });
      await oldPoll.promise;
    });
    expect(hook.result.current.viewState).toMatchObject({
      kind: "active",
      begin: { sessionId: "new" },
    });
  });
  it("does not retry begin even when the query client defaults request retries", async () => {
    vi.mocked(beginQrLogin).mockRejectedValue(new Error("timeout"));
    const hook = setup();
    act(() => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.viewState.kind).toBe("error"));
    expect(beginQrLogin).toHaveBeenCalledTimes(1);
  });
});
