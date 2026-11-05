import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeftRight,
  BarChart3,
  FileText,
  Inbox,
  Landmark,
  LineChart,
  Lock,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

const Logo = ({ className = "h-9 w-9" }: { className?: string }) => (
  <span
    className={`flex items-center justify-center rounded-xl bg-brand-400 text-slate-950 ${className}`}
  >
    <svg viewBox="0 0 32 32" className="h-5 w-5 fill-current">
      <path d="M9 22V10h11v3h-7.5v2.5H19v3h-6.5V22H9Z" />
      <circle cx="23" cy="20.5" r="2.4" opacity="0.6" />
    </svg>
  </span>
);

const FEATURES = [
  {
    icon: FileText,
    title: "Statement import",
    text: "Drop in bank PDF statements and get a clean, deduplicated ledger with running balances as the source of truth.",
  },
  {
    icon: Inbox,
    title: "Gmail sync",
    text: "Read-only inbox access pulls bank alert emails the moment you ask — only messages newer than what's on record.",
  },
  {
    icon: MessageSquare,
    title: "SMS sync, on your terms",
    text: "One tap asks your phone to replay bank SMS. Card purchases and transfers land in seconds — OTPs and promos never leave the phone's inbox.",
  },
  {
    icon: ArrowLeftRight,
    title: "Smart reconciliation",
    text: "The same purchase from a statement, an email and an SMS becomes one transaction — never three. Transfers between your own accounts are detected too.",
  },
  {
    icon: LineChart,
    title: "Analytics & forecasts",
    text: "Cash-flow trends, category budgets and a probabilistic balance forecast that shows the range of likely outcomes.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Your data stays in your own database. No OTPs, PINs or card numbers are ever stored — only normalized transactions.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your sources",
    text: "Upload a statement, connect Gmail read-only, and pair the SMS gateway app on your phone.",
  },
  {
    n: "02",
    title: "Sync when you want",
    text: "Nothing runs behind your back. Press sync and watch alerts reconcile against your statements.",
  },
  {
    n: "03",
    title: "See everything clearly",
    text: "Unified balances, spending by category, transfers untangled, and a forecast of where you're heading.",
  },
];

const SOURCES = [
  { icon: Landmark, label: "Allied Bank" },
  { icon: Landmark, label: "HBL" },
  { icon: Wallet, label: "NayaPay" },
  { icon: Inbox, label: "Gmail" },
  { icon: MessageSquare, label: "SMS" },
];

