import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Google OAuth returns here with ?code=...
 * Exchange the code using cookie-stored PKCE verifier, then send the user to
 * the client bridge page to create the Flask session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error");

  const origin = url.origin;

  if (oauthError) {
    const message = decodeURIComponent(oauthError.replace(/\+/g, " "));
    return NextResponse.redirect(
      `${origin}/login?oauth_error=${encodeURIComponent(message)}`,
    );
  }

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          `${origin}/login?oauth_error=${encodeURIComponent(error.message)}`,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed";
      return NextResponse.redirect(
        `${origin}/login?oauth_error=${encodeURIComponent(message)}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/auth/bridge`);
}
