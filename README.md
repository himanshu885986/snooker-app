# PlayKhata

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
| `003_games_item_groups.sql` | PlayStation and other hourly games; item groups (Cigarettes → Gold Flake, Classic) |
| `004_subscriptions.sql` | 7-day trial, monthly fee per shop paid by UPI to the platform owner, blocking when unpaid |
| `005_fix_platform_settings_update.sql` | Fix saving Price & UPI in the platform dashboard |

## Subscriptions (charging shops for the app)

- Every new business gets a **free trial** (7 days). Businesses that existed when `004` was run got 7 days from then.
- After that they pay **price per shop × number of shops × months** (1, 3, 6 or 12) by UPI **to the platform owner's UPI ID**, straight from **Settings → Subscription** or the banner. Paying early adds time after the current period, so nothing is lost.
- The owner taps **"I've paid"** (with the UPI reference). While the platform owner checks it, the shop keeps access for a couple of days. If it's rejected, access stops, and there's no free access again for 30 days.
- When time runs out, **everything for that business is blocked in the database** (reads and actions) until a payment is approved. The owner sees a payment screen; staff see "ask the owner to renew". No data is deleted.

**Becoming the platform owner** (once, after running `004`):
1. Register in the app with your own mobile number.
2. In Supabase → SQL Editor run, with your number:
   ```sql
   insert into platform_admins (user_id) select id from app_users where phone = '9XXXXXXXXX';
   ```
3. Log in again, then open **Settings → Platform owner → Open platform dashboard**. Set your UPI ID, name and price per shop under **Price & UPI**. Approve payments under **Payments**, after checking your bank or UPI app. Use **Record payment** for cash or free days.

## Tables, stations and games

Each table or station has a type (Snooker, Pool, PlayStation, Table tennis, Carrom, Foosball, Other) and its own rules, set in **Settings → Tables & stations**:

- **Rate** per minute (₹7/min) or per hour (₹100/hr). It is stored per hour, so both are exact.
- **Blocks and minimum:** time is rounded to the nearest minute, then up to a whole block, and never below the minimum. For example, with 15-minute blocks and a 30-minute minimum, 10 minutes is charged as 30, and 47 minutes as 60.
- **Who pays:**
  - *Loser pays* (snooker, pool): two sides of 1–2 players, and the losing side pays.
  - *Players split* (PlayStation etc.): 1–8 players. When the session ends, the players you tick share the cost; untick everyone but one if one person pays for all.

A game that is running keeps the rules it started with, even if the rate is changed meanwhile.

## Item groups

Give items the same **group** (e.g. "Cigarettes") to show them as one tile on the bill with a choice of types (Gold Flake, Classic, Marlboro), each with its own price. The bill shows "Cigarettes · Gold Flake".

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
