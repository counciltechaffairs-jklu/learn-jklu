import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { API } from '@/utils/api';
import { buildUploadUrl } from '@/utils/uploads';
import { wakeUpBackend } from '@/utils/keepAlive';
import type { CaptchaPayload } from '@/components/auth/RobotCheck';

interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  admin_role?: string;
  is_sub_admin: boolean;
  is_professor?: boolean;
  is_ta?: boolean;
  ta_offering_ids?: number[];
  department?: string;
  year?: string;
  batch_year?: string;
  roll_no?: string;
  id_verified?: boolean;
  photo_path?: string;
}

interface RegisterMeta {
  department?: string;
  year?: string;
  roll_no?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, captcha?: CaptchaPayload | null) => Promise<User>;
  register: (
    email: string,
    name: string,
    password: string,
    confirmPassword: string,
    captcha?: CaptchaPayload | null,
    meta?: RegisterMeta
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

function syncProfilePhotoCache(userData: User | null) {
  if (typeof window === 'undefined') return;
  const photoUrl = buildUploadUrl(userData?.photo_path);
  if (photoUrl) {
    localStorage.setItem('profile.photo', photoUrl);
  } else {
    localStorage.removeItem('profile.photo');
  }
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tokenState, setTokenState] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('token') : null
  );
  const [loading, setLoading] = useState(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  const logout = useCallback(() => {
    API.client.post('/logout').catch(() => {});
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('idVerified');
      localStorage.removeItem('profile.photo');
    }
    API.clearCache();
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setTokenState(null);
      setUser(null);
      setSessionExpiredNotice(true);
    };
    window.addEventListener('auth-session-expired', onExpired);
    return () => window.removeEventListener('auth-session-expired', onExpired);
  }, []);

  useEffect(() => {
    let active = true;
    const initializeAuth = async () => {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!storedToken) {
        // Never block unauthenticated cold boot on wakeUpBackend()
        setLoading(false);
        wakeUpBackend().catch(() => {});
        return;
      }

      try {
        const response = await API.getCurrentUser();
        if (!active) return;
        setUser(response.data);
        setTokenState(storedToken);
        syncProfilePhotoCache(response.data);
      } catch (error: any) {
        if (!active) return;
        if (error?.status === 401 || error?.status === 403) {
          logout();
        } else {
          // Transient cold-start network error: retry once after wakeUpBackend
          await wakeUpBackend().catch(() => {});
          try {
            const retryResponse = await API.getCurrentUser();
            if (!active) return;
            setUser(retryResponse.data);
            setTokenState(storedToken);
            syncProfilePhotoCache(retryResponse.data);
          } catch {
            if (active) logout();
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    initializeAuth();
    return () => {
      active = false;
    };
  }, [logout]);

  const login = async (email: string, password: string, captcha?: CaptchaPayload | null) => {
    const response = await API.client.post('/login', {
      email,
      password,
      ...(captcha || {}),
    });

    const newToken = response.data.access_token;
    localStorage.setItem('token', newToken);
    setTokenState(newToken);
    API.clearCache();

    // Backend /login already returns the full user payload; avoid duplicate /me roundtrip
    const userData: User = response.data.user || (await API.getCurrentUser()).data;
    setUser(userData);
    syncProfilePhotoCache(userData);
    return userData;
  };

  const register = async (
    email: string,
    name: string,
    password: string,
    confirmPassword: string,
    captcha?: CaptchaPayload | null,
    meta?: RegisterMeta
  ) => {
    const response = await API.client.post('/register', {
      email,
      name,
      password,
      confirm_password: confirmPassword,
      ...(meta || {}),
      ...(captcha || {}),
    });

    const newToken = response.data.access_token;
    localStorage.setItem('token', newToken);
    setTokenState(newToken);
    API.clearCache();

    const userData: User = response.data.user || (await API.getCurrentUser()).data;
    setUser(userData);
    setSessionExpiredNotice(false);
    syncProfilePhotoCache(userData);
  };

  const refreshUser = async () => {
    const activeToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!activeToken) {
      setUser(null);
      setTokenState(null);
      return;
    }
    try {
      const response = await API.getCurrentUser();
      setUser(response.data);
      setTokenState(activeToken);
      syncProfilePhotoCache(response.data);
    } catch (error: any) {
      if (error?.status === 401) {
        logout();
      }
    }
  };

  const value = {
    user,
    token: tokenState,
    login,
    register,
    logout,
    refreshUser,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {sessionExpiredNotice && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[9999] max-w-sm rounded-2xl border border-[#E04F33]/40 bg-white px-4 py-3 shadow-2xl text-xs text-[#0A0A0C] flex items-center justify-between gap-3"
        >
          <div>
            <div className="font-bold text-[#E04F33]">Session Expired</div>
            <p className="text-[#353430] mt-0.5">
              Please sign in again to continue protected actions.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSessionExpiredNotice(false);
                window.location.assign('/login');
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] text-white font-semibold hover:bg-[#E04F33] transition-colors"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setSessionExpiredNotice(false)}
              className="px-2 py-1.5 rounded-lg border border-[#DDD8CE] text-[#353430] hover:bg-[#FAF9F6]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};
