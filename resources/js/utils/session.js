export const TOKEN_STORAGE_KEY = 'depotify_token';
export const USER_STORAGE_KEY = 'depotify_user';
export const SESSION_INVALIDATED_EVENT = 'depotify:session-invalidated';

/**
 * Ambil token autentikasi dari localStorage.
 */
export function getStoredToken() {
    try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        return token && typeof token === 'string' && token.trim() !== ''
            ? token.trim()
            : null;
    } catch {
        return null;
    }
}

/**
 * Ambil data user dari localStorage dengan parsing aman.
 */
export function getStoredUser() {
    try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.role) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

/**
 * Simpan token dan data user ke localStorage secara konsisten.
 */
export function saveAuthSession(token, user) {
    if (!token || !user) return;

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/**
 * Bersihkan hanya data autentikasi milik aplikasi Depotify
 * tanpa menghapus data lain di browser.
 */
export function clearAuthSession() {
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
        // Abaikan jika storage tidak dapat diakses
    }
}

/**
 * Petakan role user dari backend ke nama halaman dashboard yang sesuai.
 */
export function resolveDashboardPageByRole(role) {
    if (role === 'owner') return 'dashboard';
    if (role === 'vendor') return 'vendor-dashboard';
    if (role === 'customer') return 'customer-dashboard';
    return null;
}

/**
 * Kirim sinyal global bahwa sesi telah berakhir / server terputus.
 */
export function emitSessionInvalidated(reason = 'session_expired', message = '') {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent(SESSION_INVALIDATED_EVENT, {
            detail: { reason, message },
        })
    );
}

/**
 * Helper fetch dengan dukungan AbortController timeout.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
    const controller = new AbortController();
    const externalSignal = options.signal;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }

    const timerId = window.setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        window.clearTimeout(timerId);
        if (externalSignal) {
            externalSignal.removeEventListener('abort', onExternalAbort);
        }
    }
}

/**
 * Periksa apakah server Laravel aktif melalui endpoint /api/health
 * yang tidak membutuhkan autentikasi.
 *
 * Catatan:
 * - Ketika Vite dev server masih hidup tetapi `php artisan serve` mati,
 *   Vite proxy dapat mengembalikan status 500/502/503/504 atau body non-JSON.
 * - Karena `/api/health` hanya mengembalikan JSON `{ status: 'ok' }`,
 *   kegagalan jaringan, timeout, atau respons non-JSON `{ status: 'ok' }`
 *   menandakan server Laravel tidak dapat dijangkau.
 */
export async function checkServerHealth({ timeoutMs = 3500, signal } = {}) {
    try {
        const response = await fetchWithTimeout(
            '/api/health',
            {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
                signal,
            },
            timeoutMs
        );

        if (!response.ok) {
            return {
                alive: false,
                status: response.status,
                reason: `http_${response.status}`,
            };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return {
                alive: false,
                status: response.status,
                reason: 'invalid_content_type',
            };
        }

        const payload = await response.json().catch(() => null);
        if (payload && payload.status === 'ok') {
            return {
                alive: true,
                status: response.status,
                payload,
            };
        }

        return {
            alive: false,
            status: response.status,
            reason: 'invalid_health_payload',
        };
    } catch (error) {
        const isTimeout = error?.name === 'AbortError';
        return {
            alive: false,
            status: 0,
            reason: isTimeout ? 'timeout' : 'network_error',
        };
    }
}

/**
 * Validasi token Sanctum dan informasi user ke server Laravel melalui GET /api/v1/auth/me.
 *
 * Membedakan:
 * - 200 OK dengan data user valid -> sesi valid
 * - 401 / 403 -> token tidak valid / dicabut / akun nonaktif
 * - Timeout / network error / 502 / 503 / 504 -> server Laravel tidak dapat dijangkau
 * - Respons aplikasi lain -> dicek ulang melalui /api/health
 */
export async function validateSessionWithServer({ timeoutMs = 4500, signal } = {}) {
    const token = getStoredToken();
    if (!token) {
        return {
            valid: false,
            reason: 'missing_token',
            user: null,
        };
    }

    try {
        const response = await fetchWithTimeout(
            '/api/v1/auth/me',
            {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                signal,
            },
            timeoutMs
        );

        if (response.status === 401 || response.status === 403) {
            return {
                valid: false,
                reason: 'unauthorized',
                status: response.status,
                user: null,
            };
        }

        if ([502, 503, 504].includes(response.status)) {
            return {
                valid: false,
                reason: 'server_unreachable',
                status: response.status,
                user: null,
            };
        }

        if (!response.ok) {
            // Jika status 500 dari Vite proxy ketika Laravel mati, pastikan lewat /api/health
            const health = await checkServerHealth({ timeoutMs: 2500, signal });
            if (!health.alive) {
                return {
                    valid: false,
                    reason: 'server_unreachable',
                    status: response.status,
                    user: null,
                };
            }

            return {
                valid: false,
                reason: 'invalid_session_response',
                status: response.status,
                user: null,
            };
        }

        const result = await response.json().catch(() => null);
        const user = result?.data || result?.user || null;

        if (!user || !user.id || !user.role) {
            return {
                valid: false,
                reason: 'invalid_user_payload',
                status: response.status,
                user: null,
            };
        }

        saveAuthSession(token, user);

        return {
            valid: true,
            reason: 'ok',
            status: response.status,
            user,
        };
    } catch (error) {
        const isTimeout = error?.name === 'AbortError';
        return {
            valid: false,
            reason: isTimeout ? 'timeout' : 'server_unreachable',
            status: 0,
            user: null,
        };
    }
}

/**
 * Lakukan logout ke backend (jika dapat dijangkau) lalu bersihkan sesi lokal.
 */
export async function performLogout({ notifyBackend = true } = {}) {
    const token = getStoredToken();

    if (notifyBackend && token) {
        try {
            await fetchWithTimeout(
                '/api/v1/auth/logout',
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                },
                2500
            );
        } catch {
            // Jika server sudah berhenti, tetap lanjutkan logout lokal
        }
    }

    clearAuthSession();
}
