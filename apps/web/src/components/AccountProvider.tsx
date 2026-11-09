"use client";

import { createContext, useContext } from "react";
import type { PublicAccount } from "@/lib/auth";

const AccountContext = createContext<PublicAccount | null>(null);

// The server layout passes the account in; router.refresh() updates it after a change.
export function AccountProvider({ account, children }: { account: PublicAccount | null; children: React.ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);

/** Tells the bell to look again, after linking or following a player. */
export const refreshNotifications = () => window.dispatchEvent(new Event("aoe2:notifications"));
