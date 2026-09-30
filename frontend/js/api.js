/**
 * Gasterus v3 — API Client Layer
 * Handles requests, CSRF token propagation, session cookies/tokens, and standardized error handling.
 * Base URL otomatis mendeteksi environment: production/CF (origin + /api), lokal (backend port),
 * atau runtime-config dari member-server (/runtime-config.js).
 */

(function detectApiBase() {
  // 1. Runtime config dari member-server (di-deploy sebagai /runtime-config.js)
  if (typeof window.ASEAN_RUNTIME_CONFIG === 'object' && window.ASEAN_RUNTIME_CONFIG.apiBaseUrl) {
    window.GASTERUS_API_BASE = window.ASEAN_RUNTIME_CONFIG.apiBaseUrl.replace(/\/+$/, '');
    return;
  }
  // 2. Bila di-proxy yang sama dengan frontend (produksi/Cloudflare), /api relative sudah benar.
  const origin = window.location.origin || '';
  const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isMemberProxy = window.location.pathname.startsWith('/member/') || window.location.pathname.startsWith('/api/member');
  if (!isLocal && !isMemberProxy) {
    window.GASTERUS_API_BASE = '/api';
    return;
  }
  // 3. Lokal / dev: coba deteksi backend port dari config eksplisit atau fallback ke /api
  const explicitBase = window.GASTERUS_API_BASE || window.ASEAN_RUNTIME_CONFIG?.apiBaseUrl;
  if (explicitBase) {
    window.GASTERUS_API_BASE = explicitBase.replace(/\/+$/, '');
    return;
  }
  // 4. Fallback terakhir
  window.GASTERUS_API_BASE = '/api';
})();

const API_BASE = window.GASTERUS_API_BASE || '/api';

// Redirect-loop guard: mencegah bounce bolak-balik saat 401 dipicu oleh redirect ke /index
let _scheduledLogout = false;
let _last401Path = '';

class ApiClient {
  constructor() {
    this.csrfToken = localStorage.getItem('gasterus_csrf') || '';
    this.token = localStorage.getItem('gasterus_token') || '';
  }

  setSession(token, csrfToken) {
    if (token) {
      this.token = token;
      localStorage.setItem('gasterus_token', token);
    } else {
      this.token = '';
    }
    if (csrfToken) {
      this.csrfToken = csrfToken;
      localStorage.setItem('gasterus_csrf', csrfToken);
    } else {
      this.csrfToken = '';
    }
  }

  _isTokenExpiredResponse(res, url) {
    return res.status === 401 && !url.includes('/login') && !url.includes('/register');
  }

  clearSession() {
    this.token = '';
    this.csrfToken = '';
    localStorage.removeItem('gasterus_token');
    localStorage.removeItem('gasterus_csrf');
    localStorage.removeItem('gasterus_user');
    sessionStorage.removeItem('gasterus_redirecting');
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') || endpoint.startsWith('/api') || endpoint.startsWith('/member-api')
      ? endpoint
      : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.token ? { 'x-session-token': this.token, Authorization: `Bearer ${this.token}` } : {}),
      ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
      ...(options.headers || {})
    };

    const config = {
      method: options.method || 'GET',
      headers,
      credentials: 'include', // for HTTP-only cookies
      ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
    };

    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Handle session expiry
        if (this._isTokenExpiredResponse(res, url)) {
          this.clearSession();
          const currentPath = window.location.pathname;
          // URL kanonik kini tanpa .html (Cloudflare clean URLs). Regex tetap
          // menerima bentuk .html lama agar cache PWA/bookmark lama tidak loop.
          const isAlreadyOnAuthPage = /^\/(?:index(?:\.html)?)?$/.test(currentPath) ||
            /^\/register(?:\.html)?$/.test(currentPath) ||
            /\/login/.test(currentPath);
          if (!isAlreadyOnAuthPage && currentPath !== _last401Path) {
            _last401Path = currentPath;
            if (!_scheduledLogout) {
              _scheduledLogout = true;
              sessionStorage.setItem('gasterus_redirecting', '1');
              setTimeout(() => {
                _scheduledLogout = false;
                _last401Path = '';
                sessionStorage.removeItem('gasterus_redirecting');
                window.location.href = '/?msg=session_expired';
              }, 0);
            }
          }
          const errorMsg = (typeof data.error === 'object' && data.error?.message)
            || data.message
            || (typeof data.error === 'string' ? data.error : null)
            || 'Sesi tidak valid. Harap login ulang.';
          const error = new Error(errorMsg);
          error.status = 401;
          error.data = data;
          error.tokenExpired = true;
          throw error;
        }
        const errorMsg = (typeof data.error === 'object' && data.error?.message)
          || data.message
          || (typeof data.error === 'string' ? data.error : null)
          || `Error ${res.status}: Terjadi kesalahan pada server.`;
        const error = new Error(errorMsg);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      // Update CSRF token if returned
      const csrf = data.csrfToken || data.data?.csrfToken;
      if (csrf) {
        this.setSession(null, csrf);
      }

      return data;
    } catch (err) {
      console.error(`[API ERROR] ${options.method || 'GET'} ${url}:`, err);
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
