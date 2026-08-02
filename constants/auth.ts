export const DEFAULT_AUTH_REDIRECT = "/auth/callback?next=/groups";
export const AUTH_CONFIGURATION_ERROR = "Google sign-in is not configured yet. Add the Supabase URL and publishable key to enable it.";

export function safeAuthRedirect(input: string | null | undefined) {
  if (!input) {
    return "/groups";
  }

  try {
    const parsed = new URL(input, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return "/groups";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/groups";
  }
}
