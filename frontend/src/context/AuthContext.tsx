"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
} from "@/lib/api";
import type { User } from "@/lib/types";

const TOKEN_KEY = "sbs_token";
const USER_KEY = "sbs_user";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUserState(JSON.parse(storedUser) as User);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  const persist = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUserState(nextUser);
  }, []);

  const setUser = useCallback((nextUser: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUserState(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY) || token;
    if (!storedToken) return null;
    try {
      const res = await fetchMe(storedToken);
      setUser(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [token, setUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      persist(res.token, res.user);
    },
    [persist],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await apiRegister(name, email, password);
      const res = await apiLogin(email, password);
      persist(res.token, res.user);
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, token, ready, login, register, logout, setUser, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
