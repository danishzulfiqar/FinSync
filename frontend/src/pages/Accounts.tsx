import { useState } from "react";
import { Plus, CreditCard } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { CreateAccountModal } from "../components/accounts/CreateAccountModal";
import { useAppData } from "../context/AppDataContext";
import { accountBalance } from "../lib/analytics";
import { formatCurrency } from "../lib/format";
import { PROVIDERS } from "../types";

export function Accounts() {
  const { accounts, transactions } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);
  const total = accounts.reduce(
    (s, a) => s + accountBalance(a, transactions),
    0
  );

  return (
    <Layout title="Accounts" subtitle="Bank & wallet balances">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="card flex-1 bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
          <p className="text-sm text-brand-100">Net worth (synced)</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {formatCurrency(total)}
          </p>
          <p className="mt-2 text-xs text-brand-100">
            Across {accounts.length} linked accounts
          </p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary h-11">
          <Plus className="h-4 w-4" />
          Add account
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const provider = PROVIDERS[a.provider];
          const balance = accountBalance(a, transactions);
          const txns = transactions.filter((t) => t.accountId === a.id).length;
          return (
            <div
              key={a.id}
              className="card overflow-hidden p-0 animate-fade-in"
            >
              <div
                className="relative h-28 p-5 text-white"
                style={{
                  background: `linear-gradient(135deg, ${provider.color}, ${provider.color}cc)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {provider.label}
                  </span>
                  <CreditCard className="h-5 w-5 opacity-80" />
                </div>
                <p className="absolute bottom-5 left-5 font-mono text-lg tracking-widest">
                  {a.mask}
                </p>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {a.name}
                    </p>
                    <p className="text-xs capitalize text-slate-400">
                      {a.type} · {txns} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Balance</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(balance)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button
          onClick={() => setModalOpen(true)}
          className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-slate-700"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Plus className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold">Link a new account</span>
        </button>
      </div>

      <CreateAccountModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Layout>
  );
}
