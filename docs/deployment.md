# Deployment guide

Stage 1 is a private test that costs nothing. Stage 2 is the public launch. Screens and limits are as of
25 November 2026 and may change.

**A push to GitHub never deploys.** `vercel.json` turns that off. You start every deployment.

## Stage 1: private test

Use Stage 1 for yourself only. Vercel's free plan is for personal or non-commercial use.

### 1. Database (Neon, free)

1. Create an account at neon.com and a project named `taxpilot-test`.
2. Choose **AWS Asia Pacific (Singapore)** and Postgres 17. The region cannot be changed later.
3. Open **Connect** and copy two connection strings:
   - **direct** (connection pooling off), used once in step 4
   - **pooled** (connection pooling on), used by the app in step 5
4. In both, replace `sslmode=require` with `sslmode=verify-full`.

Treat both like passwords. Do not put them in a file in this folder, in chat or in GitHub.

### 2. Email (Resend, free)

1. Create an account at resend.com **with the email address you will test with**.
2. Create an API key with **Sending access**.

Without your own domain, Resend delivers only to that address. So only you can finish signing up.

### 3. Secrets

Run this three times, and keep the three different results in a password manager:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

They are `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET`.

> **Keep a second copy of `ENCRYPTION_KEY`.** Saved PAN numbers cannot be read without it, and it must never be changed.

### 4. Create the tables

In this folder, paste the **direct** connection string when asked:

```powershell
$env:DATABASE_URL = Read-Host "Direct connection string"
```

```powershell
npm run db:migrate
```

```powershell
Remove-Item Env:DATABASE_URL
```

### 5. Hosting (Vercel, free)

1. Create an account at vercel.com with GitHub, on the **Hobby** plan.
2. Choose **Add New > Project** and import `Tax-Invoice`.
3. Choose a project name. The address will be `https://<name>.vercel.app`, or similar if the name is taken.
4. Add these environment variables, for **Production** only:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the **pooled** connection string |
| `BETTER_AUTH_SECRET` | from step 3 |
| `BETTER_AUTH_URL` | `https://<name>.vercel.app`, with no slash at the end |
| `ENCRYPTION_KEY` | from step 3 |
| `RESEND_API_KEY` | from step 2 |
| `EMAIL_FROM` | `TaxPilot AI <onboarding@resend.dev>` |
| `CRON_SECRET` | from step 3 |
| `SHOW_UNREVIEWED_RULES` | `true` to show tax, GST and deadline figures. Leave it out to keep them hidden |

5. Press **Deploy**.
6. If the address is not the one in `BETTER_AUTH_URL`, correct it and redeploy.
7. Optional: in **Settings > Deployment Protection**, turn on Vercel Authentication for **All Deployments**, so that
   only your Vercel account can open the site. Check that the daily jobs still run afterwards.

The app refuses to start when a variable is missing. The reason is in **Logs**.

### 6. First checks

1. Open `https://<name>.vercel.app/api/health`. It should say `ok`.
2. Check the database as well:

```powershell
$secret = Read-Host "CRON_SECRET"; Invoke-RestMethod "https://<name>.vercel.app/api/health" -Headers @{ Authorization = "Bearer $secret" }
```

3. In **Settings > Cron Jobs**, run `/api/cron/exchange-rates` once. It loads ten years of rates.
4. Sign up with your own address and verify it.

### 7. Test list

- [ ] Sign up, verify, sign in, sign out, reset the password
- [ ] A client, an income in USD with "Look up rate", an expense
- [ ] An invoice: issue, PDF, part payment, full payment
- [ ] Reports and the three CSV files
- [ ] Currency analyzer and My income
- [ ] **Tax figures:** with `SHOW_UNREVIEWED_RULES` every page says they are unchecked. Without it they are hidden
- [ ] The tax calculator with each age, including under 18
- [ ] A task, and its reminder email
- [ ] Both daily jobs, the next day, in **Logs**
- [ ] After ten minutes unused, the site still opens
- [ ] On a phone
- [ ] Settings > Your data: download the ZIP, then, last of all, delete the account

Do not enter real PAN or GSTIN numbers in Stage 1.

Only one account is possible in Stage 1, because Resend delivers only to you. That one user cannot see another's data
is tested on a real Postgres by **Checks** on GitHub, and by hand with two accounts in Stage 2.

## Later deployments

1. Check that **Checks** is green on GitHub.
2. When `drizzle/` changed: in Neon, create a branch or snapshot first, then repeat step 4.
3. In Vercel, open **Deployments** and create a deployment from `main`.

**To go back:** in Vercel, open the last good deployment and choose **Instant Rollback** or **Promote**. Database
changes are not undone by this, so restore the Neon branch or snapshot only if data was damaged.

## Stage 2: before the public can use it

- [ ] A chartered accountant has approved `docs/tax-rules-fy-2026-27.md`, or tax figures stay hidden
- [ ] Privacy policy and terms, reviewed by a lawyer, including India's data protection rules
- [x] Account deletion and data download
- [ ] A lawyer has said whether data must be kept for a year after deletion (rule 8(3), expected from May 2027)
- [ ] A lawyer has said how to handle people under 18. From about May 2027 the data protection Act is expected to ask
      for a parent's verifiable consent, and agreements with minors need care today
- [ ] Vercel Pro, as the free plan is not for commercial use
- [ ] Neon Launch, with restore history of several days. The free plan keeps six hours
- [ ] A new Neon project and **new secrets**, not the test ones
- [ ] A domain, verified in Resend, and `EMAIL_FROM` and `BETTER_AUTH_URL` changed to it
- [ ] One test restore, and a weekly encrypted copy kept elsewhere
- [ ] An uptime monitor on `/api/health`
- [ ] Error alerts that contain no personal data
- [ ] `ALLOW_INDEXING` set to `true`, then a new deployment

`/api/health` without the secret does not touch the database. A monitor that did would keep it awake all month,
which is more than the free plan includes.

## If something leaks

| Secret | Do this | Effect |
| --- | --- | --- |
| `DATABASE_URL` | Reset the password in Neon, update Vercel, redeploy | None for users |
| `RESEND_API_KEY` | Delete it in Resend, create another | None for users |
| `CRON_SECRET` | Generate another | None for users |
| `BETTER_AUTH_SECRET` | Generate another | Everyone signs in again |
| `ENCRYPTION_KEY` | **Do not just replace it.** Saved PANs must be re-encrypted first | PANs unreadable if replaced |
