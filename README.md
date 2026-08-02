# Zoosh

Group expenses in, one tap out. Zoosh uses Supabase for authentication and data, Prava for passkey-protected payment authorization, Linq and email for settlement notifications, and Razorpay Route for recipient payouts.

## Local Development

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and add the required values.
3. Start the app with `npm run dev`.

The production checks are:

```bash
npm run lint
npm test
npm run build
```

## Vercel Deployment

Vercel should detect this as a Next.js application automatically. Use Node.js `22.x` and the default build command `npm run build`.

Set these variables in the Vercel project for the target environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_EXPENSE_MODEL`
- `APP_URL` using the stable HTTPS deployment or custom domain
- `SETTLEMENT_WORKER_TOKEN`
- Prava variables from `.env.example`
- Razorpay variables from `.env.example`
- Linq variables from `.env.example`
- Resend variables from `.env.example`

Never commit `.env`, `.env.local`, service-role keys, provider secret keys, or worker tokens. `.gitignore` excludes local secrets and build output.

After the Supabase project is linked, apply the migrations:

```bash
supabase db push --linked
```

Configure provider callbacks against the deployed HTTPS domain:

- Razorpay webhook: `/api/webhooks/razorpay`
- Linq webhook: `/api/webhooks/linq`

The Prava publishable key and backend URL must match the secret key environment. Add the stable deployment domain to Prava’s allowed origins before testing passkeys.

## Settlement Readiness

Zoosh prepares one net payment session per debtor and creates creditor payout records. The Prava session, secure iframe, credential polling, provider outcome reporting, webhook verification, and Razorpay transfer code are present. A live settlement requires a compatible processor to charge the Prava-generated one-time credential and return the captured Razorpay payment ID to the protected charge-confirmation route.
