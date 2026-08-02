import { TopNav } from "@/components/top-nav";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="site-shell min-h-screen">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <TopNav />
      <main id="main-content" className="site-main mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
    </div>
  );
}
