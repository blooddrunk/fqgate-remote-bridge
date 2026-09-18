import { Menu, Moon, Radio, Sun, X } from "lucide-react";
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";

const navLinkClass =
  "inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-slate-600 outline-none hover:bg-slate-900/5 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white";
const activeNavLinkClass = "bg-slate-900/5 text-slate-950 dark:bg-white/10 dark:text-white";

export function AppShell({ children }: { readonly children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="isolate min-h-dvh overflow-x-clip bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#08111f] dark:text-white">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute -right-28 top-28 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/10" />
        <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-white/70 to-transparent dark:from-slate-900/40" />
      </div>
      <header className="relative z-10 border-b border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-white/[0.08] dark:bg-slate-950/40">
        <div className="safe-x mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 py-3 sm:min-h-20 sm:py-0">
          <Link
            to="/"
            onClick={closeMobileNav}
            className="group flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-cyan-300 shadow-lg shadow-cyan-950/20 dark:bg-cyan-300 dark:text-slate-950">
              <Radio size={19} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">
                FQGate Bridge
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                本机 / 远程人工操作台
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 md:flex" aria-label="主导航">
            <DesktopNavigation />
            <ThemeToggle dark={dark} setDark={setDark} />
          </nav>

          <Button
            variant="ghost"
            aria-label={mobileNavOpen ? "关闭主导航" : "打开主导航"}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-navigation"
            className="h-11 w-11 shrink-0 rounded-xl px-0 md:hidden"
            onClick={() => setMobileNavOpen((value) => !value)}
          >
            {mobileNavOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </Button>
        </div>

        {mobileNavOpen ? (
          <nav
            id="mobile-navigation"
            className="safe-x border-t border-slate-200/70 px-4 pb-4 pt-3 dark:border-white/[0.08] md:hidden"
            aria-label="移动主导航"
          >
            <div className="mx-auto grid max-w-6xl gap-1">
              <MobileNavigation onNavigate={closeMobileNav} />
              <ThemeToggle dark={dark} setDark={setDark} mobile />
            </div>
          </nav>
        ) : null}
      </header>

      <main className={cn("safe-x relative z-10 mx-auto w-full max-w-6xl py-8 sm:py-14")}>
        {children}
      </main>
      <footer className="safe-x safe-bottom relative z-10 mx-auto max-w-6xl pb-8 text-xs leading-5 text-slate-400 sm:pb-10">
        FQGate 与 Bridge 始终只绑定 IPv4 loopback · 远程访问由 Cloudflare Access 保护 · QR
        状态只保存在内存中，并会自动过期
      </footer>
    </div>
  );
}

function DesktopNavigation() {
  return (
    <>
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{ className: activeNavLinkClass }}
        className={navLinkClass}
      >
        总览
      </Link>
      <Link to="/login" activeProps={{ className: activeNavLinkClass }} className={navLinkClass}>
        扫码登录
      </Link>
      <Link to="/updates" activeProps={{ className: activeNavLinkClass }} className={navLinkClass}>
        更新
      </Link>
      <Link
        to="/api-reference"
        activeProps={{ className: activeNavLinkClass }}
        className={navLinkClass}
      >
        API Reference
      </Link>
    </>
  );
}

function MobileNavigation({ onNavigate }: { readonly onNavigate: () => void }) {
  return (
    <>
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{ className: activeNavLinkClass }}
        className={cn(navLinkClass, "w-full")}
        onClick={onNavigate}
      >
        总览
      </Link>
      <Link
        to="/login"
        activeProps={{ className: activeNavLinkClass }}
        className={cn(navLinkClass, "w-full")}
        onClick={onNavigate}
      >
        扫码登录
      </Link>
      <Link
        to="/updates"
        activeProps={{ className: activeNavLinkClass }}
        className={cn(navLinkClass, "w-full")}
        onClick={onNavigate}
      >
        更新
      </Link>
      <Link
        to="/api-reference"
        activeProps={{ className: activeNavLinkClass }}
        className={cn(navLinkClass, "w-full")}
        onClick={onNavigate}
      >
        API Reference
      </Link>
    </>
  );
}

function ThemeToggle({
  dark,
  setDark,
  mobile = false,
}: {
  readonly dark: boolean;
  readonly setDark: Dispatch<SetStateAction<boolean>>;
  readonly mobile?: boolean;
}) {
  return (
    <Button
      aria-label={dark ? "切换为浅色主题" : "切换为深色主题"}
      variant="ghost"
      size={mobile ? "default" : "sm"}
      className={mobile ? "mt-1 w-full justify-start px-3" : "ml-1 h-11 w-11 rounded-xl px-0"}
      onClick={() => setDark((value) => !value)}
    >
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      {mobile ? (dark ? "浅色主题" : "深色主题") : null}
    </Button>
  );
}
