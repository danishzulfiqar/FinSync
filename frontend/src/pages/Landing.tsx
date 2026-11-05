import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeftRight,
  FileText,
  Inbox,
  Landmark,
  LineChart,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

/* ----------------------------- motion primitives ---------------------------- */

/** Adds `.is-visible` when the element enters the viewport (once). */
function useRevealRef<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

function Reveal({
  children,
  delay = 0,
  variant = "",
  className = "",
  threshold,
}: {
  children: ReactNode;
  delay?: number;
  variant?: "" | "reveal-left" | "reveal-right" | "reveal-scale";
  className?: string;
  threshold?: number;
}) {
  const ref = useRevealRef<HTMLDivElement>(threshold);
  const style: CSSProperties | undefined = delay
    ? { transitionDelay: `${delay}ms` }
    : undefined;
  return (
    <div ref={ref} style={style} className={`reveal ${variant} ${className}`}>
      {children}
    </div>
  );
}

/** Counts from 0 to `value` when scrolled into view. */
function CountUp({
  value,
  prefix = "",
  suffix = "",
  duration = 1400,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = `${prefix}${Math.round(value * eased).toLocaleString()}${suffix}`;
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, prefix, suffix, duration]);
  return <span ref={ref}>{`${prefix}0${suffix}`}</span>;
}

/** Subtle Apple-style parallax: the hero preview settles as you scroll. */
function useParallax<T extends HTMLElement>(factor = 0.08, maxShift = 48) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const shift = Math.min(window.scrollY * factor, maxShift);
        const scale = Math.min(1 + window.scrollY * 0.00006, 1.03);
        el.style.transform = `translateY(${-shift}px) scale(${scale})`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [factor, maxShift]);
  return ref;
}

/* --------------------------------- content ---------------------------------- */

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
    icon: LineChart,
    title: "Balance predictions",
    text: "A probabilistic forecast of where your balance is heading — the median path plus the realistic range of outcomes, learned from your own history.",
  },
  {
    icon: FileText,
    title: "Statement import",
    text: "Drop in bank PDF statements and get a clean, deduplicated ledger with running balances as the source of truth.",
  },
  {
    icon: MessageSquare,
    title: "SMS sync, on your terms",
    text: "One tap asks your phone to replay bank SMS. Card purchases land in seconds — OTPs and promos never leave your inbox.",
  },
  {
    icon: Inbox,
    title: "Gmail sync",
    text: "Read-only inbox access pulls bank alert emails on demand — only messages newer than what's already on record.",
  },
  {
    icon: ArrowLeftRight,
    title: "Smart reconciliation",
    text: "The same purchase from a statement, an email and an SMS becomes one transaction — never three. Own-account transfers get untangled too.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Self-hosted, single-tenant. No OTPs, PINs or card numbers are ever stored — only normalized transactions.",
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
    text: "Unified balances, spending by category, transfers untangled — and a forecast of where you're heading.",
  },
];

const SOURCES = [
  { icon: Landmark, label: "Allied Bank" },
  { icon: Landmark, label: "HBL" },
  { icon: Wallet, label: "NayaPay" },
  { icon: Mail, label: "Gmail" },
  { icon: MessageSquare, label: "SMS" },
  { icon: FileText, label: "PDF statements" },
];

/* ------------------------------ demo components ------------------------------ */

/** Animated forecast: band fades in, median line draws itself. */
function ForecastDemo() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Projected balance · 6 months</p>
          <p className="mt-1 text-2xl font-bold text-white">
            <CountUp value={2412000} prefix="Rs " />
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300">
          <Sparkles className="h-3 w-3" /> Median path
        </span>
      </div>
      <svg viewBox="0 0 480 200" className="mt-4 w-full" aria-hidden>
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="#26262e" strokeWidth="1" />
        ))}
        {/* P10–P90 band */}
        <path
          className="draw-fill"
          d="M0,150 C80,142 150,138 230,120 C320,100 400,92 480,60 L480,140 C400,160 320,166 230,172 C150,176 80,172 0,168 Z"
          fill="url(#band)"
        />
        {/* Median line */}
        <path
          className="draw-path"
          pathLength="1"
          d="M0,158 C80,154 150,150 230,142 C320,132 400,120 480,98"
          fill="none"
          stroke="#facc15"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0.03" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute right-6 top-[118px] hidden h-3 w-3 animate-pulse-dot rounded-full bg-brand-400 sm:block" />
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-brand-400" /> Most likely path
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded bg-brand-400/20" /> 80% of outcomes
        </span>
      </div>
    </div>
  );
}

