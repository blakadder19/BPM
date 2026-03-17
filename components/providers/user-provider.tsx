"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserRole } from "@/types/domain";

interface UserContextValue {
  role: UserRole;
  fullName: string;
  email: string;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  children,
  user,
}: {
  children: ReactNode;
  user: UserContextValue;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
