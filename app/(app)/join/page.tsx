import { AppShell } from "@/components/app-shell";
import { JoinCodeForm } from "@/components/forms/join-code-form";

export default function JoinPage() {
  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p className="eyebrow">Joining a group?</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            join your friends!
          </h1>
          <p className="mt-5 max-w-xl leading-7 text-[color:var(--muted)]">
            Paste the invite code your friend shared and Zoosh will take you into that group.
          </p>
        </div>
        <JoinCodeForm />
      </section>
    </AppShell>
  );
}
