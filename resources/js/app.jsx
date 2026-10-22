import '../css/app.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import Login from './auth/login';
import Dashboard from './admin/dashboard';
import VendorDashboard from './vendor/dashboard';
import CustomerDashboard from './customer/dashboard';
import {
    SESSION_INVALIDATED_EVENT,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    checkServerHealth,
    clearAuthSession,
    getStoredToken,
    getStoredUser,
    performLogout,
    resolveDashboardPageByRole,
    saveAuthSession,
    validateSessionWithServer,
} from './utils/session';

const HEALTH_POLL_INTERVAL_MS = 4000;
const HEALTH_REQUEST_TIMEOUT_MS = 3500;
const HEALTH_RETRY_DELAY_MS = 1000;
const VITE_DISCONNECT_GRACE_MS = 2500;

function LandingPage({ onLogin }) {
    return (
        <div className="landing-page">
            <nav className="navbar">
                <div className="brand">
                    <span className="brand-mark">⌁</span>
                    <span>Depotify</span>
                </div>

                <div className="nav-links">
                    <a href="#beranda">Beranda</a>
                    <a href="#fitur">Fitur</a>
                    <a href="#cara-kerja">Cara Kerja</a>
                    <a href="#tentang">Tentang</a>
                </div>

                <div className="landing-actions">
                    <button className="owner-button" onClick={onLogin}>
                        Masuk
                    </button>
                </div>
            </nav>

            <main>
                <section className="hero" id="beranda">
                    <div className="hero-content">
                        <p className="hero-eyebrow">SISTEM PENGELOLAAN DEPOT</p>

                        <h1>
                            Kelola Depot
                            <br />
                            Lebih Mudah dengan <span>Depotify</span>
                        </h1>

                        <p className="hero-description">
                            Sistem pengelolaan gas LPG dan air mineral yang
                            membantu pemilik depot mengelola stok, transaksi,
                            dan laporan dengan lebih mudah.
                        </p>
                    </div>
                </section>

                <section className="section" id="fitur">
                    <p className="section-label">FITUR UTAMA</p>

                    <h2>Semua kebutuhan depot dalam satu sistem.</h2>

                    <div className="feature-grid">
                        <div className="feature-card">
                            <h3>Kelola Stok</h3>
                            <p>
                                Pantau stok gas, air mineral, dan wadah kosong
                                secara lebih teratur.
                            </p>
                        </div>

                        <div className="feature-card">
                            <h3>Transaksi</h3>
                            <p>
                                Catat transaksi penjualan dan pertukaran wadah
                                dengan lebih cepat.
                            </p>
                        </div>

                        <div className="feature-card">
                            <h3>Laporan</h3>
                            <p>
                                Dapatkan rekap penjualan dan kondisi stok depot
                                secara lebih mudah.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section workflow" id="cara-kerja">
                    <p className="section-label">CARA KERJA</p>

                    <h2>Alur pengelolaan depot yang lebih sederhana.</h2>

                    <div className="steps">
                        <div className="step">
                            <span>01</span>
                            <h3>Catat Transaksi</h3>
                            <p>Masukkan data penjualan depot.</p>
                        </div>

                        <div className="step">
                            <span>02</span>
                            <h3>Stok Diperbarui</h3>
                            <p>Perubahan stok tercatat dalam sistem.</p>
                        </div>

                        <div className="step">
                            <span>03</span>
                            <h3>Lihat Laporan</h3>
                            <p>Pantau kondisi depot melalui laporan.</p>
                        </div>
                    </div>
                </section>

                <section className="section about" id="tentang">
                    <p className="section-label">TENTANG DEPOTIFY</p>

                    <h2>
                        Dibuat untuk membantu pengelolaan depot menjadi lebih
                        teratur.
                    </h2>

                    <p>
                        Depotify merupakan sistem pengelolaan inventori yang
                        dirancang untuk membantu pemilik depot gas LPG dan air
                        mineral dalam mengelola stok, transaksi, serta laporan.
                    </p>
                </section>
            </main>

            <footer>
                <div className="brand">
                    <span className="brand-mark">⌁</span>
                    <span>Depotify</span>
                </div>

                <p>© 2026 Depotify. Sistem Pengelolaan Depot.</p>
            </footer>
        </div>
    );
}

