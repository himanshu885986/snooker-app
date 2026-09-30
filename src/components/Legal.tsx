// Privacy Policy, Terms, Refund Policy and Contact pages, at /privacy, /terms, /refund and /contact.
// Plain-language drafts written for the DPDP Act 2023 and IT Act 2000. Have a lawyer review them.

import type { ReactNode } from 'react'
import { company as c } from '../lib/company'
import { Wordmark } from './icons'

export type LegalPage = 'privacy' | 'terms' | 'refund' | 'contact'

export const legalPaths: Record<LegalPage, string> = {
  privacy: '/privacy', terms: '/terms', refund: '/refund', contact: '/contact',
}

export const legalTitles: Record<LegalPage, string> = {
  privacy: 'Privacy Policy', terms: 'Terms of Service', refund: 'Refund & Cancellation Policy', contact: 'Contact & Grievances',
}

export function legalPageFromPath(path: string): LegalPage | null {
  const entry = Object.entries(legalPaths).find(([, p]) => path.replace(/\/+$/, '') === p)
  return entry ? entry[0] as LegalPage : null
}

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      {(Object.keys(legalPaths) as LegalPage[]).map((p) => (
        <a key={p} href={legalPaths[p]} className="hover:underline">{legalTitles[p].replace(' & Cancellation', '')}</a>
      ))}
    </nav>
  )
}

const Mail = () => <a className="font-semibold text-felt-700 underline" href={`mailto:${c.email}`}>{c.email}</a>
const H = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-xl font-extrabold tracking-tight text-felt-950">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed text-stone-700">{children}</p>
const L = ({ items }: { items: ReactNode[] }) => (
  <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-stone-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
)

function Privacy() {
  return (
    <>
      <P>This policy explains what personal data {c.product} stores, why, where, for how long, and the rights you have over it, as required by the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.</P>

      <H>1. Who we are</H>
      <P>{c.product} ({c.website}) is run by {c.operator}. For anything about your data, write to <Mail /> ({c.grievanceOfficer}).</P>

      <H>2. Two kinds of data, two roles</H>
      <L items={[
        <><b>Your account</b> (shop owners and staff): we decide what is collected and why, so we are the <i>data fiduciary</i>.</>,
        <><b>Your players and customers</b> (names, optional mobile numbers, games, bills, khata): the <b>shop</b> enters and controls this data and is its data fiduciary. {c.product} stores and processes it only to provide the service to that shop, as its <i>data processor</i>.</>,
      ]} />

      <H>3. What we collect</H>
      <L items={[
        <><b>Account:</b> name, mobile number, role (admin, maintainer, viewer) and a PIN. The PIN is stored only as a one-way hash; nobody, including us, can read it.</>,
        <><b>Business:</b> business and shop names, the shop’s UPI ID and payee name, tables, rates, items and prices.</>,
        <><b>Entered by shops about players:</b> name, optional mobile number, games played, times, items bought, amounts, payments (cash or UPI, and the time) and khata balances.</>,
        <><b>Subscription payments to us:</b> amount, period and the UPI reference number you enter. We never receive bank, card or UPI PIN details.</>,
        <><b>Security records:</b> who started, paused, changed or ended a game or took a payment, and when; and which devices are logged in.</>,
      ]} />
      <P>We do <b>not</b> use advertising, analytics or tracking cookies, and we do not sell or share personal data for marketing. The app keeps your login and a few preferences in your browser’s storage so it keeps working.</P>

      <H>4. Why we use it</H>
      <L items={[
        'To run the service: timers, bills, payments, khata and reports for the shop.',
        'To log you in securely and keep each business’s data separate.',
        'To manage your subscription and confirm payments.',
        'To answer support requests, and to meet legal obligations.',
      ]} />
      <P>By creating an account you consent to this use of your account data. You can withdraw consent at any time by deleting your account (Settings → My account); the service can’t work without it.</P>

      <H>5. Where it is stored and who helps us</H>
      <L items={[
        <><b>Supabase</b> stores the database, in its <b>Mumbai, India</b> region.</>,
        <><b>Cloudflare</b> serves the website and protects it from attacks.</>,
        <><b>GitHub</b> keeps encrypted nightly backups for up to 30 days.</>,
      ]} />
      <P>These providers process data only on our instructions. UPI payments go directly between the payer and the payee; we are not a payment intermediary.</P>

      <H>6. How long we keep it</H>
      <L items={[
        'Account and business data: while the account or business exists.',
        'Bills older than 2 years: the player’s name and mobile number are removed automatically; the amounts stay so the shop’s accounts still add up.',
        'Customers with no games or khata for 2 years and nothing owed: erased automatically.',
        'Logins: expire after 30 days without use.',
        'Deleted accounts and businesses: removed from the live database immediately, and from backups within 30 days.',
      ]} />

      <H>7. Your rights</H>
      <L items={[
        <><b>Access:</b> Settings → My account → <i>Download my data</i>. Shop owners can also export all business data (Settings → Privacy &amp; data).</>,
        <><b>Correction:</b> edit it in the app, or write to us.</>,
        <><b>Erasure:</b> delete your account or your business in Settings. Shop owners can erase a customer’s personal data (Settings → Privacy &amp; data).</>,
        <><b>Grievances</b> and <b>nominating</b> someone to exercise your rights: write to <Mail />.</>,
        <><b>Players and customers of a shop:</b> please ask that shop first. If you can’t, write to us and we will pass your request to the shop and help it respond.</>,
      ]} />
      <P>We reply to requests within 30 days. If you’re not satisfied, you may complain to the Data Protection Board of India.</P>

      <H>8. Children</H>
      <P>{c.product} accounts are for adults running or working in a business. Shops must not record the mobile number or other contact details of anyone under 18 without a parent’s or guardian’s consent; a first name for the bill is enough.</P>

      <H>9. Security</H>
      <P>Data is encrypted in transit (HTTPS). PINs are hashed and locked after repeated wrong attempts. Access is checked in the database for every request, so one business can never see another’s data. Staff see only what their role allows. If a breach affecting your data ever happens, we will inform you and the Data Protection Board as the law requires.</P>

      <H>10. Changes</H>
      <P>If we change this policy we will update the date above and, for important changes, tell account holders in the app.</P>
    </>
  )
}

