import { TopNav } from "@/components/top-nav";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="site-shell min-h-screen">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <TopNav />
      <main id="main-content" className="site-main mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
      <footer
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[color:var(--line)] px-5 py-6 text-xs text-[color:var(--muted)] sm:px-8"
        aria-label="Technology partners"
      >
        <p>Payment authorization by Prava. Messaging by Linq.</p>
        <div className="flex items-center gap-3">
          <a
            href="https://www.prava.space/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[color:var(--accent-light)] transition-colors hover:text-[color:var(--foreground)]"
          >
            Prava
          </a>
          <span aria-hidden="true">/</span>
          <a
            href="https://linqapp.com/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[color:var(--accent-light)] transition-colors hover:text-[color:var(--foreground)]"
          >
            Linq
          </a>
        </div>
      </footer>
    </div>
  );
}
