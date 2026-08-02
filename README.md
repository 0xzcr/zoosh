# Zoosh

Zoosh is a group-expense app for friends. Members create groups and outings, log shared expenses, review balances, and settle the final amounts through one net payment per debtor. Supabase handles authentication and data, Prava handles passkey-protected payment authorization, Cashfree handles the incoming payment and recipient payouts, and Linq and email deliver settlement notifications.

## Project Structure

```text
app/                 Next.js pages, layouts, API routes, and auth callbacks
app/(app)/            Protected application pages
app/(auth)/           Login and signup pages
app/api/              Server-side application endpoints
components/           Reusable UI, navigation, forms, and payment components
constants/            Shared application constants and auth helpers
lib/                  Server clients, ledger logic, provider integrations, and utilities
public/               Public files such as the service worker and static assets
supabase/migrations/  Ordered database schema, RLS, functions, and policy changes
tests/                Automated ledger and application tests
```

## Key Areas

- `app/(app)/groups/`: groups, outings, expenses, balances, and settlement screens.
- `app/api/`: authenticated server routes for groups, outings, expenses, settlements, and webhooks.
- `components/forms/`: interactive forms and actions used throughout the app.
- `lib/ledger.ts`: client-side ledger and net-settlement calculations used by tests and UI logic.
- `lib/supabase/`: browser, server, admin, and session-refresh Supabase clients.
- `lib/prava.ts`: server-side Prava session creation, result polling, credential extraction, and status reporting.
- `lib/cashfree.ts`: Cashfree payment, beneficiary, payout transfer, and webhook verification.
- `lib/linq.ts`: Linq notifications and webhook verification.
- `supabase/migrations/`: the source of truth for the database schema and security policies.

## Common Commands

```bash
npm run dev
npm run lint
npm test
npm run build
```
