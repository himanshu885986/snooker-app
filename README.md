# Snooker Counter

Table timers, per-player billing and shop sales for snooker parlours. It is a web app (PWA) that installs on a phone or tablet like a normal app.

## How billing works

- Each **frame** is timed on its table. **Pause** stops the clock, for example during a power cut.
- When a frame ends, staff tap the **losing side**. The frame costs `minutes × that table's rate`, split equally between the losing players. Winners pay nothing for that frame.
- Minutes are rounded to the nearest minute, with a minimum of 1.
- Food, drinks and cigarettes go on the bill of **the player who bought them**.
- Each player has one bill for the visit, covering every table they played on. They pay at checkout by cash or UPI QR.
- A frame keeps the rate from when it started, so changing a table's rate never changes old bills.

All money is stored in paise (whole numbers), so rounding errors can't happen. Split shares always add up exactly to the frame total.


## Run it on your computer

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # billing rule tests
```

Without Supabase settings the app runs in **demo mode**. It works like the real app, login included, but data is saved only in that browser. It is useful for trying it out or showing the shop owner.

## Connect the real database (Supabase, free)

1. Create a free account at https://supabase.com and create a new project. Pick the **Mumbai** region.
2. Open **SQL Editor → New query**, paste the contents of `supabase/migrations/001_initial.sql` and click **Run**. Then do the same with each later file in `supabase/migrations`, in number order.
3. Open **Authentication → Sign In / Providers** and turn **on** "Allow anonymous sign-ins". Every device gets a free anonymous session, and the mobile number + PIN login is checked by the database, so no SMS or email service is needed.
4. Open **Project Settings → API** and copy the Project URL and the `anon` public key into a `.env` file:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Run `npm run dev` again, open the app and choose **New business**. Whoever registers becomes that business's **admin**.

## Updating an existing database

When a new file appears in `supabase/migrations`, run **only that file** in the SQL Editor of your live project. Each file is written to run once, on top of the previous ones, without losing data.

| File | Adds |
|---|---|
| `001_initial.sql` | Shops, tables, frames, bills, logins and roles |
| `002_payments_khata.sql` | Part-payments, payment history, khata (customer credit) |

## Payments, history and khata

- **Part payment:** take any amount now by cash or UPI. The bill stays open and shows what is left.
- **Put on khata:** the rest of the bill goes on the customer's khata, found by mobile number, and the bill closes. Players who gave a mobile number are recognised next time, and their bill warns if they already owe money.
- **History (Bills → History):** bills closed on a day, with that day's cash, UPI, khata given and khata received. **Reopen bill** undoes a checkout; any amount it put on khata comes off the khata again.
- **Khata tab:** who owes how much, each customer's ledger, **Receive payment**, and **Old khata** to copy balances from the paper notebook.
- **Mistakes:** a payment or khata entry recorded by mistake is removed with ×. It stays in the records, marked as removed.
- Only the admin can see or change any of this.

## Logins and roles

Each shop owner registers their own business, so the app can be offered to many shops (SaaS). A business can have several shops (branches). People only ever see the businesses they belong to; the database enforces this, not just the app.

| | Admin | Maintainer | Viewer |
|---|---|---|---|
| See tables and bills | ✅ | ✅ | ✅ |
| Start, pause and end frames; add players and items | ✅ | ✅ | ❌ |
| Take payment, history, khata | ✅ | ❌ | ❌ |
| Adjust frame time, cancel a frame, remove an item | ✅ | ❌ | ❌ |
| Rates, prices, shops, staff and PINs | ✅ | ❌ | ❌ |

- There is exactly one admin per business. The admin adds staff in **Settings → Staff** with their mobile number, role and a starting PIN.
- Logging in uses a mobile number and a 4–6 digit PIN. After 5 wrong PINs the account is locked for 15 minutes.
- Staff can change their own PIN under **Account**. The admin can reset a staff PIN, which also logs that person out everywhere.
- The admin can only reset the PIN of someone who works just for their business. If a person is staff at two businesses, only that person can change their PIN.
- Every time change is recorded in `frame_time_edits`: old time, new time, who changed it and when. Pauses, frame ends, items and payments also record who did them.

Demo mode has the same login. The first visit asks you to register a business (one per browser), and staff you add can then log in with their own number and PIN. To start the demo over, clear this site's data in the browser.

## Put it online (Cloudflare Pages, free)

1. Push this folder to a GitHub repository.
2. In Cloudflare go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
3. Use build command `npm run build` and output folder `dist`.
4. Add the two `VITE_SUPABASE_*` values as environment variables, then deploy.
5. Open the `*.pages.dev` link on the counter tablet or phone and choose **Add to Home Screen**.

## Project layout

```
src/lib/billing.ts          billing rules (tested in billing.test.ts)
src/lib/permissions.ts      who may do what (same rules as require_role in the SQL)
src/data/types.ts           data model and the DataStore interface
src/data/localStore.ts      demo mode (browser storage)
src/data/supabaseStore.ts   real database
src/data/supabaseAuth.ts    mobile + PIN login
supabase/migrations/        database: tables, security rules, billing and khata functions
src/components/             Tables, Bills and Settings screens
```

The billing and role rules exist in two places: `src/lib/` and `src/data/localStore.ts` (demo mode, live timers, which buttons show) and `supabase/migrations` (what is actually allowed and charged). If you change a rule, change both.

## Credits

- Food and illustration pictures in `public/food` and `public/art`: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT licence.
- Font: Plus Jakarta Sans (SIL Open Font Licence), bundled through `@fontsource-variable/plus-jakarta-sans`.
