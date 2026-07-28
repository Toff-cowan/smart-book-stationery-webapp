"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithGoogleAccessToken, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function finish() {
      const nextRaw = searchParams.get("next") || "/catalog";
      const next = nextRaw.startsWith("/") ? nextRaw : "/catalog";

      try {
        const supabase = getSupabaseBrowserClient();
        const code = searchParams.get("code");

        if (code) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw new Error(exchangeError.message);
          }
          const accessToken = data.session?.access_token;
          if (!accessToken) {
            throw new Error("Google sign-in did not return a session.");
          }
          await loginWithGoogleAccessToken(accessToken);
        } else {
          // Hash/fragment session fallback (implicit) or already persisted.
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw new Error(sessionError.message);
          }
          const accessToken = data.session?.access_token;
          if (!accessToken) {
            throw new Error(
              "Missing Google sign-in code. Try signing in again.",
            );
          }
          await loginWithGoogleAccessToken(accessToken);
        }

        if (!cancelled) {
          router.replace(next);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Google sign-in failed",
        );
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [ready, searchParams, loginWithGoogleAccessToken, router]);

  if (error) {
    return (
      <section className="auth-panel">
        <h1>Google sign-in</h1>
        <p className="msg error">{error}</p>
        <Link href="/login" className="back-link">
          ← Back to sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <h1>Signing you in…</h1>
      <p className="auth-lead">Finishing Google sign-in. One moment.</p>
    </section>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
