"use client";

import { useState } from "react";
import { LogIn, LoaderCircle } from "lucide-react";

import { AUTH_CONFIGURATION_ERROR } from "@/constants/auth";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type GoogleSignInProps = {
  redirectTo: string;
  className?: string;
  fullWidth?: boolean;
};

export function GoogleSignIn({ redirectTo, className = "", fullWidth = true }: GoogleSignInProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignIn() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL(redirectTo, window.location.origin).toString();
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (signInError) {
        throw signInError;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      setIsLoading(false);
    } catch {
      setError(AUTH_CONFIGURATION_ERROR);
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button className={`${fullWidth ? "w-full" : ""} ${className}`} onClick={handleSignIn} disabled={isLoading}>
        {isLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogIn className="size-4" aria-hidden="true" />}
        Continue with Google
      </Button>
      {error ? <p className="rounded-xl bg-[color:var(--paper)] px-3 py-2 text-sm text-[color:var(--accent)]" role="alert">{error}</p> : null}
    </div>
  );
}
