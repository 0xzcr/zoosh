import type { ReactNode } from "react";

export function EmptyState({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <section className="section-frame rounded-[1.75rem] p-6 sm:p-8">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em] text-[color:var(--foreground)]">{title}</h2>
      <p className="mt-3 max-w-lg leading-7 text-[color:var(--muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
