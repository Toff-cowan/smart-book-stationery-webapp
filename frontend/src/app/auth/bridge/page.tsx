"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function readOAuthNext(): string {
  try {
    const stored = sessionStorage.getItem("sbs_oauth_next");
    if (stored) {
      sessionStorage.removeItem("sbs_oauth_next");
      if (stored.startsWith("/")) return stored;
    }
  } catch {
    /* ignore */
  }
  return "/catalog";
}

function AuthBridgeInner() {
  const router = useRouter();
  const { loginWithGoogleAccessToken, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function finish() {
      const next = readOAuthNext();
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message);
        }
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          throw new Error(
            "Google sign-in session missing. Try signing in again.",
          );
        }
        await loginWithGoogleAccessToken(accessToken);
        // Drop Supabase session — app auth is Flask JWT from here.
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignore */
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
  }, [ready, loginWithGoogleAccessToken, router]);

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

export default function AuthBridgePage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <AuthBridgeInner />
    </Suspense>
  );
}