/** Three noisy sources collapse into one clean transaction. */
function ReconcileDemo() {
  const rows = [
    { icon: FileText, label: "Statement", text: "D.Card/POS CINNABON ISB · Rs 1,016.75" },
    { icon: Mail, label: "Email", text: "Transaction alert · Rs 1,016.75" },
    { icon: MessageSquare, label: "SMS", text: "Debit Card charged Rs 1,016.75" },
  ];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <Reveal key={r.label} delay={i * 140} variant="reveal-left">
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-4 py-2.5">
              <span className="flex items-center gap-3 text-sm text-slate-300">
                <r.icon className="h-4 w-4 text-brand-400" />
                {r.text}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {r.label}
              </span>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={520} variant="reveal-scale">
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ArrowLeftRight className="h-3.5 w-3.5 text-brand-400" />
          merged into
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl border border-brand-400/30 bg-brand-400/10 px-4 py-3 shadow-glow">
          <div>
            <p className="text-sm font-semibold text-white">
              Card purchase — CINNABON ISLAMABAD
            </p>
            <p className="text-xs text-slate-400">
              Rs 1,016.75 · 3 sources · balance verified
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            1 transaction
          </span>
        </div>
      </Reveal>
    </div>
  );
}

/** On-demand sync: imported vs discarded. */
function SyncDemo() {
  const rows = [
    { icon: Wallet, text: "Card purchase — Rs 1,016.75", tag: "imported" },
    { icon: Landmark, text: "Salary credit — Rs 143,849", tag: "imported" },
    { icon: Lock, text: "OTP 983079 …", tag: "discarded" },
    { icon: Mail, text: "40% off this Eid! …", tag: "discarded" },
  ];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">SMS sync</p>
        <span className="flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300">
          <RefreshCw className="h-3 w-3" /> On demand
        </span>
      </div>
      {rows.map((row, i) => (
        <Reveal key={row.text} delay={i * 130} variant="reveal-right">
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-4 py-3">
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
        </Reveal>
      ))}
    </div>
  );
}

/* ---------------------------------- page ------------------------------------ */

