import { createFileRoute } from "@tanstack/react-router";
import { ApiReferenceView } from "../components/dashboard/api-reference.js";
import { useApiReference } from "../hooks/use-api-reference.js";
import { useBridgeContext } from "../hooks/use-bridge-context.js";

export const Route = createFileRoute("/api-reference")({
  ssr: false,
  component: ApiReferencePage,
});

function ApiReferencePage() {
  const reference = useApiReference();
  const context = useBridgeContext();
  return (
    <ApiReferenceView
      catalog={reference.catalog.data}
      isLoading={reference.catalog.isLoading}
      error={reference.catalog.error}
      onRefresh={() => reference.refresh.mutate()}
      isRefreshing={reference.refresh.isPending}
      refreshError={reference.refresh.error}
      isRemoteHuman={context.data?.requestContext === "remote_human"}
      isRemoteAdmin={context.data?.requestContext === "remote_admin"}
    />
  );
}
