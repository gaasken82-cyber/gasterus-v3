/**
 * Gasterus v3 — API Client Layer
 * Handles requests, CSRF token propagation, session cookies/tokens, and standardized error handling.
 */

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.csrfToken = localStorage.getItem('gasterus_csrf') || '';
    this.token = localStorage.getItem('gasterus_token') || '';
  }

  setSession(token, csrfToken) {
    if (token) {
      this.token = token;
      localStorage.setItem('gasterus_token', token);
    }
    if (csrfToken) {
      this.csrfToken = csrfToken;
      localStorage.setItem('gasterus_csrf', csrfToken);
    }
  }

  clearSession() {
    this.token = '';
    this.csrfToken = '';
    localStorage.removeItem('gasterus_token');
    localStorage.removeItem('gasterus_csrf');
    localStorage.removeItem('gasterus_user');
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
        if (res.status === 401 && !url.includes('/login')) {
          this.clearSession();
          if (window.location.pathname.includes('/member') || window.location.pathname.includes('/market-play')) {
            window.location.href = '/index.html?msg=session_expired';
          }
        }
        const errorMsg = data.message || data.error || `Error ${res.status}: Terjadi kesalahan pada server.`;
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
