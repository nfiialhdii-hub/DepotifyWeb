import { useCallback, useEffect, useState } from 'react';
import '../../css/supplier.css';
import {
    USER_STORAGE_KEY,
    emitSessionInvalidated,
    fetchWithTimeout,
    getStoredToken,
} from '../utils/session';

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function unitLabel(unit) {
    const map = {
        gallon: 'Galon',
        canister: 'Tabung',
        pcs: 'Pcs',
        other: 'Unit',
    };
    return map[unit] || unit || 'Unit';
}

function CustomerDashboard({ user, onLogout }) {
    const [activeMenu, setActiveMenu] = useState('catalog');
    const [catalogData, setCatalogData] = useState({
        products: [],
        summary: { available_products: 0, total_catalog: 0 },
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const [profileForm, setProfileForm] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.customer?.phone || user?.phone || '',
        address: user?.customer?.address || '',
        password: '',
        password_confirmation: '',
    });
    const [savingProfile, setSavingProfile] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    const fetchCustomerData = useCallback(async () => {
        setLoading(true);
        setError('');

        const token = getStoredToken();
        if (!token) {
            emitSessionInvalidated(
                'missing_token',
                'Token autentikasi tidak ditemukan. Silakan login kembali.'
            );
            return;
        }

        try {
            const response = await fetchWithTimeout(
                '/api/v1/customer/dashboard',
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                },
                8000
            );

            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                emitSessionInvalidated(
                    'unauthorized',
                    'Sesi login Anda telah berakhir. Silakan login kembali.'
                );
                return;
            }

            if (!response.ok) {
                throw new Error(
                    result?.message || 'Gagal memuat data katalog depot.'
                );
            }

            const payload = result?.data || {};
            setCatalogData({
                products: Array.isArray(payload.products)
                    ? payload.products
                    : [],
                summary: payload.summary || {
                    available_products: 0,
                    total_catalog: 0,
                },
            });

            if (payload.user) {
                setProfileForm((prev) => ({
                    ...prev,
                    name: payload.user.name || prev.name,
                    email: payload.user.email || prev.email,
                    phone:
                        payload.user.customer?.phone ||
                        payload.user.phone ||
                        prev.phone,
                    address:
                        payload.user.customer?.address || prev.address || '',
                }));
            }
        } catch (err) {
            setError(err.message || 'Gagal memuat data halaman pengguna.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomerData();
    }, [fetchCustomerData]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        setFeedback({ type: '', message: '' });

        const token = getStoredToken();
        if (!token) {
            emitSessionInvalidated('missing_token', 'Silakan login kembali.');
            return;
        }

        try {
            const body = {
                name: profileForm.name.trim(),
                email: profileForm.email.trim(),
                phone: profileForm.phone.trim() || null,
                address: profileForm.address.trim() || null,
            };

            if (profileForm.password) {
                body.password = profileForm.password;
                body.password_confirmation = profileForm.password_confirmation;
            }

            const response = await fetchWithTimeout(
                '/api/v1/customer/profile',
                {
                    method: 'PUT',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                },
                8000
            );

            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                emitSessionInvalidated(
                    'unauthorized',
                    'Sesi berakhir. Silakan login kembali.'
                );
                return;
            }

            if (!response.ok) {
                const firstErr = result?.errors
                    ? Object.values(result.errors).flat()[0]
                    : null;
                throw new Error(
                    firstErr || result?.message || 'Gagal memperbarui profil.'
                );
            }

            if (result?.data) {
                localStorage.setItem(
                    USER_STORAGE_KEY,
                    JSON.stringify(result.data)
                );
            }

            setProfileForm((prev) => ({
                ...prev,
                password: '',
                password_confirmation: '',
            }));
            setFeedback({
                type: 'success',
                message: 'Profil Anda berhasil diperbarui.',
            });
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Gagal menyimpan profil.',
            });
        } finally {
            setSavingProfile(false);
        }
    };

    const filteredProducts = catalogData.products.filter((product) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (product.name || '').toLowerCase().includes(q) ||
            (product.variant || '').toLowerCase().includes(q) ||
            (product.category?.name || '').toLowerCase().includes(q)
        );
    });

    const displayName = profileForm.name || user?.name || 'Pengguna Depotify';
    const initial = displayName.charAt(0).toUpperCase();

    return (
        <div className="supplier-layout">
            <aside className="supplier-sidebar">
                <div className="supplier-brand">
                    <span>Depotify</span>
                </div>

                <div className="supplier-profile-slab">
                    <div className="supplier-avatar-ring">
                        <div className="supplier-avatar-core">{initial}</div>
                    </div>
                    <strong className="supplier-profile-name">
                        {displayName}
                    </strong>
                    <span className="supplier-profile-id">
                        {profileForm.email || user?.email || 'CUSTOMER'}
                    </span>
                </div>

                <div className="supplier-sidebar-section">
                    <nav className="supplier-nav">
                        <button
                            type="button"
                            className={
                                activeMenu === 'catalog'
                                    ? 'supplier-nav-item active'
                                    : 'supplier-nav-item'
                            }
                            onClick={() => setActiveMenu('catalog')}
                        >
                            <span className="supplier-nav-item-left">
                                <span className="supplier-nav-icon">◫</span>
                                <span>KATALOG PRODUK</span>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={
                                activeMenu === 'profile'
                                    ? 'supplier-nav-item active'
                                    : 'supplier-nav-item'
                            }
                            onClick={() => setActiveMenu('profile')}
                        >
                            <span className="supplier-nav-item-left">
                                <span className="supplier-nav-icon">◈</span>
                                <span>PROFIL SAYA</span>
                            </span>
                        </button>
                    </nav>
                </div>

                <div className="supplier-sidebar-bottom">
                    <button
                        type="button"
                        className="supplier-logout-btn"
                        onClick={onLogout}
                        title="Keluar dari Sesi"
                    >
                        <span className="supplier-power-icon">⏻</span>
                        <span>Keluar</span>
                    </button>
                </div>
            </aside>

            <main className="supplier-main">
                <header className="supplier-header">
                    <div>
                        <p className="supplier-eyebrow">BERANDA PENGGUNA</p>
                        <h1>Selamat datang, {displayName}</h1>
                        <p>
                            Informasi ketersediaan stok gas LPG, air galon, dan
                            produk Depotify.
                        </p>
                    </div>

                    <div className="supplier-user-card">
                        <div className="supplier-user-avatar">{initial}</div>
                        <div className="supplier-user-info">
                            <strong>{displayName}</strong>
                            <span>{profileForm.email || user?.email}</span>
                        </div>
                    </div>
                </header>

                {feedback.message && (
                    <div
                        className={`supplier-alert ${
                            feedback.type === 'error' ? 'error' : 'success'
                        }`}
                    >
                        <span>{feedback.message}</span>
                        <button
                            type="button"
                            className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                            onClick={() =>
                                setFeedback({ type: '', message: '' })
                            }
                        >
                            Tutup
                        </button>
                    </div>
                )}

                {activeMenu === 'catalog' ? (
                    <div className="supplier-panel">
                        <div className="supplier-panel-header">
                            <div className="supplier-panel-title">
                                <h2>Katalog Produk & Ketersediaan Stok</h2>
                                <p>
                                    Daftar harga dan ketersediaan stok produk di
                                    depot saat ini.
                                </p>
                            </div>

                            <input
                                type="text"
                                className="supplier-search-input"
                                style={{ maxWidth: '300px' }}
                                placeholder="Cari nama produk atau kategori..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div className="supplier-alert error">
                                <span>{error}</span>
                                <button
                                    type="button"
                                    className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                                    onClick={fetchCustomerData}
                                >
                                    Coba Lagi
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div className="supplier-state-box">
                                <h3>Memuat katalog produk...</h3>
                                <p>Mengambil data produk dari server depot.</p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="supplier-state-box">
                                <h3>Produk tidak ditemukan</h3>
                                <p>
                                    Belum ada produk yang sesuai dengan kata
                                    kunci pencarian Anda.
                                </p>
                            </div>
                        ) : (
                            <div className="supplier-table-wrap">
                                <table className="supplier-table">
                                    <thead>
                                        <tr>
                                            <th>Nama Produk</th>
                                            <th>Kategori</th>
                                            <th>Satuan</th>
                                            <th>Harga Jual / Isi Ulang</th>
                                            <th>Stok Tersedia</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProducts.map((product) => {
                                            const inStock =
                                                Number(
                                                    product.stock_content || 0
                                                ) > 0;
                                            return (
                                                <tr key={product.id}>
                                                    <td>
                                                        <strong>
                                                            {product.name}
                                                        </strong>
                                                        {product.variant && (
                                                            <span className="supplier-subtext">
                                                                Varian:{' '}
                                                                {
                                                                    product.variant
                                                                }
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {product.category
                                                            ?.name || '-'}
                                                    </td>
                                                    <td>
                                                        {unitLabel(
                                                            product.unit
                                                        )}
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {formatRupiah(
                                                                product.selling_price
                                                            )}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {product.stock_content ||
                                                                0}
                                                        </strong>{' '}
                                                        {unitLabel(
                                                            product.unit
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`supplier-badge ${
                                                                inStock
                                                                    ? 'received'
                                                                    : 'rejected'
                                                            }`}
                                                        >
                                                            {inStock
                                                                ? 'Tersedia'
                                                                : 'Stok Habis'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="supplier-panel">
                        <div className="supplier-panel-header">
                            <div className="supplier-panel-title">
                                <h2>Profil Akun Pengguna</h2>
                                <p>
                                    Kelola informasi akun dan alamat pengiriman
                                    Anda.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveProfile}>
                            <div className="supplier-form-grid">
                                <div className="supplier-form-group">
                                    <label htmlFor="cust-name">
                                        Nama Lengkap
                                    </label>
                                    <input
                                        id="cust-name"
                                        type="text"
                                        value={profileForm.name}
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        required
                                        disabled={savingProfile}
                                    />
                                </div>

                                <div className="supplier-form-group">
                                    <label htmlFor="cust-email">Email</label>
                                    <input
                                        id="cust-email"
                                        type="email"
                                        value={profileForm.email}
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                email: e.target.value,
                                            }))
                                        }
                                        required
                                        disabled={savingProfile}
                                    />
                                </div>

                                <div className="supplier-form-group">
                                    <label htmlFor="cust-phone">
                                        Nomor Telepon
                                    </label>
                                    <input
                                        id="cust-phone"
                                        type="text"
                                        value={profileForm.phone}
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                phone: e.target.value,
                                            }))
                                        }
                                        disabled={savingProfile}
                                    />
                                </div>

                                <div className="supplier-form-group full">
                                    <label htmlFor="cust-address">Alamat</label>
                                    <textarea
                                        id="cust-address"
                                        rows={3}
                                        value={profileForm.address}
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                address: e.target.value,
                                            }))
                                        }
                                        disabled={savingProfile}
                                    />
                                </div>

                                <div className="supplier-form-group">
                                    <label htmlFor="cust-pass">
                                        Kata Sandi Baru (Opsional)
                                    </label>
                                    <input
                                        id="cust-pass"
                                        type="password"
                                        placeholder="Kosongkan jika tidak diubah"
                                        value={profileForm.password}
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                password: e.target.value,
                                            }))
                                        }
                                        disabled={savingProfile}
                                    />
                                </div>

                                <div className="supplier-form-group">
                                    <label htmlFor="cust-pass-confirm">
                                        Konfirmasi Kata Sandi Baru
                                    </label>
                                    <input
                                        id="cust-pass-confirm"
                                        type="password"
                                        placeholder="Ulangi kata sandi baru"
                                        value={
                                            profileForm.password_confirmation
                                        }
                                        onChange={(e) =>
                                            setProfileForm((prev) => ({
                                                ...prev,
                                                password_confirmation:
                                                    e.target.value,
                                            }))
                                        }
                                        disabled={savingProfile}
                                    />
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: '20px',
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                }}
                            >
                                <button
                                    type="submit"
                                    className="supplier-btn supplier-btn-success"
                                    disabled={savingProfile}
                                >
                                    {savingProfile
                                        ? 'Menyimpan...'
                                        : 'Simpan Profil'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
}

export default CustomerDashboard;
