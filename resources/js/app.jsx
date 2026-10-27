import '../css/app.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import Login from './auth/login';
import Dashboard from './admin/dashboard';
import VendorDashboard from './vendor/dashboard';
import CustomerDashboard from './customer/dashboard';
import {
    SESSION_EXPIRES_AT_KEY,
    SESSION_INVALIDATED_EVENT,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    clearAuthSession,
    getRemainingSessionMs,
    getStoredToken,
    getStoredUser,
    isSessionExpired,
    performLogout,
    resolveDashboardPageByRole,
    saveAuthSession,
    validateSessionWithServer,
} from './utils/session';

const SESSION_CHECK_INTERVAL_MS = 30000; // Cek masa aktif sesi 24 jam setiap 30 detik

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
    const expiredOnBoot = isSessionExpired();
    if (expiredOnBoot) {
        clearAuthSession();
    }

    const initialToken = getStoredToken();
    const initialUser = initialToken ? getStoredUser() : null;

    if (!initialToken && localStorage.getItem(USER_STORAGE_KEY)) {
        clearAuthSession();
    }

    const [currentUser, setCurrentUser] = useState(initialUser);
    const [sessionNotice, setSessionNotice] = useState(
        expiredOnBoot
            ? 'Sesi login 24 jam Anda telah berakhir. Silakan login kembali.'
            : ''
    );
    const [isBootstrapping, setIsBootstrapping] = useState(
        Boolean(initialToken)
    );
    const [page, setPage] = useState(() => {
        if (expiredOnBoot) {
            return 'login';
        }
        if (!initialToken || !initialUser) {
            return 'landing';
        }
        return resolveDashboardPageByRole(initialUser.role) || 'landing';
    });

    const logoutInProgressRef = useRef(false);

    /**
     * Logout otomatis ketika sesi melewati batas 24 jam atau token tidak lagi valid.
     */
    const forceLocalLogout = useCallback(
        (noticeMessage = '', targetPage = 'login', notifyBackend = false) => {
            if (logoutInProgressRef.current) {
                return;
            }

            logoutInProgressRef.current = true;

            if (notifyBackend) {
                performLogout({ notifyBackend: true });
            } else {
                clearAuthSession();
            }

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
     * 1. Validasi sesi awal saat aplikasi dibuka / dimuat ulang.
     */
    useEffect(() => {
        if (isSessionExpired()) {
            forceLocalLogout(
                'Sesi login 24 jam Anda telah berakhir. Silakan login kembali.',
                'login',
                true
            );
            return;
        }

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
            const sessionResult = await validateSessionWithServer({
                timeoutMs: 20000,
                signal: abortController.signal,
            });

            if (!isActive || abortController.signal.aborted) return;

            if (!sessionResult.valid || !sessionResult.user) {
                const reasonMsg =
                    sessionResult.reason === 'expired_24h'
                        ? 'Sesi login 24 jam Anda telah berakhir. Silakan login kembali.'
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
     * 2. Pemantauan durasi sesi 24 jam (otomatis logout setelah melewati 24 jam).
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

        const checkSession24hExpiry = () => {
            if (isSessionExpired()) {
                forceLocalLogout(
                    'Sesi login 24 jam Anda telah berakhir. Silakan login kembali.',
                    'login',
                    true
                );
                return true;
            }

            if (!getStoredToken()) {
                forceLocalLogout(
                    'Sesi autentikasi tidak ditemukan. Silakan login kembali.',
                    'login'
                );
                return true;
            }

            return false;
        };

        if (checkSession24hExpiry()) {
            return;
        }

        // Jadwalkan timer tepat pada sisa waktu menuju 24 jam
        const remainingMs = getRemainingSessionMs();
        const expiryTimeoutId = window.setTimeout(() => {
            checkSession24hExpiry();
        }, Math.min(remainingMs + 250, 2147483647));

        // Pemeriksaan berkala setiap 30 detik (misal setelah laptop sleep/wake)
        const intervalId = window.setInterval(
            checkSession24hExpiry,
            SESSION_CHECK_INTERVAL_MS
        );

        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                checkSession24hExpiry();
            }
        };

        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        return () => {
            window.clearTimeout(expiryTimeoutId);
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityOrFocus
            );
        };
    }, [hasActiveSession, forceLocalLogout]);

    /**
     * 3. Sinkronisasi event storage lintas tab & event invalidasi sesi (401).
     */
    useEffect(() => {
        const handleStorageChange = (event) => {
            if (
                event.key === TOKEN_STORAGE_KEY ||
                event.key === USER_STORAGE_KEY ||
                event.key === SESSION_EXPIRES_AT_KEY ||
                event.key === null
            ) {
                if (isSessionExpired() && hasActiveSession) {
                    forceLocalLogout(
                        'Sesi login 24 jam Anda telah berakhir. Silakan login kembali.',
                        'login'
                    );
                    return;
                }

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
                'Sesi login Anda telah berakhir. Silakan login kembali.';
            forceLocalLogout(customMessage, 'login');
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener(
            SESSION_INVALIDATED_EVENT,
            handleSessionInvalidated
        );

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener(
                SESSION_INVALIDATED_EVENT,
                handleSessionInvalidated
            );
        };
    }, [hasActiveSession, forceLocalLogout]);

    /**
     * Handler setelah login berhasil: arahkan otomatis berdasarkan role dari backend.
     */
    const handleLoginSuccess = useCallback((result) => {
        const user = result?.user;
        const token = result?.token;
        const expiresAt = result?.expiresAt;

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

        saveAuthSession(token, user, expiresAt);
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
                <p>Memverifikasi sesi akun Depotify...</p>
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
