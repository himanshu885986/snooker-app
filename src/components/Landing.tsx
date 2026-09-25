import { useState } from 'react'
import { useNow } from '../counter'
import { formatDuration, formatRupees } from '../lib/billing'
import { foodImageUrl } from '../lib/foodImages'
import { Icon, Wordmark } from './icons'
import { Avatar, Button } from './ui'

interface LandingProps {
  onLogin: () => void
  onRegister: () => void
}

const features = [
  { art: '/art/stopwatch.png', title: 'Live table timers', text: 'Start, pause for a power cut, end. Every table has its own rate, and the amount ticks up as they play.' },
  { art: '/art/trophy.png', title: 'Loser pays, automatically', text: 'Singles or doubles. Tap the side that lost and their share lands on each player’s bill, split to the paisa.' },
  { art: '/food/noodles.png', title: 'Food & drinks on the right bill', text: 'Maggi, chai, cold drinks, cigarettes — tap the item and it goes on the bill of the player who asked for it.' },
  { art: '/art/phone.png', title: 'UPI QR with the exact amount', text: 'Customers scan and pay from any UPI app, straight into your account. No payment gateway, no fees.' },
  { art: '/art/people.png', title: 'Staff roles', text: 'You handle money and time changes. Staff run the tables. Viewers can only look. Everyone logs in with mobile + PIN.' },
  { art: '/art/shop.png', title: 'All your shops, one login', text: 'Run several branches from one account. Each shop keeps its own tables, rates, menu and bills.' },
]

const faqs = [
  { q: 'Do I need to buy any hardware?', a: 'No. It runs in the browser on any phone, tablet or laptop. Add it to the home screen and it opens like an app.' },
  { q: 'What if the internet goes down?', a: 'Timers are worked out from the saved start time, so they stay correct. Starting, ending and billing need a connection to save.' },
  { q: 'Can my staff take money or change times?', a: 'Only the admin can collect payment, change a frame’s time, cancel a frame or remove items. Every change records who made it.' },
  { q: 'Can regulars pay later?', a: 'Yes. Put the unpaid amount on their khata, found by mobile number. The Khata tab shows who owes what, and you record their payment when it comes in.' },
  { q: 'Do players need to install anything?', a: 'No. They just scan the UPI QR code on their bill to pay.' },
  { q: 'Can I change the rate per minute?', a: 'Yes, per table, whenever you like. A frame that is already running keeps the rate it started with.' },
  { q: 'Is my shop’s data private?', a: 'Yes. Each business is kept separate, and staff only see the business they are added to.' },
]

const menu = ['noodles', 'tea', 'soda', 'fries', 'sandwich', 'cigarette', 'water', 'coffee', 'dumpling', 'icecream', 'juice', 'chocolate']

