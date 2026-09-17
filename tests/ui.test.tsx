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

const notInstalledStatus: BridgeStatusResponse = {
  ...disconnectedStatus,
  fqgate: {
    ...disconnectedStatus.fqgate,
    lifecycle: "not_installed",
    process: { state: "not_running", running: false },
    version: null,
    compatibility: {
      version: null,
      status: "unknown",
      supported: false,
      validated: false,
      reason: "not installed",
    },
    health: {
      ...disconnectedStatus.fqgate.health,
      available: false,
      validPayload: false,
      httpStatus: null,
      networkReady: null,
      connected: null,
      session: "unknown",
      status: null,
      loginMethod: null,
    },
  },
  session: { state: "unknown", loginMethod: null },
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
    expect(screen.getByText("运行中")).toBeTruthy();
    expect(screen.getByText("是")).toBeTruthy();
    expect(screen.getByText("需要登录")).toBeTruthy();
    expect(screen.getByText("已验证")).toBeTruthy();
    expect(screen.getByRole("link", { name: "使用扫码登录" })).toBeTruthy();
  });

  it("explains the explicit FQGate install path when no managed binary exists", () => {
    render(
      <DashboardStatusView
        status={notInstalledStatus}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("尚未检测到 FQGate")).toBeTruthy();
    expect(screen.getByText("node .\\dist\\cli\\main.js fqgate install --dry-run")).toBeTruthy();
    expect(screen.getByText("扫码登录暂不可用")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /扫码登录/ })).toBeNull();
  });

  it("shows retry and loading states with accessible controls", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <DashboardStatusView status={undefined} isLoading={true} error={null} onRetry={retry} />,
    );
    expect(screen.queryByText("暂时无法读取桥接状态")).toBeNull();
    rerender(
      <DashboardStatusView
        status={undefined}
        isLoading={false}
        error={new Error("offline")}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /重试/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /生成 QR 码/ }));
    expect(onStart).toHaveBeenCalledTimes(1);

    rerender(
      <QrFlowView
        state={{ kind: "active", begin, isPolling: true }}
        onStart={onStart}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("img", { name: "FQGate 扫码登录二维码" })).toBeTruthy();
    expect(screen.getByText("等待扫码")).toBeTruthy();
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
    expect(screen.getByText("请在手机上确认")).toBeTruthy();

    rerender(<QrFlowView state={{ kind: "connected" }} onStart={onStart} onRetry={onRetry} />);
    expect(screen.getByText("行情会话已连接")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "FQGate 扫码登录二维码" })).toBeNull();

    rerender(
      <QrFlowView
        state={{ kind: "expired", message: "Flow expired" }}
        onStart={onStart}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /生成新的二维码/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a clear upstream failure without exposing implementation details", () => {
    render(
      <QrFlowView
        state={{ kind: "error", message: "FQGate 暂时不可用。" }}
        onStart={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("无法开始扫码登录");
    expect(screen.getByRole("alert").textContent).not.toContain("flow_id");
  });
});
