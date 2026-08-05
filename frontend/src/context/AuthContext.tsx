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
  ApiError,
  fetchMe,
  login as apiLogin,
  loginWithGoogle as apiLoginWithGoogle,
  register as apiRegister,
  setSessionExpiredHandler,
} from "@/lib/api";
import type { User } from "@/lib/types";

const TOKEN_KEY = "sbs_token";
const USER_KEY = "sbs_user";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogleAccessToken: (accessToken: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

function redirectToLoginAfterExpiry() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path.startsWith("/login") || path.startsWith("/auth/")) return;
  const next = `${path}${window.location.search}`;
  const params = new URLSearchParams({ session: "expired" });
  if (next && next !== "/") params.set("next", next);
  window.location.replace(`/login?${params.toString()}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const expireSession = () => {
      clearStoredSession();
      setToken(null);
      setUserState(null);
      redirectToLoginAfterExpiry();
    };

    setSessionExpiredHandler(expireSession);

    async function hydrate() {
      try {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (!storedToken || !storedUser) return;

        // Validate before treating the user as logged in.
        try {
          const res = await fetchMe(storedToken);
          if (cancelled) return;
          setToken(storedToken);
          setUserState(res.data);
          localStorage.setItem(USER_KEY, JSON.stringify(res.data));
        } catch (err) {
          if (cancelled) return;
          // 401/422 already triggered expireSession via the API layer.
          if (
            err instanceof ApiError &&
            (err.status === 401 || err.status === 422)
          ) {
            return;
          }
          // Network blip: keep cached session until a later request fails.
          setToken(storedToken);
          setUserState(JSON.parse(storedUser) as User);
        }
      } catch {
        clearStoredSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
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

  const loginWithGoogleAccessToken = useCallback(
    async (accessToken: string) => {
      const res = await apiLoginWithGoogle(accessToken);
      if (!res.token || !res.user) {
        throw new ApiError("Google sign-in did not return a session.", 502);
      }
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

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      login,
      loginWithGoogleAccessToken,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [
      user,
      token,
      ready,
      login,
      loginWithGoogleAccessToken,
      register,
      logout,
      setUser,
      refreshUser,
    ],
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
