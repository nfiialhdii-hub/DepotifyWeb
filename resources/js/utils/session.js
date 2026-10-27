export const TOKEN_STORAGE_KEY = 'depotify_token';
export const USER_STORAGE_KEY = 'depotify_user';
export const SESSION_EXPIRES_AT_KEY = 'depotify_session_expires_at';
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Jam
export const SESSION_INVALIDATED_EVENT = 'depotify:session-invalidated';

/**
 * Ambil timestamp kedaluwarsa sesi (ms) dari localStorage.
 */
export function getSessionExpiresAt() {
    try {
        const raw = localStorage.getItem(SESSION_EXPIRES_AT_KEY);
        if (!raw) return null;

        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 0) {
            return numeric;
        }

        const parsedDate = Date.parse(raw);
        if (!Number.isNaN(parsedDate) && parsedDate > 0) {
            return parsedDate;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Periksa apakah sesi login sudah melewati batas 24 jam.
 */
export function isSessionExpired() {
    const expiresAt = getSessionExpiresAt();
    if (!expiresAt) {
        return false;
    }

    return Date.now() >= expiresAt;
}

/**
 * Hitung sisa waktu sesi login dalam milidetik.
 */
export function getRemainingSessionMs() {
    const expiresAt = getSessionExpiresAt();
    if (!expiresAt) {
        return SESSION_DURATION_MS;
    }

    return Math.max(0, expiresAt - Date.now());
}

/**
 * Ambil token autentikasi dari localStorage.
 * Jika sesi sudah melewati 24 jam, otomatis bersihkan sesi dan kembalikan null.
 */
export function getStoredToken() {
    try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token || typeof token !== 'string' || token.trim() === '') {
            return null;
        }

        if (isSessionExpired()) {
            clearAuthSession();
            return null;
        }

        // Jika token lama belum memiliki timestamp expires_at, set 24 jam dari sekarang
        if (!getSessionExpiresAt()) {
            localStorage.setItem(
                SESSION_EXPIRES_AT_KEY,
                String(Date.now() + SESSION_DURATION_MS)
            );
        }

        return token.trim();
    } catch {
        return null;
    }
}

/**
 * Ambil data user dari localStorage dengan parsing aman.
 */
export function getStoredUser() {
    try {
        if (isSessionExpired()) {
            clearAuthSession();
            return null;
        }

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
 * Simpan token, data user, dan batas waktu sesi 24 jam ke localStorage.
 * Jika dipanggil saat penyegaran data user (`expiresAt` tidak dikirim dan sudah ada di storage),
 * pertahankan waktu kedaluwarsa 24 jam yang sudah berjalan.
 */
export function saveAuthSession(token, user, expiresAt = null) {
    if (!token || !user) return;

    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));

        let targetExpiresAt = null;

        if (expiresAt) {
            const parsed =
                typeof expiresAt === 'number'
                    ? expiresAt
                    : Date.parse(String(expiresAt));
            if (Number.isFinite(parsed) && parsed > Date.now()) {
                targetExpiresAt = parsed;
            }
        }

        if (!targetExpiresAt) {
            const existing = getSessionExpiresAt();
            if (existing && existing > Date.now()) {
                targetExpiresAt = existing;
            } else {
                targetExpiresAt = Date.now() + SESSION_DURATION_MS;
            }
        }

        localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(targetExpiresAt));
    } catch {
        // Abaikan jika storage tidak dapat diakses
    }
}

/**
 * Bersihkan hanya data autentikasi milik aplikasi Depotify
 * tanpa menghapus data lain di browser.
 */
export function clearAuthSession() {
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
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
 * Kirim sinyal global bahwa sesi telah berakhir.
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
 * Helper fetch dengan dukungan AbortController timeout (default 30 detik).
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
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
 * Periksa apakah server Laravel aktif melalui endpoint /api/health.
 */
export async function checkServerHealth({ timeoutMs = 15000, signal } = {}) {
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
 * Validasi token Sanctum dan masa berlaku 24 jam ke server Laravel melalui GET /api/v1/auth/me.
 */
export async function validateSessionWithServer({ timeoutMs = 20000, signal } = {}) {
    if (isSessionExpired()) {
        clearAuthSession();
        return {
            valid: false,
            reason: 'expired_24h',
            user: null,
        };
    }

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

        if (!response.ok) {
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
        // Jika terjadi gangguan jaringan sesaat tetapi sesi 24 jam masih berlaku,
        // gunakan data user yang tersimpan di localStorage agar tidak mudah ter-logout karena timeout sesaat.
        const cachedUser = getStoredUser();
        if (cachedUser && !isSessionExpired()) {
            return {
                valid: true,
                reason: 'cached_within_24h',
                status: 200,
                user: cachedUser,
            };
        }

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
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);

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
                5000
            );
        } catch {
            // Jika server sudah berhenti, tetap lanjutkan logout lokal
        }
    }

    clearAuthSession();
}