function App() {
    const initialToken = getStoredToken();
    const initialUser = initialToken ? getStoredUser() : null;

    if (!initialToken && localStorage.getItem(USER_STORAGE_KEY)) {
        clearAuthSession();
    }

    const [currentUser, setCurrentUser] = useState(initialUser);
    const [sessionNotice, setSessionNotice] = useState('');
    const [isBootstrapping, setIsBootstrapping] = useState(
        Boolean(initialToken)
    );
    const [page, setPage] = useState(() => {
        if (!initialToken || !initialUser) {
            return 'landing';
        }
        return resolveDashboardPageByRole(initialUser.role) || 'landing';
    });

    const isUnloadingRef = useRef(false);
    const healthCheckInFlightRef = useRef(false);
    const logoutInProgressRef = useRef(false);
    const viteDisconnectTimerRef = useRef(null);

    /**
     * Logout lokal terpusat ketika server Laravel / Vite terputus
     * atau ketika token ditolak oleh server.
     */
    const forceLocalLogout = useCallback(
        (noticeMessage = '', targetPage = 'login') => {
            if (isUnloadingRef.current || logoutInProgressRef.current) {
                return;
            }

            logoutInProgressRef.current = true;

            clearAuthSession();
            setCurrentUser(null);
            setIsBootstrapping(false);

            if (noticeMessage) {
                setSessionNotice(noticeMessage);
            }

            setPage(targetPage);

            window.setTimeout(() => {
                logoutInProgressRef.current = false;
            }, 300);
        },
        []
    );

    /**
     * 1. Validasi sesi awal saat aplikasi dibuka / dimuat ulang:
     *    Memeriksa `/api/health` dan `/api/v1/auth/me` agar aplikasi tidak
     *    menganggap user masih login hanya dari state localStorage.
     */
    useEffect(() => {
        const token = getStoredToken();
        if (!token) {
            clearAuthSession();
            setCurrentUser(null);
            setIsBootstrapping(false);
            return;
        }

        const abortController = new AbortController();
        let isActive = true;

        (async () => {
            const health = await checkServerHealth({
                timeoutMs: HEALTH_REQUEST_TIMEOUT_MS,
                signal: abortController.signal,
            });

            if (!isActive || abortController.signal.aborted) return;

            if (!health.alive) {
                forceLocalLogout(
                    'Server Laravel tidak aktif. Sesi sebelumnya telah diakhiri, silakan login kembali setelah server aktif.',
                    'login'
                );
                return;
            }

            const sessionResult = await validateSessionWithServer({
                timeoutMs: 4500,
                signal: abortController.signal,
            });

            if (!isActive || abortController.signal.aborted) return;

            if (!sessionResult.valid || !sessionResult.user) {
                const reasonMsg =
                    sessionResult.reason === 'server_unreachable' ||
                    sessionResult.reason === 'timeout'
                        ? 'Koneksi ke server terputus. Silakan login kembali.'
                        : 'Sesi login Anda telah berakhir atau tidak valid. Silakan login kembali.';

                forceLocalLogout(reasonMsg, 'login');
                return;
            }

            const verifiedUser = sessionResult.user;
            const targetDashboard = resolveDashboardPageByRole(
                verifiedUser.role
            );

            if (!targetDashboard) {
                forceLocalLogout(
                    'Role akun tidak dikenali oleh sistem.',
                    'landing'
                );
                return;
            }

            setCurrentUser(verifiedUser);
            setPage(targetDashboard);
            setIsBootstrapping(false);
        })();

        return () => {
            isActive = false;
            abortController.abort();
        };
    }, [forceLocalLogout]);

    /**
     * 2. Pemantauan berkala koneksi server Laravel (/api/health) untuk semua role
     *    dan sinkronisasi ketersediaan token di localStorage.
     */
    const isDashboardPage =
        page === 'dashboard' ||
        page === 'vendor-dashboard' ||
        page === 'customer-dashboard';
    const hasActiveSession = Boolean(currentUser) || isDashboardPage;

    useEffect(() => {
        if (!hasActiveSession) {
            return;
        }

        const token = getStoredToken();
        if (!token) {
            forceLocalLogout(
                'Sesi autentikasi tidak ditemukan. Silakan login kembali.',
                'login'
            );
            return;
        }

        let isCancelled = false;
        let retryTimerId = null;
        const activeAbortController = new AbortController();

        const runHealthCheck = async () => {
            if (
                isCancelled ||
                isUnloadingRef.current ||
                healthCheckInFlightRef.current
            ) {
                return;
            }

            if (!getStoredToken()) {
                forceLocalLogout(
                    'Token autentikasi telah dihapus. Silakan login kembali.',
                    'login'
                );
                return;
            }

            healthCheckInFlightRef.current = true;

            try {
                const firstCheck = await checkServerHealth({
                    timeoutMs: HEALTH_REQUEST_TIMEOUT_MS,
                    signal: activeAbortController.signal,
                });

                if (
                    isCancelled ||
                    isUnloadingRef.current ||
                    activeAbortController.signal.aborted
                ) {
                    return;
                }

                if (firstCheck.alive) {
                    return;
                }

                await new Promise((resolve) => {
                    retryTimerId = window.setTimeout(
                        resolve,
                        HEALTH_RETRY_DELAY_MS
                    );
                });

                if (
                    isCancelled ||
                    isUnloadingRef.current ||
                    activeAbortController.signal.aborted
                ) {
                    return;
                }

                const secondCheck = await checkServerHealth({
                    timeoutMs: 2500,
                    signal: activeAbortController.signal,
                });

                if (
                    isCancelled ||
                    isUnloadingRef.current ||
                    activeAbortController.signal.aborted
                ) {
                    return;
                }

                if (!secondCheck.alive) {
                    forceLocalLogout(
                        'Koneksi ke server Laravel terputus. Anda telah dikeluarkan secara otomatis demi keamanan sesi.',
                        'login'
                    );
                }
            } finally {
                healthCheckInFlightRef.current = false;
            }
        };

        runHealthCheck();

        const intervalId = window.setInterval(
            runHealthCheck,
            HEALTH_POLL_INTERVAL_MS
        );

        return () => {
            isCancelled = true;
            activeAbortController.abort();
            window.clearInterval(intervalId);
            if (retryTimerId) {
                window.clearTimeout(retryTimerId);
            }
            healthCheckInFlightRef.current = false;
        };
    }, [hasActiveSession, forceLocalLogout]);

    /**
     * 3. Pantau koneksi WebSocket Vite/HMR serta event beforeunload & storage lintas tab.
     */
    useEffect(() => {
        const handleBeforeUnload = () => {
            isUnloadingRef.current = true;
            if (viteDisconnectTimerRef.current) {
                window.clearTimeout(viteDisconnectTimerRef.current);
                viteDisconnectTimerRef.current = null;
            }
        };

        const handleStorageChange = (event) => {
            if (
                event.key === TOKEN_STORAGE_KEY ||
                event.key === USER_STORAGE_KEY ||
                event.key === null
            ) {
                const token = getStoredToken();
                if (!token && hasActiveSession) {
                    forceLocalLogout(
                        'Sesi Anda telah berakhir di tab lain. Silakan login kembali.',
                        'login'
                    );
                }
            }
        };

        const handleSessionInvalidated = (event) => {
            const customMessage =
                event?.detail?.message ||
                'Sesi Anda tidak lagi valid atau koneksi server terputus. Silakan login kembali.';
            forceLocalLogout(customMessage, 'login');
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener(
            SESSION_INVALIDATED_EVENT,
            handleSessionInvalidated
        );

        const hot = import.meta.hot;
        let onViteDisconnect = null;
        let onViteConnect = null;
        let onViteBeforeFullReload = null;

        if (hot) {
            onViteBeforeFullReload = () => {
                isUnloadingRef.current = true;
                if (viteDisconnectTimerRef.current) {
                    window.clearTimeout(viteDisconnectTimerRef.current);
                    viteDisconnectTimerRef.current = null;
                }
            };

            onViteConnect = () => {
                if (viteDisconnectTimerRef.current) {
                    window.clearTimeout(viteDisconnectTimerRef.current);
                    viteDisconnectTimerRef.current = null;
                }
            };

            onViteDisconnect = () => {
                if (isUnloadingRef.current || !getStoredToken()) {
                    return;
                }

                if (viteDisconnectTimerRef.current) {
                    window.clearTimeout(viteDisconnectTimerRef.current);
                }

                viteDisconnectTimerRef.current = window.setTimeout(async () => {
                    viteDisconnectTimerRef.current = null;

                    if (isUnloadingRef.current || !getStoredToken()) {
                        return;
                    }

                    forceLocalLogout(
                        'Server development (Vite) atau koneksi aplikasi terputus. Silakan login kembali setelah server aktif.',
                        'login'
                    );
                }, VITE_DISCONNECT_GRACE_MS);
            };

            hot.on('vite:beforeFullReload', onViteBeforeFullReload);
            hot.on('vite:ws:connect', onViteConnect);
            hot.on('vite:ws:disconnect', onViteDisconnect);
        }

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener(
                SESSION_INVALIDATED_EVENT,
                handleSessionInvalidated
            );

            if (viteDisconnectTimerRef.current) {
                window.clearTimeout(viteDisconnectTimerRef.current);
                viteDisconnectTimerRef.current = null;
            }

            if (hot && typeof hot.off === 'function') {
                if (onViteBeforeFullReload) {
                    hot.off('vite:beforeFullReload', onViteBeforeFullReload);
                }
                if (onViteConnect) {
                    hot.off('vite:ws:connect', onViteConnect);
                }
                if (onViteDisconnect) {
                    hot.off('vite:ws:disconnect', onViteDisconnect);
                }
            }
        };
    }, [hasActiveSession, forceLocalLogout]);

    /**
     * Handler setelah login berhasil: arahkan otomatis berdasarkan role dari backend.
     */
    const handleLoginSuccess = useCallback((result) => {
        const user = result?.user;
        const token = result?.token;

        if (!user || !user.role || !token) {
            return;
        }

        const targetDashboard = resolveDashboardPageByRole(user.role);
        if (!targetDashboard) {
            clearAuthSession();
            setSessionNotice('Role pengguna tidak memiliki akses dashboard.');
            setPage('login');
            return;
        }

        saveAuthSession(token, user);
        setSessionNotice('');
        setCurrentUser(user);
        setPage(targetDashboard);
    }, []);

    /**
     * Handler logout manual untuk semua role.
     */
    const handleLogout = useCallback(async () => {
        await performLogout({ notifyBackend: true });
        setSessionNotice('');
        setCurrentUser(null);
        setPage('landing');
    }, []);

    if (isBootstrapping) {
        return (
            <div className="app-session-loader">
                <div className="app-session-spinner" />
                <p>Memverifikasi sesi dan koneksi server Depotify...</p>
            </div>
        );
    }

    if (page === 'login') {
        return (
            <Login
                sessionNotice={sessionNotice}
                onBack={() => {
                    setSessionNotice('');
                    setPage('landing');
                }}
                onLoginSuccess={handleLoginSuccess}
            />
        );
    }

    if (page === 'dashboard') {
        if (!currentUser || currentUser.role !== 'owner' || !getStoredToken()) {
            return (
                <Login
                    sessionNotice={
                        sessionNotice ||
                        'Silakan masuk untuk mengakses dashboard.'
                    }
                    onBack={() => setPage('landing')}
                    onLoginSuccess={handleLoginSuccess}
                />
            );
        }

        return <Dashboard user={currentUser} onLogout={handleLogout} />;
    }

    if (page === 'vendor-dashboard') {
        if (
            !currentUser ||
            currentUser.role !== 'vendor' ||
            !getStoredToken()
        ) {
            return (
                <Login
                    sessionNotice={
                        sessionNotice ||
                        'Silakan masuk untuk mengakses dashboard.'
                    }
                    onBack={() => setPage('landing')}
                    onLoginSuccess={handleLoginSuccess}
                />
            );
        }

        return <VendorDashboard user={currentUser} onLogout={handleLogout} />;
    }

    if (page === 'customer-dashboard') {
        if (
            !currentUser ||
            currentUser.role !== 'customer' ||
            !getStoredToken()
        ) {
            return (
                <Login
                    sessionNotice={
                        sessionNotice ||
                        'Silakan masuk untuk mengakses halaman pengguna.'
                    }
                    onBack={() => setPage('landing')}
                    onLoginSuccess={handleLoginSuccess}
                />
            );
        }

        return <CustomerDashboard user={currentUser} onLogout={handleLogout} />;
    }

    return (
        <LandingPage
            onLogin={() => {
                setSessionNotice('');
                setPage('login');
            }}
        />
    );
}

const root = createRoot(document.getElementById('app'));
root.render(<App />);
