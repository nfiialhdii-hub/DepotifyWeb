import '../css/app.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Login from './auth/login';
import Dashboard from './admin/dashboard';


function LandingPage({ onOwnerLogin }) {
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

                <button
                    className="owner-button"
                    onClick={onOwnerLogin}
                >
                    Masuk sebagai Owner
                </button>
            </nav>

            <main>
                <section className="hero" id="beranda">
                    <div className="hero-content">
                        <p className="hero-eyebrow">
                            SISTEM PENGELOLAAN DEPOT
                        </p>

                        <h1>
                            Kelola Depot
                            <br />
                            Lebih Mudah dengan <span>Depotify</span>
                        </h1>

                        <p className="hero-description">
                            Sistem pengelolaan  gas LPG dan air
                            mineral yang membantu pemilik depot mengelola
                            stok, transaksi, dan laporan dengan lebih mudah.
                        </p>

                    </div>
                </section>

                <section className="section" id="fitur">
                    <p className="section-label">FITUR UTAMA</p>

                    <h2>
                        Semua kebutuhan depot dalam satu sistem.
                    </h2>

                    <div className="feature-grid">
                        <div className="feature-card">
                            <h3>Kelola Stok</h3>
                            <p>
                                Pantau stok gas, air mineral, dan wadah
                                kosong secara lebih teratur.
                            </p>
                        </div>

                        <div className="feature-card">
                            <h3>Transaksi</h3>
                            <p>
                                Catat transaksi penjualan dan pertukaran
                                wadah dengan lebih cepat.
                            </p>
                        </div>

                        <div className="feature-card">
                            <h3>Laporan</h3>
                            <p>
                                Dapatkan rekap penjualan dan kondisi stok
                                depot secara lebih mudah.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section workflow" id="cara-kerja">
                    <p className="section-label">CARA KERJA</p>

                    <h2>
                        Alur pengelolaan depot yang lebih sederhana.
                    </h2>

                    <div className="steps">
                        <div className="step">
                            <span>01</span>
                            <h3>Catat Transaksi</h3>
                            <p>
                                Masukkan data penjualan depot.
                            </p>
                        </div>

                        <div className="step">
                            <span>02</span>
                            <h3>Stok Diperbarui</h3>
                            <p>
                                Perubahan stok tercatat dalam sistem.
                            </p>
                        </div>

                        <div className="step">
                            <span>03</span>
                            <h3>Lihat Laporan</h3>
                            <p>
                                Pantau kondisi depot melalui laporan.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section about" id="tentang">
                    <p className="section-label">
                        TENTANG DEPOTIFY
                    </p>

                    <h2>
                        Dibuat untuk membantu pengelolaan depot
                        menjadi lebih teratur.
                    </h2>

                    <p>
                        Depotify merupakan sistem pengelolaan inventori
                        yang dirancang untuk membantu pemilik depot gas
                        LPG dan air mineral dalam mengelola stok,
                        transaksi, serta laporan.
                    </p>
                </section>
            </main>

            <footer>
                <div className="brand">
                    <span className="brand-mark">⌁</span>
                    <span>Depotify</span>
                </div>

                <p>
                    © 2026 Depotify. Sistem Pengelolaan Depot.
                </p>
            </footer>
        </div>
    );
}

function App() {
    const [page, setPage] = useState(() => {
        const token = localStorage.getItem('depotify_token');

        return token ? 'dashboard' : 'landing';
    });

    const handleLoginSuccess = () => {
        setPage('dashboard');
    };

    const handleLogout = () => {
        setPage('landing');
    };

    if (page === 'login') {
        return (
            <Login
                onBack={() => setPage('landing')}
                onLoginSuccess={handleLoginSuccess}
            />
        );
    }

    if (page === 'dashboard') {
        return (
            <Dashboard
                onLogout={handleLogout}
            />
        );
    }

    return (
        <LandingPage
            onOwnerLogin={() => setPage('login')}
        />
    );
}

const root = createRoot(document.getElementById('app'));
root.render(<App />);
