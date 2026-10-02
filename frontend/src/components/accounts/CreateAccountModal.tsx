import { useState } from "react";
import { Modal } from "../ui/Modal";
import type { Account, Provider } from "../../types";
import { PROVIDERS } from "../../types";
import { useAppData, type NewAccountInput } from "../../context/AppDataContext";
import { ApiError } from "../../lib/api";

const ACCOUNT_TYPES: { value: Account["type"]; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
  { value: "wallet", label: "Wallet" },
];

export function CreateAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addAccount } = useAppData();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("abl");
  const [type, setType] = useState<Account["type"]>("current");
  const [last4, setLast4] = useState("");
  const [opening, setOpening] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setProvider("abl");
    setType("current");
    setLast4("");
    setOpening("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: NewAccountInput = {
      name: name.trim() || `${PROVIDERS[provider].label} ${type}`,
      provider,
      type,
      mask: `•••• ${(last4 || "0000").slice(-4).padStart(4, "0")}`,
      openingBalance: Number(opening) || 0,
      color: PROVIDERS[provider].color,
    };
    setSubmitting(true);
    setError(null);
    try {
      await addAccount(input);
      reset();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the account."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add account">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">
            Bank / provider
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => {
              const meta = PROVIDERS[p];
              const active = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-brand-500 ring-2 ring-brand-500/30"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                  }`}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.label.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    {meta.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">
            Account name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Allied Salary Account"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Account["type"])}
              className="input"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              Last 4 digits
            </label>
            <input
              value={last4}
              onChange={(e) =>
                setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="input"
              placeholder="4821"
              inputMode="numeric"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">
            Opening balance (PKR)
          </label>
          <input
            value={opening}
            onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ""))}
            className="input"
            placeholder="0"
            inputMode="decimal"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add account"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Modal>
  );
}
