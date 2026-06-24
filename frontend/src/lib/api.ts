import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  timeout: 60000, // 60s — AI agent calls can take 20-30s
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — refresh token on 401, then force-logout if refresh also fails
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (!originalRequest) return Promise.reject(error);

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Send refreshToken in body as fallback — httpOnly cookie (sameSite:strict) is
        // not forwarded on cross-origin requests in dev (ports differ: 3000 vs 5000)
        const storedRefreshToken = getRefreshToken();
        const { data } = await axios.post(
          `${API_URL}/api/v1/auth/refresh-token`,
          storedRefreshToken ? { refreshToken: storedRefreshToken } : {},
          { withCredentials: true }
        );
        const newAccessToken = data.data.accessToken;
        const newRefreshToken = data.data.refreshToken;
        setAccessToken(newAccessToken);
        if (newRefreshToken) setRefreshToken(newRefreshToken);
        failedQueue.forEach((p) => p.resolve(newAccessToken));
        failedQueue = [];
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        failedQueue.forEach((p) => p.reject(refreshErr));
        failedQueue = [];
        forceLogout();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bos_token');
}

function setAccessToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem('bos_token', token);
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bos_refresh_token');
}

function setRefreshToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem('bos_refresh_token', token);
}

function clearRefreshToken(): void {
  if (typeof window !== 'undefined') localStorage.removeItem('bos_refresh_token');
}

function clearAuth(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bos_token');
    localStorage.removeItem('bos_user');
    localStorage.removeItem('bos_refresh_token');
    localStorage.removeItem('bos-auth'); // Zustand persist key
  }
}

function forceLogout(): void {
  clearAuth();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bos:logout'));
    window.location.href = '/login';
  }
}

export { getAccessToken, setAccessToken, getRefreshToken, setRefreshToken, clearRefreshToken, clearAuth, forceLogout };
export default api;