export function Landing() {
  const previewRef = useParallax<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen scroll-smooth bg-slate-950 text-slate-200">
      {/* Nav */}
      <header
        className={`sticky top-0 z-40 border-b transition-all duration-500 ${
          scrolled
            ? "border-white/10 bg-slate-950/90 shadow-soft backdrop-blur"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-lg font-bold text-white">FinSync</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <a href="#predictions" className="transition hover:text-white">
              Predictions
            </a>
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
        <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[780px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-24 text-center">
          <div
            className="animate-fade-up mx-auto flex w-fit items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-3.5 py-1.5 text-xs font-semibold text-brand-300"
            style={{ animationDelay: "0ms" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Statements · Email · SMS — one ledger
          </div>
          <h1
            className="animate-fade-up mx-auto mt-7 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-7xl"
            style={{ animationDelay: "90ms" }}
          >
            Your money.
            <br />
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent">
              Finally in focus.
            </span>
          </h1>
          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-base text-slate-400 sm:text-lg"
            style={{ animationDelay: "180ms" }}
          >
            FinSync unifies Allied Bank, HBL and NayaPay — importing statements,
            bank emails and SMS alerts into one deduplicated ledger, then
            predicting where your balance goes next.
          </p>
          <div
            className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "270ms" }}
          >
            <Link to="/login" className="btn-primary px-6 py-3 text-base">
              Open your dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#predictions"
              className="btn border border-white/10 bg-white/5 px-6 py-3 text-base text-slate-200 hover:bg-white/10"
            >
              See predictions
            </a>
          </div>

          {/* Product preview with parallax settle */}
          <div
            className="animate-fade-up relative mx-auto mt-20 max-w-4xl"
            style={{ animationDelay: "380ms" }}
          >
            <div className="pointer-events-none absolute inset-x-10 -bottom-6 h-24 rounded-full bg-brand-400/20 blur-3xl" />
            <div
              ref={previewRef}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-glow backdrop-blur"
            >
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
                  { label: "Total balance", value: 2230222, accent: true },
                  { label: "This month in", value: 196429, accent: false },
                  { label: "This month out", value: 48118, accent: false },
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
                      <CountUp value={kpi.value} prefix="Rs " duration={1800} />
                    </p>
                  </div>
                ))}
                <div className="sm:col-span-3">
                  <div className="flex h-28 items-end gap-2 rounded-xl border border-white/5 bg-slate-950/60 p-4">
                    {[34, 52, 41, 66, 48, 75, 58, 84, 64, 92, 70, 100].map(
                      (h, i) => (
                        <div
                          key={i}
                          className="flex-1 origin-bottom rounded-t-sm bg-gradient-to-t from-brand-500/30 to-brand-400"
                          style={{ height: `${h}%`, transitionDelay: `${i * 40}ms` }}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sources marquee */}
        <div className="relative border-t border-white/5 py-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
          <div className="overflow-hidden">
            <div className="animate-marquee flex w-max items-center gap-14 pr-14">
              {[...SOURCES, ...SOURCES].map((s, i) => (
                <span
                  key={`${s.label}-${i}`}
                  className="flex items-center gap-2.5 text-sm font-medium text-slate-500"
                >
                  <s.icon className="h-4 w-4 text-brand-400/70" />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Predictions showcase */}
      <section id="predictions" className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Predictions
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              Know next month
              <br />
              before it happens.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              FinSync learns your income and spending rhythm, then simulates
              thousands of possible futures. You see the most likely balance
              path — and the realistic range around it — not a single guess.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "Median forecast with P10–P90 confidence band",
                "Spending pace and category budget burn-down",
                "Updated instantly after every sync or import",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <LineChart className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="reveal-scale" delay={120} threshold={0.35}>
            <ForecastDemo />
          </Reveal>
        </div>
      </section>

      {/* Reconciliation showcase */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left" className="md:order-2">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Reconciliation
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              Three alerts.
              <br />
              One truth.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              Banks tell you about the same purchase three different ways.
              FinSync fingerprints every record, matches statement lines to
              their email and SMS twins, and keeps your balance exact — never
              double-counted.
            </p>
          </Reveal>
          <Reveal variant="reveal-right" className="md:order-1" threshold={0.35}>
            <ReconcileDemo />
          </Reveal>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 text-center sm:grid-cols-4">
          {[
            { v: 3, suffix: "", label: "banks, one ledger" },
            { v: 2400, suffix: "+", label: "transactions unified" },
            { v: 500, suffix: "+", label: "duplicates merged" },
            { v: 0, suffix: "", label: "OTPs or PINs stored" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <p className="text-4xl font-extrabold text-brand-400 sm:text-5xl">
                <CountUp value={s.v} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm text-slate-400">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
              Features
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-white sm:text-4xl">
              Built for how money actually moves
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 110}>
                <div className="group h-full rounded-2xl border border-white/5 bg-slate-900/60 p-6 transition duration-300 hover:-translate-y-1.5 hover:border-brand-400/30 hover:shadow-glow">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400 transition duration-300 group-hover:scale-110 group-hover:bg-brand-400 group-hover:text-slate-950">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {f.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
              How it works
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold text-white sm:text-4xl">
              From inbox noise to clean ledger
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 130} variant="reveal-scale">
                <div className="relative h-full rounded-2xl border border-white/5 bg-slate-900/60 p-6 transition duration-300 hover:border-brand-400/25">
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Security
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-5xl">
              Your money data,
              <br />
              your rules.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              FinSync is self-hosted and single-tenant: the database is yours.
              Email access is read-only. SMS sync is pull-based — nothing moves
              until you ask, and sensitive messages are discarded on sight.
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
          </Reveal>
          <Reveal variant="reveal-right" threshold={0.35}>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-brand-400/10 blur-3xl" />
              <div className="animate-float">
                <SyncDemo />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="bg-grid relative mx-auto max-w-6xl px-5 py-28 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/10 blur-3xl" />
          <Reveal>
            <h2 className="relative text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Know where your money is.{" "}
              <span className="text-brand-400">Tonight.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-md text-slate-400">
              Import your first statement and watch months of transactions
              organize themselves.
            </p>
            <Link
              to="/login"
              className="btn-primary relative mt-9 px-7 py-3 text-base"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
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
          <Link
            to="/login"
            className="font-semibold text-brand-400 hover:text-brand-300"
          >
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
