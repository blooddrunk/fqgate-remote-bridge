import { createFileRoute } from "@tanstack/react-router";
import { DashboardStatusView } from "../components/dashboard/status-view.js";
import { useBridgeStatus } from "../hooks/use-bridge-status.js";

export const Route = createFileRoute("/")({
  ssr: false,
  component: DashboardPage,
});

function DashboardPage() {
  const status = useBridgeStatus();
  return (
    <DashboardStatusView
      status={status.data}
      isLoading={status.isLoading}
      error={status.error}
      onRetry={() => void status.refetch()}
    />
  );
}
