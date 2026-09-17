import { Moon, Radio, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";

export function AppShell({ children }: { readonly children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#08111f] dark:text-white">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute -right-28 top-28 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-white/70 to-transparent dark:from-slate-900/40" />
      </div>
      <header className="relative z-10 border-b border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/40">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link
            to="/"
            className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-cyan-300 shadow-lg shadow-cyan-950/20 dark:bg-cyan-300 dark:text-slate-950">
              <Radio size={19} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">FQGate Bridge</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">本机操作台</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="主导航">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{
                className: "bg-slate-900/5 text-slate-950 dark:bg-white/10 dark:text-white",
              }}
              className="rounded-xl px-3 py-2 text-sm text-slate-600 outline-none hover:bg-slate-900/5 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              总览
            </Link>
            <Link
              to="/login"
              activeProps={{
                className: "bg-slate-900/5 text-slate-950 dark:bg-white/10 dark:text-white",
              }}
              className="rounded-xl px-3 py-2 text-sm text-slate-600 outline-none hover:bg-slate-900/5 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              扫码登录
            </Link>
            <Button
              aria-label={dark ? "切换为浅色主题" : "切换为深色主题"}
              variant="ghost"
              size="sm"
              className="ml-1 h-9 w-9 rounded-xl px-0"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </Button>
          </nav>
        </div>
      </header>
      <main className={cn("relative z-10 mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14")}>
        {children}
      </main>
      <footer className="relative z-10 mx-auto max-w-6xl px-5 pb-8 text-xs text-slate-400 sm:px-8">
        仅限本机回环 · QR 状态只保存在内存中，并会自动过期
      </footer>
    </div>
  );
}
