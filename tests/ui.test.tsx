// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardStatusView } from "../src/components/dashboard/status-view.js";
import { QrFlowView } from "../src/components/login/qr-flow.js";
import type { BridgeStatusResponse, QrBeginResponse } from "../src/bridge/contracts.js";

const disconnectedStatus: BridgeStatusResponse = {
  bridge: { state: "ready", version: "0.1.0", checkedAt: "2026-09-16T00:00:00.000Z" },
  fqgate: {
    lifecycle: "unhealthy",
    process: { state: "running", running: true, pid: 12 },
    version: "1.0.0",
    compatibility: {
      version: "1.0.0",
      status: "validated",
      supported: true,
      validated: true,
      reason: "test",
    },
    health: {
      available: true,
      validPayload: true,
      httpStatus: 200,
      networkReady: true,
      connected: false,
      session: "login_required",
      status: "ok",
      loginMethod: null,
      level2Permission: null,
      reason: null,
      activeSubscriptions: 0,
    },
  },
  session: { state: "login_required", loginMethod: null },
  lastCheckedAt: "2026-09-16T00:00:00.000Z",
};

const begin: QrBeginResponse = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  qr: { mediaType: "image/png", imageBase64: "aGVsbG8=" },
  status: "waiting_for_scan",
  createdAt: "2026-09-16T00:00:00.000Z",
  expiresAt: "2026-09-16T00:02:00.000Z",
};

afterEach(() => cleanup());

describe("operator dashboard UI", () => {
  it("separates process, network, compatibility, and session states", () => {
    render(
      <DashboardStatusView
        status={disconnectedStatus}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Login required")).toBeTruthy();
    expect(screen.getByText("Validated")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Restore with QR" })).toBeTruthy();
  });

  it("shows retry and loading states with accessible controls", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <DashboardStatusView status={undefined} isLoading={true} error={null} onRetry={retry} />,
    );
    expect(screen.queryByText("Bridge status is unavailable")).toBeNull();
    rerender(
      <DashboardStatusView
        status={undefined}
        isLoading={false}
        error={new Error("offline")}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("QR login UI state transitions", () => {
  it("moves from idle to scan, confirmation, connected, and terminal retry states", () => {
    const onStart = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <QrFlowView state={{ kind: "idle" }} onStart={onStart} onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate qr code/i }));
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(
      <QrFlowView
        state={{ kind: "active", begin, isPolling: true }}
        onStart={onStart}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("img", { name: "FQGate QR login code" })).toBeTruthy();
    expect(screen.getByText("Waiting for scan")).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    rerender(
      <QrFlowView
        state={{
          kind: "active",
          begin,
          poll: {
            sessionId: begin.sessionId,
            status: "waiting_for_confirmation",
            connected: false,
          },
          isPolling: true,
        }}
        onStart={onStart}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Confirm on device")).toBeTruthy();

    rerender(<QrFlowView state={{ kind: "connected" }} onStart={onStart} onRetry={onRetry} />);
    expect(screen.getByText("Session connected")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "FQGate QR login code" })).toBeNull();

    rerender(
      <QrFlowView
        state={{ kind: "expired", message: "Flow expired" }}
        onStart={onStart}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate a new code/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a clear upstream failure without exposing implementation details", () => {
    render(
      <QrFlowView
        state={{ kind: "error", message: "FQGate is temporarily unavailable." }}
        onStart={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("QR login could not start");
    expect(screen.getByRole("alert").textContent).not.toContain("flow_id");
  });
});
