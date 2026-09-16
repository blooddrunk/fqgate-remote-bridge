import { createFileRoute } from "@tanstack/react-router";
import { QrFlowView } from "../components/login/qr-flow.js";
import { useQrLogin } from "../hooks/use-qr-login.js";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const flow = useQrLogin();
  return <QrFlowView state={flow.viewState} onStart={flow.start} onRetry={flow.retry} />;
}
