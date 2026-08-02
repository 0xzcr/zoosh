import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  Scale,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";

const interactions = [
  {
    actor: "01 / Start together",
    title: "Create or join a Friends Group",
    description: "A Friends Group is the lasting home for the people you regularly make plans with.",
    details: [
      "Create a group once and keep its membership independent from any one trip or dinner.",
      "Invite people with a reusable link. An invite expires after its validity window, but it is not limited to one use.",
      "If someone opens an invite while signed out, they can authenticate first and continue joining the same group.",
    ],
    icon: UsersRound,
  },
  {
    actor: "02 / Plan the moment",
    title: "Open an outing",
    description: "Every trip, dinner, or shared plan gets its own members, ledger, balance, and closing point.",
    details: [
      "The person who creates the outing becomes its leader.",
      "The outing uses the shared ledger for its own members, expenses, balances, and closing point.",
    ],
    icon: ClipboardList,
  },
  {
    actor: "03 / Join with context",
    title: "Join the outing",
    description: "Friends already in the parent group can join an outing directly.",
    details: [
      "A person who joins later is included only in expenses recorded after they joined.",
    ],
    icon: WalletCards,
  },
  {
    actor: "04 / Record carefully",
    title: "Describe an expense",
    description: "Tell Zoosh what happened in plain language, then review the structured result before it reaches the ledger.",
    details: [
      "The parser identifies the payer, amount, description, split type, and participants.",
      "If the amount or participants are unclear, Zoosh asks a short follow-up instead of guessing.",
      "A similar recent expense is shown as a warning, not silently merged or blocked.",
    ],
    icon: ReceiptText,
  },
  {
    actor: "05 / Confirm the numbers",
    title: "Review the confirmation",
    description: "Nothing is written to the ledger until a person confirms the parsed expense.",
    details: [
      "Check the payer, total, split type, participants, and per-person share.",
      "The payer's own share is excluded from self-debt, and any rounding remainder stays with the payer's share.",
      "Unusually large expenses receive an additional review prompt before confirmation.",
    ],
    icon: ShieldCheck,
  },
  {
    actor: "06 / See the shared truth",
    title: "Follow the running ledger",
    description: "Confirmed expenses continuously update each member's net balance for that outing only.",
    details: [
      "Positive balances show who is owed; negative balances show who owes.",
      "The balance calculation uses integer minor units, so rounding never relies on floating-point money math.",
      "Zoosh nets the group before settlement so cycles that cancel out do not create unnecessary payment requests.",
    ],
    icon: Scale,
  },
  {
    actor: "07 / Close deliberately",
    title: "End the outing and review",
    description: "The outing creator ends the outing when the group is ready to close the ledger.",
    details: [
      "Ending is a separate action from settlement and permanently locks new expense writes.",
      "The final review shows only people with a non-zero balance.",
      "The creator then prepares one settlement request per debtor, batching multiple creditors into one total where possible.",
    ],
    icon: LockKeyhole,
  },
  {
    actor: "08 / Approve personally",
    title: "Approve and complete settlement",
    description: "The app prepares the request, but the person whose money moves makes the final approval.",
    details: [
      "Each debtor sees the exact total and the creditor breakdown before payment.",
      "A live passkey approval is required. Opening a notification or tapping a button is not payment approval.",
      "A balance becomes settled only after the payment succeeds and each corresponding payout is confirmed.",
    ],
    icon: CheckCircle2,
  },
  {
    actor: "09 / Stay informed",
    title: "Receive requests and reminders",
    description: "Settlement requests can reach people through messaging and email, without turning replies into payment actions.",
    details: [
      "A debtor receives one request for their total, even when several friends are owed.",
      "Email remains a fallback for every settlement request.",
      "Reminders are shared at the settlement-session level and rate-limited to prevent spam.",
    ],
    icon: MessageCircle,
  },
];

export default function InstructionsPage() {
  return (
    <AppShell>
      <section className="max-w-3xl">
        <p className="eyebrow">Using Zoosh</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-[.94] tracking-[-0.06em] sm:text-6xl">A clear path from shared plan to settled balance.</h1>
        <p className="mt-6 text-lg leading-8 text-[color:var(--muted)]">Zoosh is designed to make the process understandable at every moment. Nothing reaches the ledger or payment flow without a person confirming it.</p>
      </section>

      <ol className="-mx-5 mt-12 border-y border-[color:var(--line)] bg-[color:var(--surface-strong)] px-5 sm:-mx-8 sm:px-8">
        {interactions.map(({ actor, title, description, details, icon: Icon }) => (
          <li key={title} className="group grid gap-5 border-b border-[color:var(--line)] py-10 last:border-b-0 md:grid-cols-[10rem_2rem_1fr_auto] md:items-start">
            <p className="eyebrow text-[color:var(--accent-light)]">{actor}</p>
            <Icon className="size-5 text-[color:var(--accent)] transition-transform group-hover:scale-110" aria-hidden="true" />
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">{title}</h2>
              <p className="mt-3 max-w-2xl leading-7 text-[color:var(--muted)]">{description}</p>
              <ul className="mt-4 space-y-2 text-base leading-7 text-[color:var(--muted)]">
                {details.map((detail) => (
                  <li key={detail} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" aria-hidden="true" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ArrowRight className="hidden size-5 text-[color:var(--muted)] transition-transform group-hover:translate-x-1 md:block" aria-hidden="true" />
          </li>
        ))}
      </ol>

      <section className="mt-10 border-t border-[color:var(--line)] pt-8">
        <CheckCircle2 className="size-6 text-[color:var(--accent-light)]" aria-hidden="true" />
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl tracking-[-0.05em]">The safety rule</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[color:var(--muted)]">Zoosh prepares the settlement, but never silently authorizes a payment. The final decision always belongs to the person whose money is moving.</p>
        <Link href="/groups" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">Go to groups <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </section>
    </AppShell>
  );
}
