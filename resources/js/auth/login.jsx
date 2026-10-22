import { useState } from 'react';
import '../../css/login.css';
import { fetchWithTimeout, saveAuthSession } from '../utils/session';

function Login({ onBack, onLoginSuccess, sessionNotice = '' }) {
    const [mode, setMode] = useState('login'); // 'login' | 'register'

    // State Login
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // State Registrasi User
    const [regForm, setRegForm] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        password: '',
        password_confirmation: '',
    });
    const [showRegPassword, setShowRegPassword] = useState(false);

    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const switchMode = (nextMode) => {
        setError('');
        setSuccessMessage('');
        setMode(nextMode);
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!email.trim() || !password) {
            setError('Email dan kata sandi wajib diisi.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetchWithTimeout(
                '/api/v1/auth/login',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        email: email.trim(),
                        password,
                    }),
                },
                8000
            );

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result.success === false) {
                const validationErrors = result?.errors
                    ? Object.values(result.errors).flat()
                    : [];

                setError(
                    validationErrors[0] ||
                        result.message ||
                        'Email atau kata sandi tidak sesuai.'
                );
                return;
            }

            const authData = result?.data || result;
            const user = authData?.user;
            const token = authData?.token;

            if (!user || !user.role || !token) {
                setError('Respons autentikasi dari server tidak lengkap.');
                return;
            }

            saveAuthSession(token, user);

            if (typeof onLoginSuccess === 'function') {
                onLoginSuccess({
                    user,
                    token,
                });
            }
        } catch (err) {
            const isTimeout = err?.name === 'AbortError';
            setError(
                isTimeout
                    ? 'Permintaan login melebihi batas waktu. Pastikan server Laravel aktif.'
                    : 'Tidak dapat terhubung ke server Laravel. Periksa koneksi dan backend.'
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!regForm.name.trim() || !regForm.email.trim() || !regForm.password) {
            setError('Nama lengkap, email, dan kata sandi wajib diisi.');
            return;
        }

        if (regForm.password.length < 8) {
            setError('Kata sandi minimal harus 8 karakter.');
            return;
        }

        if (regForm.password !== regForm.password_confirmation) {
            setError('Konfirmasi kata sandi tidak cocok.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetchWithTimeout(
                '/api/v1/auth/register',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        name: regForm.name.trim(),
                        email: regForm.email.trim(),
                        phone: regForm.phone.trim() || null,
                        address: regForm.address.trim() || null,
                        password: regForm.password,
                        password_confirmation: regForm.password_confirmation,
                    }),
                },
                8000
            );

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result.success === false) {
                const validationErrors = result?.errors
                    ? Object.values(result.errors).flat()
                    : [];

                setError(
                    validationErrors[0] ||
                        result.message ||
                        'Registrasi gagal diproses.'
                );
                return;
            }

            const registeredEmail = regForm.email.trim();
            setRegForm({
                name: '',
                email: '',
                phone: '',
                address: '',
                password: '',
                password_confirmation: '',
            });
            setEmail(registeredEmail);
            setPassword('');
            setMode('login');
            setSuccessMessage(
                result.message ||
                    'Registrasi akun berhasil! Silakan masuk menggunakan email dan kata sandi Anda.'
            );
        } catch (err) {
            const isTimeout = err?.name === 'AbortError';
            setError(
                isTimeout
                    ? 'Permintaan registrasi melebihi batas waktu. Pastikan server Laravel aktif.'
                    : 'Tidak dapat terhubung ke server Laravel. Periksa koneksi dan backend.'
            );
        } finally {
            setLoading(false);
        }
    };

    const isRegisterMode = mode === 'register';

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-brand">
                    <div className="brand-mark">⌁</div>
                    <h1>Depotify</h1>
                    <p>
                        {isRegisterMode
                            ? 'Daftarkan akun pengguna Anda untuk mengakses layanan dan informasi katalog produk depot.'
                            : 'Sistem pengelolaan operasional, inventaris stok, transaksi, dan kemitraan depot terintegrasi.'}
                    </p>
                </div>

                <div className="login-card">
                    {typeof onBack === 'function' && (
                        <button
                            type="button"
                            className="back-button"
                            onClick={onBack}
                            disabled={loading}
                        >
                            ← Kembali ke Beranda
                        </button>
                    )}

                    <div className="login-heading">
                        <p className="section-label">
                            {isRegisterMode
                                ? 'REGISTRASI AKUN USER'
                                : 'AUTENTIKASI AKUN'}
                        </p>
                        <h2>
                            {isRegisterMode
                                ? 'Buat akun baru'
                                : 'Selamat datang kembali'}
                        </h2>
                        <p>
                            {isRegisterMode
                                ? 'Lengkapi data di bawah ini untuk mendaftar sebagai pengguna Depotify.'
                                : 'Masukkan email dan kata sandi Anda untuk masuk ke Depotify.'}
                        </p>
                    </div>

                    {sessionNotice && !error && !successMessage && (
                        <div className="login-error" role="status">
                            {sessionNotice}
                        </div>
                    )}

                    {successMessage && (
                        <div className="login-success" role="status">
                            {successMessage}
                        </div>
                    )}

                    {!isRegisterMode ? (
                        <>
                            <form onSubmit={handleLoginSubmit}>
                                <div className="form-group">
                                    <label htmlFor="email">Email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="Masukkan email Anda"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        autoComplete="username"
                                        disabled={loading}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="password">Kata Sandi</label>
                                    <div className="password-wrapper">
                                        <input
                                            id="password"
                                            type={
                                                showPassword
                                                    ? 'text'
                                                    : 'password'
                                            }
                                            placeholder="Masukkan kata sandi"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            autoComplete="current-password"
                                            disabled={loading}
                                            required
                                        />

                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() =>
                                                setShowPassword((prev) => !prev)
                                            }
                                            disabled={loading}
                                            aria-label={
                                                showPassword
                                                    ? 'Sembunyikan kata sandi'
                                                    : 'Tampilkan kata sandi'
                                            }
                                        >
                                            {showPassword
                                                ? 'Sembunyikan'
                                                : 'Lihat'}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="login-error" role="alert">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="login-submit"
                                    disabled={loading}
                                >
                                    {loading ? 'Memproses...' : 'Masuk'}
                                </button>
                            </form>

                            <div className="auth-switch">
                                <span>Belum punya akun?</span>
                                <button
                                    type="button"
                                    className="auth-switch-btn"
                                    onClick={() => switchMode('register')}
                                    disabled={loading}
                                >
                                    Daftar sekarang
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <form onSubmit={handleRegisterSubmit}>
                                <div className="form-group">
                                    <label htmlFor="reg-name">
                                        Nama Lengkap
                                    </label>
                                    <input
                                        id="reg-name"
                                        type="text"
                                        placeholder="Masukkan nama lengkap Anda"
                                        value={regForm.name}
                                        onChange={(e) =>
                                            setRegForm((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        disabled={loading}
                                        required
                                    />
                                </div>

                                <div className="register-form-row">
                                    <div className="form-group">
                                        <label htmlFor="reg-email">Email</label>
                                        <input
                                            id="reg-email"
                                            type="email"
                                            placeholder="nama@email.com"
                                            value={regForm.email}
                                            onChange={(e) =>
                                                setRegForm((prev) => ({
                                                    ...prev,
                                                    email: e.target.value,
                                                }))
                                            }
                                            disabled={loading}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="reg-phone">
                                            No. Telepon (Opsional)
                                        </label>
                                        <input
                                            id="reg-phone"
                                            type="text"
                                            placeholder="0812xxxxxxxx"
                                            value={regForm.phone}
                                            onChange={(e) =>
                                                setRegForm((prev) => ({
                                                    ...prev,
                                                    phone: e.target.value,
                                                }))
                                            }
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="reg-address">
                                        Alamat (Opsional)
                                    </label>
                                    <input
                                        id="reg-address"
                                        type="text"
                                        placeholder="Masukkan alamat lengkap Anda"
                                        value={regForm.address}
                                        onChange={(e) =>
                                            setRegForm((prev) => ({
                                                ...prev,
                                                address: e.target.value,
                                            }))
                                        }
                                        disabled={loading}
                                    />
                                </div>

                                <div className="register-form-row">
                                    <div className="form-group">
                                        <label htmlFor="reg-password">
                                            Kata Sandi
                                        </label>
                                        <div className="password-wrapper">
                                            <input
                                                id="reg-password"
                                                type={
                                                    showRegPassword
                                                        ? 'text'
                                                        : 'password'
                                                }
                                                placeholder="Min. 8 karakter"
                                                value={regForm.password}
                                                onChange={(e) =>
                                                    setRegForm((prev) => ({
                                                        ...prev,
                                                        password:
                                                            e.target.value,
                                                    }))
                                                }
                                                disabled={loading}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="password-toggle"
                                                onClick={() =>
                                                    setShowRegPassword(
                                                        (prev) => !prev
                                                    )
                                                }
                                                disabled={loading}
                                            >
                                                {showRegPassword
                                                    ? 'Sembunyikan'
                                                    : 'Lihat'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="reg-password-confirm">
                                            Konfirmasi Sandi
                                        </label>
                                        <input
                                            id="reg-password-confirm"
                                            type={
                                                showRegPassword
                                                    ? 'text'
                                                    : 'password'
                                            }
                                            placeholder="Ulangi kata sandi"
                                            value={
                                                regForm.password_confirmation
                                            }
                                            onChange={(e) =>
                                                setRegForm((prev) => ({
                                                    ...prev,
                                                    password_confirmation:
                                                        e.target.value,
                                                }))
                                            }
                                            disabled={loading}
                                            required
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="login-error" role="alert">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="login-submit"
                                    disabled={loading}
                                >
                                    {loading
                                        ? 'Mendaftarkan...'
                                        : 'Daftar Akun'}
                                </button>
                            </form>

                            <div className="auth-switch">
                                <span>Sudah punya akun?</span>
                                <button
                                    type="button"
                                    className="auth-switch-btn"
                                    onClick={() => switchMode('login')}
                                    disabled={loading}
                                >
                                    Masuk di sini
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Login;
