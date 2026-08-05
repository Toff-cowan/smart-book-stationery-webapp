import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Google OAuth returns here with ?code=...
 * Exchange the code for a Supabase session (cookies must be set on this
 * redirect response), then send the user to the client bridge to mint the
 * Flask JWT used by the rest of the app.
 */
export async function GET(request: NextRequest) {
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

  const redirectUrl = `${origin}/auth/bridge`;
  let response = NextResponse.redirect(redirectUrl);

  if (!code) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(
      `${origin}/login?oauth_error=${encodeURIComponent(
        "Google sign-in is not configured on this deploy.",
      )}`,
    );
  }

  try {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Apply to both the request (for this exchange) and the redirect
          // response so /auth/bridge can read the session in the browser.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.redirect(redirectUrl);
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

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

  return response;
}
