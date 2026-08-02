import Link from "next/link";
import { ArrowUpRight, Check, ShieldCheck, Sparkles } from "lucide-react";

import { TopNav } from "@/components/top-nav";

const promises = ["No more pending Udhari", "Turn a group balance into just one payment", "Automate all debts with Zoosh"];

export default function HomePage() {
  return (
    <main className="landing-page min-h-screen overflow-hidden">
      <TopNav />
      <section className="landing-hero mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.12fr_.88fr] lg:items-end lg:pb-24">
        <div>
          <p className="eyebrow text-[color:var(--accent-deep)]">Group money, settled with care</p>
          <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-6xl leading-[.9] tracking-[-0.07em] text-[color:var(--foreground)] sm:text-7xl lg:text-[6.75rem]">Friends. Bills. Sorted.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[color:var(--muted)]">Zoosh keeps group spending clear while plans are happening, then gives each person a simple, deliberate way to settle when the outing ends.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="deco-link-button deco-link-button-primary"
            >
              Continue with Google
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/instructions" className="deco-link-button">See how it works</Link>
          </div>
        </div>
        <aside className="landing-card deco-panel relative p-6 sm:p-8">
          <div className="absolute -right-12 -top-12 size-40 rounded-full bg-[color:var(--accent-soft)] blur-2xl" />
          <Sparkles className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
          <h2 className="mt-8 font-[family-name:var(--font-display)] text-4xl leading-none tracking-[-0.05em] text-[color:var(--foreground)]">Have your <span className="zoosh-highlight">Zoosh</span> handle your expenses</h2>
          <ul className="mt-8 space-y-5">
            {promises.map((promise) => <li className="flex gap-3 text-[color:var(--muted)]" key={promise}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]"><Check className="size-3" aria-hidden="true" /></span>{promise}</li>)}
          </ul>
        </aside>
      </section>
      <section className="border-y border-[color:var(--line)] bg-[color:var(--surface)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8">
          <div><p className="eyebrow">One source of truth</p><p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">Expenses, participants, and settlement status stay scoped to the outing that created them.</p></div>
          <div><p className="eyebrow">No silent charges</p><p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">Every settlement requires the payer&apos;s deliberate passkey approval for the exact amount.</p></div>
          <div><ShieldCheck className="size-5 text-[color:var(--accent)]" aria-hidden="true" /><p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">Card details are collected by the payment provider, never entered into Zoosh.</p></div>
        </div>
      </section>
    </main>
  );
}
