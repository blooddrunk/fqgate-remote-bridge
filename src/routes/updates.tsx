import { createFileRoute } from "@tanstack/react-router";
import { UpdateCenterView } from "../components/dashboard/update-center.js";
import { useUpdateCenter } from "../hooks/use-update-center.js";
import { useBridgeContext } from "../hooks/use-bridge-context.js";

export const Route = createFileRoute("/updates")({
  ssr: false,
  component: UpdatesPage,
});

function UpdatesPage() {
  const update = useUpdateCenter();
  const context = useBridgeContext();
  return (
    <UpdateCenterView
      status={update.status.data}
      isLoading={update.status.isLoading}
      error={update.status.error}
      onRefreshStatus={() => void update.status.refetch()}
      onCheck={() => update.check.mutate()}
      isChecking={update.check.isPending}
      checkError={update.check.error}
      onPreview={() => update.preview.mutate()}
      isPreviewing={update.preview.isPending}
      previewError={update.preview.error}
      onApply={(planId) => update.apply.mutate(planId)}
      isApplying={update.apply.isPending}
      applyError={update.apply.error}
      isRemoteHuman={context.data?.requestContext === "remote_human"}
      contextReady={context.data !== undefined || context.error !== null}
    />
  );
}
