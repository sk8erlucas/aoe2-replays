"use client";

import { useEffect, useState } from "react";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";
import { shareLinks } from "@/lib/share";

type Props = {
  url: string;
  /** Text that goes with the link (match title). */
  title: string;
  onCopied: () => void;
};

/** "Share" button: the phone's own share sheet when there is one, plus copy and a few sites. */
export function ShareMenu({ url, title, onCopied }: Props) {
  const { t } = useI18n();
  const { open, setOpen, box } = usePopup();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(typeof navigator.share === "function"), []);

  async function copy() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      window.prompt(t.common.copyPrompt, url);
    }
  }

  async function shareNative() {
    setOpen(false);
    try {
      await navigator.share({ title, url });
    } catch {
      // closed by the user, or not allowed: nothing to do
    }
  }

  return (
    <div className="topbar-popup share-menu" ref={box}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        {t.share.button}
      </button>
      {open && (
        <div className="topbar-panel account-panel share-panel" role="menu">
          {native && (
            <button type="button" role="menuitem" onClick={shareNative}>
              {t.share.native}
            </button>
          )}
          <button type="button" role="menuitem" onClick={copy}>
            {t.common.copyLink}
          </button>
          {shareLinks(url, title).map((l) => (
            <a key={l.site} href={l.href} role="menuitem" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {t.share.sites[l.site]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
