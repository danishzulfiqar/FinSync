import { PROVIDERS, type Transaction } from "../../types";
import { useAppData } from "../../context/AppDataContext";
import { formatCurrency, formatDate } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { ArrowDownLeft, ArrowUpRight, Mail, FileText, PencilLine } from "lucide-react";

const sourceIcon = {
  gmail: Mail,
  statement: FileText,
  manual: PencilLine,
} as const;

export function TransactionsTable({
  transactions,
  editable = true,
}: {
  transactions: Transaction[];
  editable?: boolean;
}) {
  const { accounts, categories, updateTransactionCategory } = useAppData();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const showBalance = transactions.some((t) => t.balanceAfter != null);

  if (transactions.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        No transactions match your filters.
      </div>
    );
  }

  const rows = transactions.map((t) => {
    const acc = accById.get(t.accountId);
    const cat = catById.get(t.categoryId);
    return {
      t,
      acc,
      cat,
      provider: acc ? PROVIDERS[acc.provider] : undefined,
      SourceIcon: sourceIcon[t.source],
      credit: t.type === "credit",
    };
  });

  const categoryControl = (
    t: Transaction,
    color?: string,
    name?: string,
    className = "max-w-[170px]"
  ) =>
    editable ? (
      <select
        value={t.categoryId}
        onChange={(e) => updateTransactionCategory(t.id, e.target.value)}
        className={`input cursor-pointer py-1.5 text-xs ${className}`}
        style={{ color }}
        aria-label="Category"
      >
        {categories.map((c) => (
          <option
            key={c.id}
            value={c.id}
            className="text-slate-700 dark:text-slate-200"
          >
            {c.name}
          </option>
        ))}
      </select>
    ) : (
      <Badge color={color}>{name ?? "—"}</Badge>
    );

  return (
    <>
      {/* Phone: card list */}
      <ul className="divide-y divide-slate-50 dark:divide-slate-800/60 md:hidden">
        {rows.map(({ t, acc, cat, provider, SourceIcon, credit }) => (
          <li key={t.id} className="flex gap-3 px-4 py-3.5">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                credit
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {credit ? (
                <ArrowDownLeft className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                  {t.description}
                </p>
                <p
                  className={`shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums ${
                    credit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {formatCurrency(credit ? t.amount : -t.amount, {
                    signed: true,
                  })}
                </p>
              </div>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                <SourceIcon className="h-3 w-3 shrink-0" />
                <span className="shrink-0">{formatDate(t.date)}</span>
                {acc && (
                  <>
                    <span aria-hidden>·</span>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: provider?.color }}
                    />
                    <span className="truncate">{acc.name}</span>
                  </>
                )}
                {t.pending && (
                  <span className="chip shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                    Pending
                  </span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                {categoryControl(
                  t,
                  cat?.color,
                  cat?.name,
                  "w-auto min-w-[8.5rem] max-w-[170px] flex-1"
                )}
                {showBalance && t.balanceAfter != null && (
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-400">
                    Bal {formatCurrency(t.balanceAfter)}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet & desktop: full table */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Account</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            {showBalance && (
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, acc, cat, provider, SourceIcon, credit }) => {
            return (
              <tr
                key={t.id}
                className="border-b border-slate-50 transition hover:bg-slate-50/70 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
              >
                <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                  {formatDate(t.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        credit
                          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {credit ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {t.description}
                      </p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
                        <SourceIcon className="h-3 w-3" />
                        {t.merchant}
                        {t.pending && (
                          <span className="chip bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {categoryControl(t, cat?.color, cat?.name)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: provider?.color }}
                    />
                    {acc?.name ?? "—"}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                    credit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {formatCurrency(credit ? t.amount : -t.amount, {
                    signed: true,
                  })}
                </td>
                {showBalance && (
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {t.balanceAfter != null ? formatCurrency(t.balanceAfter) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
