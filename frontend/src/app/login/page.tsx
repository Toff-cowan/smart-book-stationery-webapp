"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  getSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase";

function LoginForm() {
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/catalog";
  const googleEnabled = isSupabaseAuthConfigured();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    () => searchParams.get("oauth_error"),
  );
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      if (!isSupabaseAuthConfigured()) {
        throw new Error(
          "Google sign-in is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.",
        );
      }
      const supabase = getSupabaseBrowserClient();
      // Keep redirectTo path-only so it matches Supabase allow-list entries.
      // Stash post-login destination separately (query strings often break OAuth state).
      try {
        sessionStorage.setItem("sbs_oauth_next", next);
      } catch {
        /* ignore */
      }
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleBusy(false);
      }
      // On success the browser redirects away to Google.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      <p className="auth-lead">
        Sign in to add titles to your cart and place a bookstore order.
      </p>

      <>
        <button
          type="button"
          className="btn-google"
          disabled={busy || googleBusy}
          onClick={() => void onGoogleSignIn()}
        >
          <span className="btn-google-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="18" height="18">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
          </span>
          <span>{googleBusy ? "Redirecting…" : "Sign in with Google"}</span>
        </button>
        <p className="auth-divider">
          <span>or continue with email</span>
        </p>
      </>

      <form onSubmit={onSubmit} className="auth-form">
        {mode === "register" ? (
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error ? <p className="msg error">{error}</p> : null}
        {!googleEnabled ? (
          <p className="msg error">
            Google sign-in env vars are missing on this deploy. Set
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel,
            then redeploy.
          </p>
        ) : null}
        <button type="submit" className="btn-primary" disabled={busy || googleBusy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>

      <p className="auth-switch">
        {mode === "login" ? (
          <>
            New here?{" "}
            <button type="button" className="link-btn" onClick={() => setMode("register")}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" className="link-btn" onClick={() => setMode("login")}>
              Sign in
            </button>
          </>
        )}
      </p>
      <p className="auth-legal">
        By continuing you agree to our{" "}
        <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <Link href="/catalog" className="back-link">
        ← Back to catalog
      </Link>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
