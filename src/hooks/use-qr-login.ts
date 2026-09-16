import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { QrBeginResponse } from "../bridge/contracts.js";
import { BridgeApiError, beginQrLogin, pollQrLogin } from "../lib/api/client.js";
import type { QrFlowViewState } from "../components/login/qr-flow.js";

export function useQrLogin(): {
  readonly viewState: QrFlowViewState;
  readonly start: () => void;
  readonly retry: () => void;
} {
  const queryClient = useQueryClient();
  const [begin, setBegin] = useState<QrBeginResponse | undefined>();
  const [terminal, setTerminal] = useState<"expired" | "replaced" | undefined>();
  const [fatalError, setFatalError] = useState<string | undefined>();
  const [connected, setConnected] = useState<{ readonly loginMethod?: string } | undefined>();
  const beginMutation = useMutation({
    mutationFn: beginQrLogin,
    onMutate: () => {
      setBegin(undefined);
      setTerminal(undefined);
      setFatalError(undefined);
      setConnected(undefined);
    },
    onSuccess: (value) => setBegin(value),
    onError: (error) => setFatalError(messageForError(error)),
  });
  const poll = useQuery({
    queryKey: ["qr-flow", begin?.sessionId],
    queryFn: ({ signal }) => pollQrLogin(begin?.sessionId ?? "", signal),
    enabled: begin !== undefined && terminal === undefined,
    refetchInterval: (query) => {
      const error = query.state.error;
      if (error instanceof BridgeApiError && isTerminalCode(error.code)) return false;
      if (query.state.data?.status === "connected") return false;
      return 2_000;
    },
    refetchIntervalInBackground: false,
    retry: (failureCount, error) =>
      error instanceof BridgeApiError && error.code === "UPSTREAM_UNAVAILABLE" && failureCount < 1,
  });

  useEffect(() => {
    if (poll.data?.status === "connected" && connected === undefined) {
      const activeSessionId = begin?.sessionId;
      setConnected({
        ...(poll.data.loginMethod === undefined ? {} : { loginMethod: poll.data.loginMethod }),
      });
      setBegin(undefined);
      beginMutation.reset();
      if (activeSessionId !== undefined) {
        void queryClient.removeQueries({ queryKey: ["qr-flow", activeSessionId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["bridge", "status"] });
    }
    if (poll.error instanceof BridgeApiError && poll.error.code === "QR_FLOW_EXPIRED")
      setTerminal("expired");
    if (poll.error instanceof BridgeApiError && poll.error.code === "QR_FLOW_REPLACED")
      setTerminal("replaced");
    if (
      poll.error !== null &&
      poll.error !== undefined &&
      !isTerminalCode(poll.error instanceof BridgeApiError ? poll.error.code : "")
    )
      setFatalError(messageForError(poll.error));
  }, [begin, beginMutation, connected, poll.data, poll.error, queryClient]);

  const viewState = useMemo<QrFlowViewState>(() => {
    if (beginMutation.isPending) return { kind: "starting" };
    if (connected !== undefined) return { kind: "connected", ...connected };
    if (fatalError !== undefined && begin === undefined)
      return { kind: "error", message: fatalError };
    if (terminal !== undefined)
      return {
        kind: terminal,
        message:
          terminal === "expired"
            ? "The QR flow timed out before it was completed."
            : "A newer QR flow replaced this code.",
      };
    if (begin === undefined) return { kind: "idle" };
    return {
      kind: "active",
      begin,
      ...(poll.data === undefined ? {} : { poll: poll.data }),
      isPolling: poll.isFetching,
    };
  }, [begin, beginMutation.isPending, connected, fatalError, poll.data, poll.isFetching, terminal]);

  const start = () => {
    if (
      beginMutation.isPending ||
      (begin !== undefined && terminal === undefined && poll.data?.status !== "connected")
    )
      return;
    beginMutation.mutate();
  };
  const retry = () => {
    setBegin(undefined);
    setTerminal(undefined);
    setFatalError(undefined);
    setConnected(undefined);
    beginMutation.reset();
    void queryClient.removeQueries({ queryKey: ["qr-flow"] });
  };
  return { viewState, start, retry };
}

function isTerminalCode(code: string): boolean {
  return code === "QR_FLOW_EXPIRED" || code === "QR_FLOW_REPLACED";
}
function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "The bridge could not complete the QR login.";
}
