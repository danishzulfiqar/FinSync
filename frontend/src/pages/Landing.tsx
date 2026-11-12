import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowLeftRight,
  Cpu,
  Database,
  FileText,
  Fingerprint,
  GitBranch,
  Inbox,
  Landmark,
  LineChart,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

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

/** Subtle parallax: the hero diagram settles as you scroll. */
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

const HIGHLIGHTS = [
  {
    icon: FileText,
    title: "PDF statement parser",
    text: "Bank statements arrive as dense, glued-together PDF text. A layout-aware parser extracts rows, cleans descriptions, recovers merchants, and keeps the bank's running balance as ground truth.",
  },
  {
    icon: Inbox,
    title: "Gmail ingestion",
    text: "A read-only OAuth integration fetches bank alert emails on demand. Incremental checkpoints and rate-limit-aware retries mean each sync only touches what's new.",
  },
  {
    icon: Smartphone,
    title: "SMS gateway bridge",
    text: "An Android gateway app replays bank SMS to the backend over an HMAC-authenticated webhook — on demand, never automatically. OTPs and promos are rejected at the door.",
  },
  {
    icon: Fingerprint,
    title: "Fingerprint deduplication",
    text: "Every record gets a content fingerprint (provider, type, amount, time bucket). The same event seen twice — in any channel — can never create two rows.",
  },
  {
    icon: ArrowLeftRight,
    title: "Reconciliation engine",
    text: "Statement lines, emails and SMS describing one purchase are matched by reference, amount and time, then merged — the statement row survives, enriched with the alert's merchant details.",
  },
  {
    icon: LineChart,
    title: "Balance forecasting",
    text: "Income and spending rhythms feed a probabilistic simulation that projects the median balance path with a P10–P90 confidence band.",
  },
];

/** Providers and the channels each one speaks over — drives the arch diagram. */
const PROVIDERS = [
  { name: "ABL", sub: "Allied Bank", channels: ["Email"] },
  { name: "HBL", sub: "Habib Bank", channels: ["Email", "SMS"] },
  { name: "NayaPay", sub: "Wallet", channels: ["Email"] },
];

const OUTPUTS = [
  { icon: FileText, label: "Excel export", sub: "download the ledger" },
  { icon: LineChart, label: "Dashboard", sub: "balances & trends" },
  { icon: Sparkles, label: "Analytics", sub: "insights & forecasts" },
];

const ARCH_STEPS = [
  {
    icon: Inbox,
    title: "1 · Capture",
    text: "Every bank speaks a different dialect — ABL and NayaPay over Gmail, HBL over both email and card SMS. Per-provider parsers turn each message into one normalized transaction shape.",
  },
  {
    icon: Cpu,
    title: "2 · Reconcile",
    text: "A single ingestion choke point fingerprints every record, drops duplicates across channels, and merges the same purchase seen three ways into one row — the statement's running balance stays authoritative.",
  },
  {
    icon: LineChart,
    title: "3 · Use it",
    text: "The deduplicated ledger in Postgres powers a one-click Excel export, a live dashboard and analytics with probabilistic balance forecasts.",
  },
];

const STACK = [
  { icon: Cpu, label: "FastAPI · Python" },
  { icon: Database, label: "PostgreSQL · SQLAlchemy" },
  { icon: GitBranch, label: "Alembic migrations" },
  { icon: Sparkles, label: "React · TypeScript" },
  { icon: Wallet, label: "Tailwind CSS · Vite" },
  { icon: LineChart, label: "Recharts" },
  { icon: Smartphone, label: "android-sms-gateway" },
  { icon: Lock, label: "OAuth 2.0 · HMAC · JWT" },
];

const DECISIONS = [
  {
    title: "Sync is pull, not push",
    text: "Nothing runs in the background. Email and SMS are fetched only when asked, so the owner always knows when data moves.",
  },
  {
    title: "Statements are the source of truth",
    text: "Real-time alerts are fast but incomplete; statements carry the authoritative running balance. Alerts enrich statement rows — never compete with them.",
  },
  {
    title: "Idempotent by construction",
    text: "Every import path converges on one ingestion pipeline with fingerprint checks, so re-running any sync is always safe.",
  },
  {
    title: "Sensitive data never lands",
    text: "OTPs, PINs and card numbers are filtered out before persistence. Only normalized transactions are stored.",
  },
];

/* ------------------------------ demo components ------------------------------ */

