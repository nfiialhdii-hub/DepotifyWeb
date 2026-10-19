import { useState } from 'react';
import '../css/login.css';


function Login({ onBack, onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError('');

        if (!email || !password) {
            setError('Email dan kata sandi wajib diisi.');
            return;
        }

        try {
            const response = await fetch(
                'http://127.0.0.1:8000/api/v1/auth/login',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                    }),
                }
            );

            const result = await response.json();

            console.log('STATUS:', response.status);
            console.log('RESULT:', result);

            if (!response.ok) {
                setError(result.message || 'Login gagal.');
                return;
            }

            localStorage.setItem(
                'depotify_token',
                result.data.token
            );

            localStorage.setItem(
                'depotify_user',
                JSON.stringify(result.data.user)
            );

            onLoginSuccess(result.data.user);

        } catch (error) {
            console.error('LOGIN ERROR:', error);

            setError(
                'Gagal menghubungi API Laravel: ' + error.message
            );
        }
    };

    return (
        <div className="login-page">

            <div className="login-bg-shapes" aria-hidden="true"></div>

            <div className="login-container">

                <div className="login-brand">
                    <div className="brand-mark">⌁</div>

                    <h1>Depotify</h1>

                    <p>
                        Sistem pengelolaan depot
                        gas LPG dan air mineral.
                    </p>
                </div>

                <div className="login-card">
                    <button
                        type="button"
                        className="back-button"
                        onClick={onBack}
                    >
                        ← Kembali
                    </button>

                    <div className="login-heading">
                        <p className="section-label">
                            OWNER ACCESS
                        </p>

                        <h2>Selamat datang kembali</h2>

                        <p>
                            Masuk untuk mengelola depot Anda.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>

                        <div className="form-group">
                            <label htmlFor="email">
                                Email
                            </label>

                            <input
                                id="email"
                                type="email"
                                placeholder="Masukkan email"
                                value={email}
                                onChange={(e) =>
                                    setEmail(e.target.value)
                                }
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">
                                Kata sandi
                            </label>

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
                                />

                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() =>
                                        setShowPassword(!showPassword)
                                    }
                                >
                                    {showPassword ? 'Sembunyikan' : 'Lihat'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="login-error">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="login-submit"
                        >
                            Masuk sebagai Owner
                        </button>

                    </form>
                </div>
            </div>
        </div>
    );
}

export default Login;
