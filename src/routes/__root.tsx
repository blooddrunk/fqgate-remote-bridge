/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell.js";
import { QueryProvider } from "../components/query-provider.js";
import appCss from "../styles.css?url";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FQGate Bridge · 本机操作台" },
      {
        name: "description",
        content:
          "保持 FQGate 与 Bridge loopback-only，并通过 Cloudflare Access 提供受控的人类状态与扫码登录操作台。",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
        <Scripts />
      </body>
    </html>
  );
}
