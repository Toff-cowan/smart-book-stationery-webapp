"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * When Supabase OAuth fails, it often redirects to Site URL (home) with
 * ?error=&error_code=&error_description=. Send the user to /login instead.
 */
function OAuthErrorRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("error_code");
    const error = searchParams.get("error");
    const description = searchParams.get("error_description");
    if (!code && !error) return;

    const message = decodeURIComponent(
      (description || error || "Google sign-in failed").replace(/\+/g, " "),
    );
    const params = new URLSearchParams({ oauth_error: message });
    router.replace(`/login?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export function OAuthErrorRedirect() {
  return (
    <Suspense fallback={null}>
      <OAuthErrorRedirectInner />
    </Suspense>
  );
}
