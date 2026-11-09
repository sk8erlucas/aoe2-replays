"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validate";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(errorText(t, json?.error?.code, res.status));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="auth-page">
        <h1>{isLogin ? t.auth.loginTitle : t.auth.registerTitle}</h1>
        <p className="muted">{t.auth.lead}</p>
        <form className="frame auth-card form-grid" onSubmit={submit}>
          <label className="field">
            {t.auth.email}
            <input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            {t.auth.password}
            <input
              type="password"
              required
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!isLogin && <span className="field-hint">{t.auth.passwordHint(PASSWORD_MIN)}</span>}
          </label>
          {!isLogin && <p className="field-hint">{t.auth.noRecovery}</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? t.auth.working : isLogin ? t.auth.loginSubmit : t.auth.registerSubmit}
            </button>
          </div>
        </form>
        <p className="auth-alt">
          {isLogin ? t.auth.noAccount : t.auth.hasAccount}{" "}
          <Link href={`/${isLogin ? "register" : "login"}${query}`}>{isLogin ? t.auth.registerTitle : t.auth.loginTitle}</Link>
        </p>
        <p className="auth-alt small muted">
          {t.auth.privacyBefore} <Link href="/privacy">{t.auth.privacyLink}</Link>
        </p>
      </div>
    </main>
  );
}