function Terms() {
  return (
    <>
      <P>These terms are an agreement between you and {c.operator} for the use of {c.product} ({c.website}). By creating an account or using the service you accept them.</P>

      <H>1. The service</H>
      <P>{c.product} helps game parlours (snooker, pool, PlayStation and similar) time games, keep bills, record payments and khata, and manage staff. It works in a web browser; there is nothing to install.</P>

      <H>2. Your account</H>
      <L items={[
        'The person who registers a business is its admin and is responsible for everyone they add as staff.',
        'Keep your PIN secret. Tell us straight away if you think someone else has used your account; you can also log out all devices from Settings.',
        'Give true details, and keep your mobile number up to date.',
      ]} />

      <H>3. Acceptable use</H>
      <L items={[
        'Use the service only for a lawful business, and follow the laws that apply to it, including tobacco rules (COTPA 2003) for anything you sell and age limits.',
        'Don’t use it for betting or gambling, to store data you have no right to hold, or to try to access other businesses’ data or disrupt the service.',
      ]} />

      <H>4. Your customers’ data</H>
      <P>Data you enter about your players and customers belongs to you, and you are responsible for it under the Digital Personal Data Protection Act, 2023: only collect what you need, tell customers why (for example, a mobile number for khata), and don’t record contact details of anyone under 18 without a parent’s consent. {c.product} processes this data only to provide the service to you: we keep it secure and confidential, don’t use it for anything else, delete it when you ask or when you delete your business, help you answer your customers’ requests, and tell you without delay about any breach affecting it.</P>

      <H>5. Free trial, fees and blocking</H>
      <L items={[
        'New businesses get a free trial (currently 7 days).',
        'After that, the fee is the price per shop shown in the app, for each shop in your business, paid in advance for 1, 3, 6 or 12 months by UPI.',
        'A payment counts once we confirm it has arrived. While we check it, you keep access for a short time; if it turns out not to have arrived, access stops.',
        'If the subscription isn’t renewed in time, the business is blocked until it is. Your data is kept and comes back as soon as you renew. Paying early never loses days.',
        'We may change prices with at least 15 days’ notice in the app; the new price applies from your next payment.',
      ]} />

      <H>6. Availability</H>
      <P>We work to keep {c.product} available and your data safe, including nightly backups, but the service is provided “as is”: there may be interruptions, and we can’t promise it will be error-free. Please keep your own records for anything you are legally required to keep, such as tax records; you can export your data at any time.</P>

      <H>7. Liability</H>
      <P>As far as the law allows, we are not liable for indirect losses such as lost profits, and our total liability to you is limited to the fees you paid us in the 3 months before the claim.</P>

      <H>8. Ending the service</H>
      <P>You can stop using {c.product} and delete your business or account at any time from Settings. We may suspend accounts that break these terms or the law. If we ever close the service, we will give at least 30 days’ notice so you can export your data.</P>

      <H>9. Law and disputes</H>
      <P>These terms are governed by the laws of India. Disputes will be handled by the courts {c.city ? `of ${c.city}` : 'in India'}. Before going to court, please write to us at <Mail /> so we can try to sort it out.</P>
    </>
  )
}

function Refund() {
  return (
    <>
      <L items={[
        <><b>No automatic charges.</b> {c.product} never debits your account. You pay by UPI yourself, for the period you choose, so there is nothing to cancel; simply don’t renew.</>,
        <><b>Changed your mind?</b> Write to <Mail /> within 7 days of a payment for a full refund of that payment.</>,
        <><b>Paid twice or the wrong amount?</b> We refund the extra, or add it as extra time, whichever you prefer.</>,
        <><b>After 7 days</b>, payments for the current period are not refundable, but you keep access until the end of the period you paid for.</>,
        <><b>If we suspend the service</b> for reasons that are not your fault, we refund the unused part of your payment.</>,
        'Refunds are sent to the UPI ID or bank account the payment came from, within 7 working days of approval.',
      ]} />
    </>
  )
}

function Contact() {
  return (
    <>
      <P>For help with the app, billing, or your data, write to <Mail />. Please include your business name and the mobile number you log in with.</P>
      <H>Grievance officer (DPDP Act)</H>
      <P>{c.grievanceOfficer}<br />{c.operator}<br />Email: <Mail /></P>
      <P>We acknowledge requests within 2 working days and resolve them within 30 days. If you’re a player or customer of a shop, please contact the shop first; if you can’t, write to us and we will help.</P>
    </>
  )
}

const content: Record<LegalPage, () => ReactNode> = { privacy: Privacy, terms: Terms, refund: Refund, contact: Contact }

export function LegalView({ page }: { page: LegalPage }) {
  const Body = content[page]
  return (
    <div className="min-h-screen bg-chalk">
      <header className="felt px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <a href="/"><Wordmark light /></a>
          <a href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">Back to app</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-felt-950 sm:text-4xl">{legalTitles[page]}</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated {c.lastUpdated}</p>
        <div className="rounded-3xl bg-white p-5 pb-8 mt-6 ring-1 ring-stone-900/5 sm:p-8">
          <Body />
        </div>
        <LegalLinks className="mt-6 text-sm text-stone-500" />
      </main>
    </div>
  )
}
