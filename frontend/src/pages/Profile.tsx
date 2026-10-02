import { useState, type FormEvent } from "react";
import { User as UserIcon, Mail, Lock, Check } from "lucide-react";
import { Layout } from "../components/layout/Layout";
import { Card, CardHeader } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { formatDate, initials } from "../lib/format";

export function Profile() {
  const { user, updateProfile, changePassword } = useAuth();

  return (
    <Layout title="Profile" subtitle="Manage your account and security">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white">
              {user ? initials(user.name) : "?"}
            </span>
            <p className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
              {user?.name}
            </p>
            <p className="text-sm text-slate-400">{user?.email}</p>
            {user?.createdAt && (
              <p className="mt-3 text-xs text-slate-400">
                Member since {formatDate(user.createdAt)}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <ProfileForm
            key={`${user?.name}-${user?.email}`}
            initialName={user?.name ?? ""}
            initialEmail={user?.email ?? ""}
            onSave={updateProfile}
          />
          <PasswordForm onSave={changePassword} />
        </div>
      </div>
    </Layout>
  );
}

function ProfileForm({
  initialName,
  initialEmail,
  onSave,
}: {
  initialName: string;
  initialEmail: string;
  onSave: (input: { name: string; email: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== initialName || email.trim() !== initialEmail;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave({ name: name.trim(), email: email.trim() });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Account details" subtitle="Your name and email" />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" icon={UserIcon}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="input pl-9"
            placeholder="Your name"
            required
          />
        </Field>
        <Field label="Email" icon={Mail}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
            className="input pl-9"
            placeholder="you@example.com"
            required
          />
        </Field>

        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && !dirty && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm({
  onSave,
}: {
  onSave: (current: string, next: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await onSave(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not change your password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Change password"
        subtitle="Use at least 8 characters"
      />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password" icon={Lock}>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input pl-9"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="New password" icon={Lock}>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input pl-9"
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm new password" icon={Lock}>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input pl-9"
              autoComplete="new-password"
              required
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          {done && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Password updated
            </span>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !current || !next || !confirm}
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-500">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        {children}
      </div>
    </div>
  );
}
