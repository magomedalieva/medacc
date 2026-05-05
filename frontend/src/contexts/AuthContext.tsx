import { createContext, useContext, useEffect, useState } from "react";

import { api } from "../lib/api";
import { SESSION_TOKEN_MARKER } from "../lib/authSession";
import type { User } from "../types/api";

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<User>;
  register: (payload: { first_name: string; last_name: string; email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<User | null>;
  replaceUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    void api
      .getMe(SESSION_TOKEN_MARKER)
      .then((profile) => {
        setToken(SESSION_TOKEN_MARKER);
        setUser(profile);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setStatus("ready");
      });
  }, []);

  async function login(payload: { email: string; password: string }) {
    const response = await api.login(payload);
    setToken(SESSION_TOKEN_MARKER);
    setUser(response.user);
    return response.user;
  }

  async function register(payload: { first_name: string; last_name: string; email: string; password: string }) {
    const response = await api.register(payload);
    setToken(SESSION_TOKEN_MARKER);
    setUser(response.user);
    return response.user;
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local cleanup still wins even if the server cookie has already expired.
    }

    setToken(null);
    setUser(null);
  }

  async function refreshProfile() {
    if (!token) {
      return null;
    }

    try {
      const profile = await api.getMe(token);
      setToken(SESSION_TOKEN_MARKER);
      setUser(profile);
      return profile;
    } catch {
      await logout();
      return null;
    }
  }

  function replaceUser(profile: User) {
    setUser(profile);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        status,
        isAuthenticated: Boolean(token && user),
        login,
        register,
        logout,
        refreshProfile,
        replaceUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }

  return context;
}
