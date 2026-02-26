"use client";

import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/timeline");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const next = search.get("next");
    const resolvedNextPath = next && next.startsWith("/") ? next : "/timeline";
    setNextPath(resolvedNextPath);

    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/status", {
          cache: "no-store",
        });
        const data = await response.json();
        if (data.authenticated) {
          router.replace(resolvedNextPath);
          return;
        }
      } catch {
        setAuthError("Failed to check authentication status.");
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const registerWithPasskey = async () => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const startResponse = await fetch("/api/auth/register/start", {
        method: "POST",
      });
      if (!startResponse.ok) {
        throw new Error("Failed to start registration");
      }

      const options = await startResponse.json();
      const registration = await startRegistration(options);

      const finishResponse = await fetch("/api/auth/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });

      if (!finishResponse.ok) {
        const payload = await finishResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to finish registration");
      }

      router.replace(nextPath);
    } catch (error) {
      setAuthError((error as Error).message);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginWithPasskey = async () => {
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const startResponse = await fetch("/api/auth/login/start", {
        method: "POST",
      });
      if (!startResponse.ok) {
        throw new Error("Failed to start login");
      }

      const options = await startResponse.json();
      const authentication = await startAuthentication(options);

      const finishResponse = await fetch("/api/auth/login/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authentication),
      });

      if (!finishResponse.ok) {
        const payload = await finishResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to finish login");
      }

      router.replace(nextPath);
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8 font-sans text-zinc-900 dark:text-zinc-100 flex justify-center items-start">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden p-6 space-y-4">
        <h1 className="text-2xl font-bold text-center">Todo Passkey Login</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
          Use a passkey to register or log in.
        </p>

        {authError && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center">
            {authError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={registerWithPasskey}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
          >
            Register with Passkey
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={loginWithPasskey}
            className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-900 disabled:bg-zinc-500 dark:bg-zinc-200 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-500 text-white dark:text-zinc-900 rounded-lg transition-colors"
          >
            Login with Passkey
          </button>
        </div>
      </div>
    </div>
  );
}