export function Landing() {
  return (
    <div className="min-h-screen scroll-smooth bg-slate-950 text-slate-200">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-bold text-white">FinSync</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#how" className="transition hover:text-white">
              How it works
            </a>
            <a href="#security" className="transition hover:text-white">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              Sign in
            </Link>
            <Link to="/login" className="btn-primary px-4 py-2 text-sm">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-grid relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 text-center">
          <div
            className="animate-fade-up mx-auto flex w-fit items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-3.5 py-1.5 text-xs font-semibold text-brand-300"
            style={{ animationDelay: "0ms" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Statements · Email · SMS — one ledger
          </div>
          <h1
            className="animate-fade-up mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Every rupee, every account,{" "}
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent">
              one clear view
            </span>
            .
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            FinSync unifies Allied Bank, HBL and NayaPay — importing statements,
            bank emails and SMS alerts into a single deduplicated ledger with
            balances you can actually trust.
          </p>
          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link to="/login" className="btn-primary px-6 py-3 text-base">
              Open your dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="btn border border-white/10 bg-white/5 px-6 py-3 text-base text-slate-200 hover:bg-white/10"
            >
              Explore features
            </a>
          </div>

          {/* Product preview */}
          <div
            className="animate-fade-up relative mx-auto mt-16 max-w-4xl"
            style={{ animationDelay: "320ms" }}
          >
            <div className="pointer-events-none absolute inset-x-10 -bottom-6 h-24 rounded-full bg-brand-400/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-glow backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-brand-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-3 text-xs text-slate-500">
                  finsync — dashboard
                </span>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-3">
                {[
                  { label: "Total balance", value: "Rs 2,230,222", accent: true },
                  { label: "This month in", value: "Rs 196,429" },
                  { label: "This month out", value: "Rs 48,118" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-white/5 bg-slate-950/60 p-4 text-left"
                  >
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    <p
                      className={`mt-1 text-xl font-bold ${
                        kpi.accent ? "text-brand-400" : "text-white"
                      }`}
                    >
                      {kpi.value}
                    </p>
                  </div>
                ))}
                <div className="sm:col-span-3">
                  <div className="flex h-28 items-end gap-2 rounded-xl border border-white/5 bg-slate-950/60 p-4">
                    {[34, 52, 41, 66, 48, 75, 58, 84, 64, 92, 70, 100].map(
                      (h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-500/30 to-brand-400"
                          style={{ height: `${h}%` }}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sources strip */}
          <div
            className="animate-fade-up mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500"
            style={{ animationDelay: "400ms" }}
          >
            <span className="text-xs uppercase tracking-widest text-slate-600">
              Works with
            </span>
            {SOURCES.map((s) => (
              <span key={s.label} className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-brand-400/80" />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
            Features
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-white sm:text-4xl">
            Built for how money actually moves
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            Banks tell you about the same transaction three different ways.
            FinSync listens to all of them and keeps exactly one truth.
          </p>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group animate-fade-up rounded-2xl border border-white/5 bg-slate-900/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400 transition group-hover:bg-brand-400 group-hover:text-slate-950">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
            How it works
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold text-white sm:text-4xl">
            From inbox noise to clean ledger
          </h2>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="animate-fade-up relative rounded-2xl border border-white/5 bg-slate-900/60 p-6"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <span className="text-4xl font-extrabold text-brand-400/25">
                  {s.n}
                </span>
                <h3 className="mt-3 text-base font-semibold text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {s.text}
                </p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-brand-400/40 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-white/5 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Security
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Your money data, your rules
            </h2>
            <p className="mt-4 leading-relaxed text-slate-400">
              FinSync is self-hosted and single-tenant: the database is yours.
              Email access is read-only. SMS sync is pull-based — nothing is
              forwarded until you ask, and sensitive messages are discarded on
              sight.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "No OTPs, PINs, CVVs or full card numbers — ever stored",
                "HMAC-signed sync channel between phone and server",
                "Read-only Gmail scope, revocable any time",
                "Every import is idempotent — re-syncs can't double count",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-brand-400/10 blur-3xl" />
            <div className="relative animate-float rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">SMS sync</p>
                <span className="flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300">
                  <RefreshCw className="h-3 w-3" /> On demand
                </span>
              </div>
              {[
                { icon: TrendingUp, text: "Card purchase — Rs 1,016.75", tag: "imported" },
                { icon: BarChart3, text: "Salary credit — Rs 143,849", tag: "imported" },
                { icon: Lock, text: "OTP 983079 …", tag: "discarded" },
              ].map((row) => (
                <div
                  key={row.text}
                  className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-4 py-3"
                >
                  <span className="flex items-center gap-3 text-sm text-slate-300">
                    <row.icon className="h-4 w-4 text-brand-400" />
                    {row.text}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      row.tag === "imported"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {row.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="bg-grid relative mx-auto max-w-6xl px-5 py-24 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/10 blur-3xl" />
          <h2 className="relative text-3xl font-bold text-white sm:text-4xl">
            Know where your money is.{" "}
            <span className="text-brand-400">Tonight.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-slate-400">
            Import your first statement and watch months of transactions
            organize themselves.
          </p>
          <Link
            to="/login"
            className="btn-primary relative mt-8 px-7 py-3 text-base"
          >
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="font-semibold text-slate-300">FinSync</span>
          </div>
          <p>© {new Date().getFullYear()} FinSync · Personal finance, unified.</p>
          <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
