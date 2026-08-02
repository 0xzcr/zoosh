import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { safeAuthRedirect } from "@/constants/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthRedirect(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  const { url: supabaseUrl, anonKey } = getSupabaseConfig();

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
