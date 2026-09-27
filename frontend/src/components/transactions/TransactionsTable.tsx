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

  if (transactions.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        No transactions match your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Account</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const acc = accById.get(t.accountId);
            const cat = catById.get(t.categoryId);
            const provider = acc ? PROVIDERS[acc.provider] : undefined;
            const SourceIcon = sourceIcon[t.source];
            const credit = t.type === "credit";
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
                  {editable ? (
                    <select
                      value={t.categoryId}
                      onChange={(e) =>
                        updateTransactionCategory(t.id, e.target.value)
                      }
                      className="input max-w-[170px] cursor-pointer py-1.5 text-xs"
                      style={{ color: cat?.color }}
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
                    <Badge color={cat?.color}>{cat?.name ?? "—"}</Badge>
                  )}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