export function Landing({ onLogin, onRegister }: LandingProps) {
  return (
    <div className="bg-chalk">
      {/* Hero */}
      <section className="felt relative overflow-hidden text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brass-300/10 blur-3xl" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <Wordmark light />
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:text-white md:block">Features</a>
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:text-white md:block">How it works</a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:text-white md:block">FAQ</a>
            <Button variant="glass" className="px-3 py-2 text-sm" onClick={onLogin}>Log in</Button>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-14">
          <div className="rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brass-200 ring-1 ring-inset ring-white/15">
              <img src="/art/ball.png" alt="" className="h-4 w-4" /> For snooker &amp; pool parlours
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Run your parlour<br />without the <span className="text-brass-300">notebook.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/75">
              Live timers on every table. The losing side pays, split automatically. Food and drinks go on the right
              player’s bill. Collect by UPI in one scan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="brass" className="px-6 py-3.5 text-base" onClick={onRegister}>
                Start free <Icon name="arrowRight" className="h-4 w-4" />
              </Button>
              <Button variant="glass" className="px-6 py-3.5 text-base" onClick={onLogin}>I already have an account</Button>
            </div>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/60">
              <span className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-felt-300" /> No hardware</span>
              <span className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-felt-300" /> Any phone or tablet</span>
              <span className="flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-felt-300" /> Set up in 2 minutes</span>
            </p>
          </div>
          <HeroMockup />
        </div>
      </section>

      {/* Before / after */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-stone-900/5">
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-stone-400">The paper register</p>
            <ul className="space-y-3 text-stone-600">
              {['Entry and exit times written by hand', 'Minutes × rate worked out at the end of the night', 'Arguments over who lost and who pays', 'Khata balances scattered across pages'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-100 text-red-700"><Icon name="x" className="h-3 w-3" /></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-felt-900 p-6 text-white">
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-brass-300">With Snooker Counter</p>
            <ul className="space-y-3 text-white/85">
              {['One tap to start, pause and end each frame', 'The bill is calculated live, to the paisa', 'Tap who lost — their share is added for them', 'Khata and daily cash totals in one place'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-felt-400 text-felt-950"><Icon name="check" className="h-3 w-3" /></span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-16 sm:px-6">
        <SectionTitle eyebrow="Features" title="Everything the counter needs" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-md">
              <img src={f.art} alt="" className="mb-4 h-14 w-14" loading="lazy" />
              <h3 className="text-lg font-extrabold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-stone-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-4 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow="How it works" title="Three taps per frame" />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Start a frame', 'Pick the table and the players on each side. The timer starts.'],
              ['Tap who lost', 'The frame’s cost is split between the losing players and added to their bills.'],
              ['Collect', 'Show the UPI QR with the exact amount, or take cash. The bill is closed.'],
            ].map(([title, text], i) => (
              <div key={title} className="relative rounded-3xl bg-chalk p-6">
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-felt-800 text-lg font-extrabold text-brass-300">{i + 1}</span>
                <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-stone-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example bill */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Per-player bills" title="One visit, one clear bill" align="left" />
          <p className="-mt-4 text-lg text-stone-600">
            Amit played three frames on two tables, lost two, and had Maggi with two cold drinks.
            He pays for exactly that — nothing for the frame he won.
          </p>
          <ul className="mt-6 space-y-2 text-stone-700">
            {['Different rates per table are handled for you', 'Doubles: the losing pair split the frame', 'Paused time is never charged'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Icon name="check" className="h-5 w-5 text-felt-600" />{t}</li>
            ))}
          </ul>
        </div>
        <ExampleBill />
      </section>

      {/* Menu */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow="Shop sales" title="Sell anything you stock" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {menu.map((id) => (
              <div key={id} className="flex flex-col items-center rounded-2xl bg-chalk p-4">
                <img src={foodImageUrl(id)} alt="" className="h-14 w-14" />
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-stone-600">Add your own items and prices. Each one gets a picture automatically from its name.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-4 px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="FAQ" title="Questions shop owners ask" />
        <div className="divide-y divide-stone-200 rounded-3xl bg-white px-6 ring-1 ring-stone-900/5">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                {f.q}
                <Icon name="plus" className="h-5 w-5 shrink-0 text-stone-400 transition group-open:rotate-45" />
              </summary>
              <p className="mt-2 text-stone-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="px-4 pb-16 sm:px-6">
        <div className="felt mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:py-16">
          <img src="/art/ball.png" alt="" className="mx-auto mb-4 h-14 w-14" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to retire the register?</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/75">Create your business, add your tables and rates, and run tonight’s frames on it.</p>
          <Button variant="brass" className="mt-7 px-7 py-3.5 text-base" onClick={onRegister}>
            Start free <Icon name="arrowRight" className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-stone-900/5 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-stone-500">
          <Wordmark />
          <span>Made for snooker parlours in India · © {new Date().getFullYear()}</span>
          <button className="font-semibold text-felt-700 hover:underline" onClick={onLogin}>Staff log in</button>
        </div>
      </footer>
    </div>
  )
}

function SectionTitle({ eyebrow, title, align = 'center' }: { eyebrow: string; title: string; align?: 'center' | 'left' }) {
  return (
    <div className={`mb-10 ${align === 'center' ? 'text-center' : ''}`}>
      <p className="text-sm font-bold uppercase tracking-wider text-brass-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-felt-950 sm:text-4xl">{title}</h2>
    </div>
  )
}

/** A live-looking table card and bill, built from the real app styles. */
function HeroMockup() {
  const now = useNow()
  const [openedAt] = useState(Date.now)
  // Pretend the frame started 18 minutes before the page opened, ticking live.
  const seconds = 18 * 60 + 24 + Math.floor((now - openedAt) / 1000)
  const amount = Math.max(1, Math.round(seconds / 60)) * 700
  return (
    <div className="rise relative mx-auto w-full max-w-md [animation-delay:150ms]">
      <div className="felt rounded-3xl p-5 shadow-2xl shadow-black/40 ring-4 ring-[#7a4a2a]">
        <div className="flex items-center justify-between">
          <p className="text-lg font-extrabold">Table 2</p>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> In play</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          <span className="rounded-full bg-sky-400/20 px-2.5 py-1 text-sky-100">Amit &amp; Ravi</span>
          <span className="text-xs text-white/50">vs</span>
          <span className="rounded-full bg-violet-400/20 px-2.5 py-1 text-violet-100">Sonu &amp; Raj</span>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <span className="tabular text-5xl font-extrabold tracking-tight">{formatDuration(seconds)}</span>
          <span className="text-right">
            <span className="tabular block text-2xl font-extrabold text-brass-300">{formatRupees(amount)}</span>
            <span className="block text-xs text-white/60">₹7/min</span>
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <span className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-semibold ring-1 ring-inset ring-white/20"><Icon name="pause" className="h-4 w-4" /> Pause</span>
          <span className="flex items-center justify-center gap-2 rounded-xl bg-brass-400 py-2.5 text-sm font-semibold text-felt-950"><Icon name="flag" className="h-4 w-4" /> End frame</span>
        </div>
      </div>

      <div className="relative -mt-6 ml-auto w-[85%] rotate-2 rounded-3xl bg-white p-4 text-stone-900 shadow-2xl shadow-black/30 sm:-mr-6">
        <div className="mb-2 flex items-center gap-2">
          <Avatar name="Sonu" className="h-8 w-8 text-xs" />
          <p className="font-bold">Sonu’s bill</p>
        </div>
        {[['tea', 'Masala chai × 2', 3000], ['fries', 'Chips', 2000]].map(([img, name, price]) => (
          <div key={name} className="flex items-center gap-2 border-b border-dashed border-stone-200 py-1.5 text-sm">
            <img src={foodImageUrl(img as string)} alt="" className="h-7 w-7" />
            <span className="flex-1">{name}</span>
            <b className="tabular">{formatRupees(price as number)}</b>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold">Total</span>
          <span className="tabular text-xl font-extrabold">₹50</span>
        </div>
      </div>
    </div>
  )
}

function ExampleBill() {
  const lines: [string | null, string, string, number][] = [
    [null, 'Table 1 · lost frame', '20 min × ₹7 · split 2 ways', 7000],
    [null, 'Table 3 · lost frame', '15 min × ₹9', 13500],
    ['noodles', 'Maggi', '₹40 each', 4000],
    ['soda', 'Cold drink × 2', '₹30 each', 6000],
  ]
  return (
    <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-5 shadow-xl shadow-felt-950/10 ring-1 ring-stone-900/5">
      <div className="mb-3 flex items-center gap-3">
        <Avatar name="Amit" className="h-11 w-11" />
        <div>
          <p className="font-extrabold">Amit</p>
          <p className="text-xs text-stone-500">3 frames played · 1 won</p>
        </div>
      </div>
      <ul className="divide-y divide-dashed divide-stone-200">
        {lines.map(([img, title, detail, amount]) => (
          <li key={title} className="flex items-center gap-3 py-2.5 text-sm">
            {img
              ? <img src={foodImageUrl(img)} alt="" className="h-9 w-9" />
              : <span className="grid h-9 w-9 place-items-center rounded-full bg-felt-800 text-white"><Icon name="clock" className="h-4 w-4" /></span>}
            <span className="flex-1"><b className="block">{title}</b><span className="text-xs text-stone-500">{detail}</span></span>
            <b className="tabular">{formatRupees(amount)}</b>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-900 pt-3">
        <span className="font-bold">Total</span>
        <span className="tabular text-3xl font-extrabold">₹305</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold">
        <span className="flex items-center justify-center gap-2 rounded-xl bg-felt-800 py-2.5 text-white"><Icon name="cash" className="h-4 w-4" /> Cash</span>
        <span className="flex items-center justify-center gap-2 rounded-xl bg-brass-400 py-2.5 text-felt-950"><Icon name="qr" className="h-4 w-4" /> UPI</span>
      </div>
    </div>
  )
}
