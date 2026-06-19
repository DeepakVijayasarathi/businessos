import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — refresh token on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

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
        const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh-token`, {}, { withCredentials: true });
        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        failedQueue.forEach((p) => p.resolve(newToken));
        failedQueue = [];
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        failedQueue.forEach((p) => p.reject(refreshErr));
        failedQueue = [];
        clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/login';
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

function clearAuth(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bos_token');
    localStorage.removeItem('bos_user');
  }
}

export { getAccessToken, setAccessToken, clearAuth };
export default api;
