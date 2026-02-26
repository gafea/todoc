"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, CheckSquare, Users, Copy, LogOut } from "lucide-react";

const navItems = [
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/my-todos", label: "My Todos", icon: CheckSquare },
  { href: "/shared-with-me", label: "Shared with Me", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        setUserId(data.userId ?? null);
      } catch {}
    };

    loadAuth();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCopyUserId = async () => {
    if (!userId) return;

    try {
      await navigator.clipboard.writeText(userId);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1200);
    } catch {}
  };

  return (
    <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="p-4 md:p-5 space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Todo
        </h2>
      </div>

      <nav className="px-3 flex md:block gap-2 md:gap-1 overflow-x-auto md:overflow-visible whitespace-nowrap">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center md:flex shrink-0 md:shrink px-3 py-2 rounded-md text-sm ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {item.icon
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (() => {
                    const Icon = item.icon as any;
                    return <Icon className="mr-2" size={16} />;
                  })()
                : null}

              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 md:p-5 space-y-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
          {userId ? `Hello, ${userId}` : ""}
        </p>
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCopyUserId}
            disabled={!userId}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Copy size={14} />
            {copyState === "copied" ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