/** Animated forecast: band fades in, median line draws itself. */
function ForecastDemo() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">
            Projected balance · illustrative
          </p>
          <p className="mt-1 text-2xl font-bold text-white">Median + band</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300">
          <Sparkles className="h-3 w-3" /> Simulation
        </span>
      </div>
      <svg viewBox="0 0 480 200" className="mt-4 w-full" aria-hidden>
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="#26262e" strokeWidth="1" />
        ))}
        <path
          className="draw-fill"
          d="M0,150 C80,142 150,138 230,120 C320,100 400,92 480,60 L480,140 C400,160 320,166 230,172 C150,176 80,172 0,168 Z"
          fill="url(#band)"
        />
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
    { icon: FileText, label: "Statement", text: "D.Card/POS COFFEE HOUSE LHE · Rs 1,250.00" },
    { icon: Mail, label: "Email", text: "Transaction alert · Rs 1,250.00" },
    { icon: MessageSquare, label: "SMS", text: "Debit Card charged Rs 1,250.00" },
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
          fingerprinted & merged into
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl border border-brand-400/30 bg-brand-400/10 px-4 py-3 shadow-glow">
          <div>
            <p className="text-sm font-semibold text-white">
              Card purchase — COFFEE HOUSE
            </p>
            <p className="text-xs text-slate-400">
              Rs 1,250.00 · 3 sources · balance verified
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
    { icon: Wallet, text: "Card purchase — Rs 1,250.00", tag: "imported" },
    { icon: Landmark, text: "Funds received — Rs 25,000", tag: "imported" },
    { icon: Lock, text: "OTP 123456 …", tag: "discarded" },
    { icon: Mail, text: "40% off this weekend! …", tag: "discarded" },
  ];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">SMS replay</p>
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

