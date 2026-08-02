"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

type UserMenuProps = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

function initialsFromName(fullName: string, email: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({ fullName, email, avatarUrl }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const initials = useMemo(() => initialsFromName(fullName, email), [email, fullName]);
  const showAvatar = Boolean(avatarUrl) && !avatarError;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center justify-center p-1 text-[color:var(--accent-light)] transition hover:text-[color:var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open account menu"
        title="Open account menu"
      >
        <Menu className="size-6" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-3 w-72 overflow-hidden rounded-[0.8rem] border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3 shadow-[0_24px_70px_rgba(0,0,0,.5)] backdrop-blur"
        >
          <div className="flex items-center gap-3 rounded-[0.45rem] border border-[color:var(--line)] bg-[color:var(--paper)] px-3 py-3">
            <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--ink)] text-sm font-semibold shadow-[0_0_0_1px_rgba(155,109,255,.2)]">
              {showAvatar ? (
                <span className="relative block size-full overflow-hidden rounded-full">
                  <Image
                    src={avatarUrl ?? ""}
                    alt=""
                    fill
                    sizes="44px"
                    unoptimized
                    className="object-cover"
                    onError={() => setAvatarError(true)}
                  />
                </span>
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">{fullName}</p>
              <p className="truncate text-xs text-[color:var(--muted)]">{email}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            <Link
              href="/groups"
              className="rounded-[0.35rem] px-3 py-2 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--paper)]"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              Go to Dashboard
            </Link>
            <form action="/auth/sign-out" method="post">
              <Button
                type="submit"
                variant="quiet"
                className="w-full justify-start rounded-[0.35rem] px-3 py-2 text-left text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--paper)]"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
