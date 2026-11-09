"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { NotificationBell } from "@/components/NotificationBell";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";

export function AccountControls() {
  const account = useAccount();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { open, setOpen, box } = usePopup();

  if (!account) {
    return (
      <div className="account-area">
        <Link className="topbar-login" href={`/login?next=${encodeURIComponent(pathname)}`}>
          {t.nav.login}
        </Link>
      </div>
    );
  }

  async function logout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="account-area">
      <NotificationBell />
      <div className="topbar-popup" ref={box}>
        <button
          type="button"
          className="topbar-button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t.nav.accountMenu}
          onClick={() => setOpen(!open)}
        >
          <svg className="account-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
          </svg>
          <span className="account-label">{t.nav.account}</span>
        </button>
        {open && (
          <div className="topbar-panel account-panel" role="menu">
            <p className="account-email">{account.email}</p>
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
              {t.nav.account}
            </Link>
            {account.profileId && (
              <Link href={`/p/${account.profileId}`} role="menuitem" onClick={() => setOpen(false)}>
                {t.nav.myMatches}
              </Link>
            )}
            <button type="button" role="menuitem" onClick={logout}>
              {t.nav.logout}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