/** A single node card in the architecture flow. */
function FlowNode({
  icon: Icon,
  title,
  sub,
  primary = false,
}: {
  icon: typeof Wallet;
  title: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <div
      className={`group relative flex w-full max-w-sm items-center gap-3 rounded-2xl border px-5 py-4 backdrop-blur transition duration-300 hover:-translate-y-0.5 ${
        primary
          ? "border-brand-400/40 bg-brand-400/10 shadow-glow"
          : "border-white/10 bg-slate-900/80 hover:border-brand-400/30 hover:shadow-glow"
      }`}
    >
      {primary && (
        <span className="pointer-events-none absolute -inset-px rounded-2xl ring-1 ring-brand-400/30 animate-pulse-dot" />
      )}
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition duration-300 ${
          primary
            ? "bg-brand-400 text-slate-950"
            : "border border-brand-400/20 bg-brand-400/10 text-brand-400 group-hover:scale-110 group-hover:bg-brand-400 group-hover:text-slate-950"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-left">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

/** Straight connector between two full-width tiers, with a flowing data dot. */
function Stem() {
  return (
    <svg
      className="h-9 w-6"
      viewBox="0 0 24 36"
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        className="draw-path"
        pathLength={1}
        d="M12 0 V36"
        stroke="#facc15"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle r="2.4" fill="#facc15">
        <animateMotion dur="1.8s" repeatCount="indefinite" path="M12 0 V36" />
      </circle>
    </svg>
  );
}

/** Branching connector: one node fans out to three, or three fan into one. */
function Branch({ direction }: { direction: "out" | "in" }) {
  const out = [
    "M150 2 C150 36 50 24 50 62",
    "M150 2 V62",
    "M150 2 C150 36 250 24 250 62",
  ];
  const inn = [
    "M50 2 C50 36 150 24 150 62",
    "M150 2 V62",
    "M250 2 C250 36 150 24 150 62",
  ];
  const paths = direction === "out" ? out : inn;
  return (
    <svg
      className="h-16 w-full"
      viewBox="0 0 300 64"
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      {paths.map((d, i) => (
        <g key={d}>
          <path
            className="draw-path"
            pathLength={1}
            style={{ transitionDelay: `${i * 140}ms` }}
            d={d}
            stroke="#facc15"
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle r="2.4" fill="#facc15">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              begin={`${i * 0.3}s`}
              path={d}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}

/** Full top-down system architecture: accounts → channels → engine → DB → outputs. */
function ArchitectureFlow() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="pointer-events-none absolute inset-x-10 top-1/2 h-72 -translate-y-1/2 rounded-full bg-brand-400/5 blur-3xl" />
      <div className="relative flex flex-col items-center">
        <FlowNode
          icon={Wallet}
          title="Your accounts"
          sub="one person · three banks"
          primary
        />
        <Stem />
        <Branch direction="out" />

        {/* Providers + the channels each speaks over */}
        <div className="grid w-full grid-cols-3 gap-2.5 sm:gap-4">
          {PROVIDERS.map((p, i) => (
            <Reveal key={p.name} delay={i * 120} variant="reveal-scale">
              <div className="group h-full rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-center backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow sm:p-4">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400 transition duration-300 group-hover:scale-110 group-hover:bg-brand-400 group-hover:text-slate-950">
                  <Landmark className="h-4 w-4" />
                </span>
                <p className="mt-2 text-sm font-bold text-white">{p.name}</p>
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  {p.sub}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {p.channels.map((c) => {
                    const Icon = c === "SMS" ? MessageSquare : Mail;
                    return (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                      >
                        <Icon className="h-3 w-3 text-brand-400" />
                        {c}
                      </span>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Branch direction="in" />
        <FlowNode
          icon={Cpu}
          title="Transaction engine"
          sub="parse → fingerprint → dedup → reconcile"
        />
        <Stem />
        <FlowNode
          icon={Database}
          title="SQLite / PostgreSQL"
          sub="running balance = source of truth"
        />
        <Branch direction="out" />

        {/* Outputs */}
        <div className="grid w-full grid-cols-3 gap-2.5 sm:gap-4">
          {OUTPUTS.map((o, i) => (
            <Reveal key={o.label} delay={i * 120} variant="reveal-scale">
              <div className="group h-full rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-center backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow sm:p-4">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400 transition duration-300 group-hover:scale-110 group-hover:bg-brand-400 group-hover:text-slate-950">
                  <o.icon className="h-4 w-4" />
                </span>
                <p className="mt-2 text-sm font-bold text-white">{o.label}</p>
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  {o.sub}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- product tour ------------------------------- */

const TOUR = [
  {
    id: "dashboard",
    label: "Dashboard",
    url: "finsync.app/overview",
    src: "/shots/dashboard.png",
    blurb: "Every account, KPI and cash-flow trend unified on one overview.",
  },
  {
    id: "transactions",
    label: "Transactions",
    url: "finsync.app/transactions",
    src: "/shots/transactions.png",
    blurb:
      "A searchable, deduplicated ledger with inline categories and running balances.",
  },
  {
    id: "predictions",
    label: "Predictions",
    url: "finsync.app/predictions",
    src: "/shots/predictions.png",
    blurb:
      "A Monte-Carlo balance forecast learned from your own spending rhythm.",
  },
  {
    id: "accounts",
    label: "Accounts",
    url: "finsync.app/accounts",
    src: "/shots/accounts.png",
    blurb: "Balances across HBL, ABL and NayaPay, reconciled to the rupee.",
  },
  {
    id: "categories",
    label: "Categories",
    url: "finsync.app/categories",
    src: "/shots/categories.png",
    blurb: "Spending grouped the way you actually think about money.",
  },
];

/** A mac-style browser chrome around a product screenshot. */
function BrowserFrame({ src, url }: { src: string; url: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl ring-1 ring-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-rose-400/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
        <div className="ml-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1 text-[11px] text-slate-400">
            <Lock className="h-3 w-3" />
            {url}
          </div>
        </div>
      </div>
      <div className="aspect-[16/10] w-full overflow-hidden bg-slate-950">
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover object-top"
        />
      </div>
    </div>
  );
}

function ProductTour({
  onDemo,
  demoBusy,
}: {
  onDemo: () => void;
  demoBusy: boolean;
}) {
  const [active, setActive] = useState(0);
  const tab = TOUR[active];
  return (
    <section id="tour" className="border-t border-white/5 py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
            See it in action
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold leading-tight text-white sm:text-5xl">
            The whole picture, beautifully.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-slate-400">
            This is the real app, running on a seeded demo account. Click
            through the surfaces below — then open the live demo and explore it
            yourself.
          </p>
        </Reveal>

        <Reveal delay={80} className="mt-10 flex flex-wrap justify-center gap-2">
          {TOUR.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                i === active
                  ? "bg-brand-400 text-slate-950"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </Reveal>

        <Reveal delay={140} variant="reveal-scale" className="mt-8">
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-12 -bottom-10 h-40 rounded-full bg-brand-400/20 blur-3xl" />
            <BrowserFrame key={tab.id} src={tab.src} url={tab.url} />
          </div>
          <p className="mt-6 text-center text-sm text-slate-400">{tab.blurb}</p>
        </Reveal>

        <Reveal delay={200} className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={onDemo}
            disabled={demoBusy}
            className="btn-primary px-6 py-3 text-base disabled:opacity-70"
          >
            {demoBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading demo…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Open the live demo
              </>
            )}
          </button>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------- page ------------------------------------ */

export function Landing() {
  const heroRef = useParallax<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);
  const { loginDemo } = useAuth();
  const navigate = useNavigate();
  const [demoBusy, setDemoBusy] = useState(false);

  function openDemo() {
    if (demoBusy) return;
    setDemoBusy(true);
    // Demo loads from a bundled snapshot — instant, no backend round-trip.
    loginDemo();
    navigate("/", { replace: true });
  }

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
            <div className="leading-tight">
              <p className="text-base font-bold text-white">FinSync</p>
              <p className="text-[11px] text-slate-500">
                a personal finance engineering project
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <a href="#tour" className="transition hover:text-white">
              Live demo
            </a>
            <a href="#pipeline" className="transition hover:text-white">
              Architecture
            </a>
            <a href="#built" className="transition hover:text-white">
              How it's built
            </a>
            <a href="#decisions" className="transition hover:text-white">
              Design decisions
            </a>
            <a href="#stack" className="transition hover:text-white">
              Stack
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={openDemo}
              disabled={demoBusy}
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-60 sm:inline-flex"
            >
              {demoBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Live demo
            </button>
            <Link to="/login" className="btn-primary px-4 py-2 text-sm">
              Open the app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-grid relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[780px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 text-center">
          <div
            className="animate-fade-up mx-auto flex w-fit items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-3.5 py-1.5 text-xs font-semibold text-brand-300"
            style={{ animationDelay: "0ms" }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Self-hosted · open architecture · built in Pakistan
          </div>
          <h1
            className="animate-fade-up mx-auto mt-7 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-7xl"
            style={{ animationDelay: "90ms" }}
          >
            One ledger from
            <br />
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent">
              three noisy banks.
            </span>
          </h1>
          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-base text-slate-400 sm:text-lg"
            style={{ animationDelay: "180ms" }}
          >
            FinSync is a personal project that unifies Allied Bank, HBL and
            NayaPay activity — parsing PDF statements, Gmail alerts and bank SMS
            into a single deduplicated ledger with analytics and balance
            forecasts. This page is the story of how it works.
          </p>
          <div
            className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "270ms" }}
          >
            <button
              type="button"
              onClick={openDemo}
              disabled={demoBusy}
              className="btn-primary px-6 py-3 text-base disabled:opacity-70"
            >
              {demoBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading demo…
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  View live demo
                </>
              )}
            </button>
            <a
              href="#pipeline"
              className="btn border border-white/10 bg-white/5 px-6 py-3 text-base text-slate-200 hover:bg-white/10"
            >
              See the architecture
              <ArrowDown className="h-4 w-4" />
            </a>
          </div>

          {/* The problem */}
          <div
            ref={heroRef}
            className="animate-fade-up relative mx-auto mt-20 max-w-3xl"
            style={{ animationDelay: "380ms" }}
          >
            <div className="pointer-events-none absolute inset-x-10 -bottom-6 h-24 rounded-full bg-brand-400/20 blur-3xl" />
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-left backdrop-blur sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
                The problem
              </p>
              <p className="mt-3 leading-relaxed text-slate-300">
                One salary, three banks. Every purchase announces itself three
                different ways — a statement line weeks later, an email alert,
                an SMS within seconds — each with different wording, timing and
                reference numbers. Add OTPs and promos to the noise, and "how
                much money do I actually have?" becomes a surprisingly hard
                engineering question.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product tour */}
      <ProductTour onDemo={openDemo} demoBusy={demoBusy} />

      {/* Architecture / pipeline */}
      <section id="pipeline" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Architecture
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold leading-tight text-white sm:text-5xl">
              Every source, one pipeline.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-slate-400">
              Three very different inputs — PDF statements, Gmail alerts and
              bank SMS replayed from an Android gateway — converge on a single
              ingestion pipeline. Channel-specific parsers normalize each
              format; everything downstream is shared, so deduplication and
              reconciliation live in exactly one place before the clean ledger
              fans out to exports, the dashboard and analytics.
            </p>
          </Reveal>

          <Reveal className="mt-16" threshold={0.12}>
            <ArchitectureFlow />
          </Reveal>

          <div className="mt-16 grid gap-5 sm:grid-cols-3">
            {ARCH_STEPS.map((s, i) => (
              <Reveal key={s.title} delay={(i % 3) * 110}>
                <div className="h-full rounded-2xl border border-white/5 bg-slate-900/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-400">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {s.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Reconciliation story */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left" className="md:order-2">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              The hard part
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              Three alerts.
              <br />
              One truth.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              The same purchase arrives with different timestamps, different
              references and different wording in every channel. The
              reconciliation engine matches records by reference tokens, amount
              and time windows, classifies transaction kinds so an ATM
              withdrawal never pairs with a transfer, and merges matches into
              the statement row — keeping the bank's running balance exact.
            </p>
          </Reveal>
          <Reveal variant="reveal-right" className="md:order-1" threshold={0.35}>
            <ReconcileDemo />
          </Reveal>
        </div>
      </section>

      {/* SMS story */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              SMS ingestion
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              The phone is
              <br />
              part of the stack.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              Card purchases only announce themselves by SMS — so an Android
              gateway app turns the phone into a data source. On request, it
              replays bank messages to the backend over an HMAC-authenticated
              webhook. Parsers built from real message templates keep
              transactions and drop OTPs, promos and everything else unread.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "Pull-based: a sync happens only when requested",
                "Per-user signed webhook URLs — no shared secrets on the wire",
                "Idempotent ingestion: replaying a window can't double count",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
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

      {/* Forecasting story */}
      <section className="border-t border-white/5 py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
          <Reveal variant="reveal-left" className="md:order-2">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Forecasting
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">
              A range,
              <br />
              not a guess.
            </h2>
            <p className="mt-5 leading-relaxed text-slate-400">
              With a clean ledger in place, the fun part: income and spending
              rhythms feed a probabilistic simulation of the months ahead. The
              dashboard shows the median balance path and the P10–P90 band —
              an honest picture of uncertainty instead of a single line.
            </p>
          </Reveal>
          <Reveal
            variant="reveal-scale"
            className="md:order-1"
            delay={120}
            threshold={0.35}
          >
            <ForecastDemo />
          </Reveal>
        </div>
      </section>

      {/* How it's built — component highlights */}
      <section id="built" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
              How it's built
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-white sm:text-4xl">
              Six problems, six components
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map((f, i) => (
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

      {/* Design decisions */}
      <section id="decisions" className="border-t border-white/5 py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
              Design decisions
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold text-white sm:text-4xl">
              Choices that shaped the project
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {DECISIONS.map((d, i) => (
              <Reveal key={d.title} delay={(i % 2) * 120} variant="reveal-scale">
                <div className="h-full rounded-2xl border border-white/5 bg-slate-900/60 p-6 transition duration-300 hover:border-brand-400/25">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-brand-400" />
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {d.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">
                        {d.text}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section id="stack" className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-brand-400">
              Stack
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold text-white sm:text-4xl">
              Built with
            </h2>
          </Reveal>
        </div>
        <div className="relative mt-12 border-y border-white/5 py-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
          <div className="overflow-hidden">
            <div className="animate-marquee flex w-max items-center gap-14 pr-14">
              {[...STACK, ...STACK].map((s, i) => (
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

      {/* Closing */}
      <section className="border-t border-white/5">
        <div className="bg-grid relative mx-auto max-w-6xl px-5 py-28 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/10 blur-3xl" />
          <Reveal>
            <h2 className="relative text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              A project about making
              <br />
              <span className="text-brand-400">messy data honest.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-md text-slate-400">
              Statements, emails and SMS in — one trustworthy ledger out.
            </p>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={openDemo}
                disabled={demoBusy}
                className="btn-primary px-7 py-3 text-base disabled:opacity-70"
              >
                {demoBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading demo…
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Explore the live demo
                  </>
                )}
              </button>
              <Link
                to="/login"
                className="btn border border-white/10 bg-white/5 px-7 py-3 text-base text-slate-200 hover:bg-white/10"
              >
                Open the app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
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
          <p>
            © {new Date().getFullYear()} · A personal project by{" "}
            <a
              href="https://github.com/danishzulfiqar"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-400 hover:text-brand-300"
            >
              Danish Zulfiqar
            </a>
          </p>
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
