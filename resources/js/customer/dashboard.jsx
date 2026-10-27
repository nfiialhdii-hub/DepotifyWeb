import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/supplier.css';
import '../../css/admin-modules.css';
import '../../css/purchase.css';
import {
    USER_STORAGE_KEY,
    emitSessionInvalidated,
    fetchWithTimeout,
    getStoredToken,
} from '../utils/session';

const ITEMS_PER_PAGE = 10;

function formatRupiah(value) {
    return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
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

function transactionTypeLabel(type) {
    const map = {
        top_up: 'Isi Ulang',
        new_deposit: 'Pinjam Wadah',
        buy_disconnect: 'Beli Putus',
    };
    return map[type] || type || '-';
}

function paymentLabel(method) {
    const map = {
        cash: 'Tunai / COD',
        transfer: 'Transfer Bank',
        other: 'QRIS',
    };
    return map[method] || method || '-';
}

function statusLabel(status) {
    if (status === 'completed') return 'Selesai';
    if (status === 'cancelled') return 'Dibatalkan';
    return 'Diproses';
}

function statusBadgeColor(status) {
    if (status === 'completed') return 'green';
    if (status === 'cancelled') return 'red';
    return 'blue';
}

function unwrapList(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.data)) return result.data.data;
    return [];
}

function CustomerDashboard({ user, onLogout }) {
    const [activeMenu, setActiveMenu] = useState('catalog');
    const [catalogData, setCatalogData] = useState({
        products: [],
        summary: { available_products: 0, total_catalog: 0 },
    });
    const [orders, setOrders] = useState([]);
    const [orderSummary, setOrderSummary] = useState({
        total: 0,
        completed: 0,
        processing: 0,
        cancelled: 0,
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filter Katalog
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    // Filter & Pagination Pesanan Saya
    const [orderSearch, setOrderSearch] = useState('');
    const [orderStatusFilter, setOrderStatusFilter] = useState('');
    const [orderPage, setOrderPage] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState(null);

    // State Keranjang Belanja User
    const [cart, setCart] = useState([]);
    const [checkoutForm, setCheckoutForm] = useState({
        payment_method: 'cash',
        customer_phone: user?.customer?.phone || user?.phone || '',
        customer_address: user?.customer?.address || '',
    });

    // Modal Beli Langsung 1 Produk
    const [buyProduct, setBuyProduct] = useState(null);
    const [buyForm, setBuyForm] = useState({
        qty: 1,
        transaction_type: 'top_up',
        payment_method: 'cash',
    });
    const [buying, setBuying] = useState(false);

    // Profil User
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
            const [dashRes, ordersRes] = await Promise.all([
                fetchWithTimeout(
                    '/api/v1/customer/dashboard',
                    {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                    },
                    20000
                ),
                fetchWithTimeout(
                    '/api/v1/customer/orders?per_page=100',
                    {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                    },
                    20000
                ),
            ]);

            if (dashRes.status === 401 || ordersRes.status === 401) {
                emitSessionInvalidated(
                    'unauthorized',
                    'Sesi login Anda telah berakhir. Silakan login kembali.'
                );
                return;
            }

            const result = await dashRes.json().catch(() => ({}));
            const ordersResult = await ordersRes.json().catch(() => ({}));

            if (!dashRes.ok) {
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

            setOrders(unwrapList(ordersResult));
            if (ordersResult?.summary) {
                setOrderSummary(ordersResult.summary);
            }

            if (payload.user) {
                const phoneVal =
                    payload.user.customer?.phone ||
                    payload.user.phone ||
                    '';
                const addrVal = payload.user.customer?.address || '';

                setProfileForm((prev) => ({
                    ...prev,
                    name: payload.user.name || prev.name,
                    email: payload.user.email || prev.email,
                    phone: phoneVal || prev.phone,
                    address: addrVal || prev.address,
                }));

                setCheckoutForm((prev) => ({
                    ...prev,
                    customer_phone: prev.customer_phone || phoneVal,
                    customer_address: prev.customer_address || addrVal,
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

    const categories = useMemo(() => {
        const map = new Map();
        (catalogData.products || []).forEach((p) => {
            if (p.category?.id && p.category?.name) {
                map.set(String(p.category.id), p.category.name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [catalogData.products]);

    const filteredProducts = useMemo(() => {
        return (catalogData.products || []).filter((product) => {
            const q = search.trim().toLowerCase();
            const matchesSearch =
                !q ||
                (product.name || '').toLowerCase().includes(q) ||
                (product.variant || '').toLowerCase().includes(q) ||
                (product.category?.name || '').toLowerCase().includes(q);

            const matchesCategory =
                !categoryFilter ||
                String(product.category_id) === String(categoryFilter);

            return matchesSearch && matchesCategory;
        });
    }, [catalogData.products, search, categoryFilter]);

    const filteredOrders = useMemo(() => {
        return orders.filter((ord) => {
            const q = orderSearch.trim().toLowerCase();
            const itemNames = (ord.items || [])
                .map((i) => i.product_name || '')
                .join(' ');
            const matchesSearch =
                !q ||
                (ord.transaction_code || '').toLowerCase().includes(q) ||
                itemNames.toLowerCase().includes(q);

            const matchesStatus =
                !orderStatusFilter ||
                (orderStatusFilter === 'processing' &&
                    ['pending', 'processing'].includes(ord.status)) ||
                ord.status === orderStatusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [orders, orderSearch, orderStatusFilter]);

    const totalOrderPages = Math.max(
        1,
        Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)
    );
    const currentOrderPage = Math.min(orderPage, totalOrderPages);
    const pagedOrders = filteredOrders.slice(
        (currentOrderPage - 1) * ITEMS_PER_PAGE,
        currentOrderPage * ITEMS_PER_PAGE
    );

    // Fungsi Keranjang Belanja
    const addToCart = (product) => {
        setFeedback({ type: '', message: '' });
        const maxStock = Number(product.stock_content || 0);
        if (maxStock <= 0) return;

        setCart((prev) => {
            const existingIndex = prev.findIndex(
                (item) => Number(item.product.id) === Number(product.id)
            );
            if (existingIndex >= 0) {
                return prev.map((item, idx) =>
                    idx === existingIndex
                        ? {
                              ...item,
                              qty: Math.min(maxStock, Number(item.qty) + 1),
                          }
                        : item
                );
            }
            return [
                ...prev,
                {
                    product,
                    qty: 1,
                    transaction_type: product.uses_container
                        ? 'top_up'
                        : 'buy_disconnect',
                },
            ];
        });

        setFeedback({
            type: 'success',
            message: `${product.name} ditambahkan ke keranjang.`,
        });
    };

    const updateCartItem = (productId, key, value) => {
        setCart((prev) =>
            prev.map((item) => {
                if (Number(item.product.id) !== Number(productId)) return item;
                if (key === 'qty') {
                    const max = Number(item.product.stock_content || 1);
                    return {
                        ...item,
                        qty: Math.max(1, Math.min(max, Number(value || 1))),
                    };
                }
                return { ...item, [key]: value };
            })
        );
    };

    const removeFromCart = (productId) => {
        setCart((prev) =>
            prev.filter((item) => Number(item.product.id) !== Number(productId))
        );
    };

    const calcItemPrice = (product, txType) => {
        if (!product) return 0;
        const base = Number(product.selling_price || 0);
        const deposit =
            product.uses_container && txType === 'new_deposit'
                ? Number(product.deposit_price || 0)
                : 0;
        return base + deposit;
    };

    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => {
            return (
                sum +
                Number(item.qty || 1) *
                    calcItemPrice(item.product, item.transaction_type)
            );
        }, 0);
    }, [cart]);

    // Checkout dari Keranjang
    const handleCartCheckout = async (e) => {
        e.preventDefault();
        if (cart.length === 0) return;

        const token = getStoredToken();
        if (!token) {
            emitSessionInvalidated('missing_token', 'Silakan login kembali.');
            return;
        }

        setBuying(true);
        setFeedback({ type: '', message: '' });

        try {
            const response = await fetchWithTimeout(
                '/api/v1/customer/orders',
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        payment_method: checkoutForm.payment_method,
                        customer_phone:
                            checkoutForm.customer_phone.trim() || null,
                        customer_address:
                            checkoutForm.customer_address.trim() || null,
                        channel: 'app',
                        items: cart.map((item) => {
                            const txType = item.product.uses_container
                                ? item.transaction_type
                                : 'buy_disconnect';
                            const qty = Math.max(1, Number(item.qty || 1));
                            return {
                                product_id: Number(item.product.id),
                                transaction_type: txType,
                                qty,
                                empty_container_accepted:
                                    txType === 'top_up' &&
                                    item.product.uses_container
                                        ? qty
                                        : 0,
                            };
                        }),
                    }),
                },
                20000
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
                    firstErr || result?.message || 'Gagal memproses pesanan.'
                );
            }

            const created = result?.data || result;
            setCart([]);
            setFeedback({
                type: 'success',
                message: `Pesanan ${created?.transaction_code || ''} berhasil dibuat!`,
            });
            await fetchCustomerData();
            setActiveMenu('orders');
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Gagal memproses checkout.',
            });
        } finally {
            setBuying(false);
        }
    };

    // Beli Langsung 1 Produk
    const openBuyModal = (product) => {
        setFeedback({ type: '', message: '' });
        setBuyProduct(product);
        setBuyForm({
            qty: 1,
            transaction_type: product.uses_container
                ? 'top_up'
                : 'buy_disconnect',
            payment_method: 'cash',
        });
    };

    const handleDirectBuy = async (e) => {
        e.preventDefault();
        if (!buyProduct) return;

        const token = getStoredToken();
        if (!token) {
            emitSessionInvalidated('missing_token', 'Silakan login kembali.');
            return;
        }

        setBuying(true);
        setFeedback({ type: '', message: '' });

        try {
            const txType = buyProduct.uses_container
                ? buyForm.transaction_type
                : 'buy_disconnect';
            const qty = Math.max(1, Number(buyForm.qty || 1));

            const response = await fetchWithTimeout(
                '/api/v1/customer/orders',
                {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        payment_method: buyForm.payment_method,
                        customer_phone: profileForm.phone.trim() || null,
                        customer_address: profileForm.address.trim() || null,
                        channel: 'app',
                        items: [
                            {
                                product_id: Number(buyProduct.id),
                                transaction_type: txType,
                                qty,
                                empty_container_accepted:
                                    txType === 'top_up' &&
                                    buyProduct.uses_container
                                        ? qty
                                        : 0,
                            },
                        ],
                    }),
                },
                20000
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
                    firstErr || result?.message || 'Gagal memproses pesanan.'
                );
            }

            const created = result?.data || result;
            setBuyProduct(null);
            setFeedback({
                type: 'success',
                message: `Pembelian ${created?.transaction_code || ''} berhasil dibuat!`,
            });
            await fetchCustomerData();
            setActiveMenu('orders');
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Gagal membuat pesanan.',
            });
        } finally {
            setBuying(false);
        }
    };

    // Batalkan Pesanan oleh Customer
    const handleCancelOrder = async (ord) => {
        const token = getStoredToken();
        if (!token) return;

        setFeedback({ type: '', message: '' });

        try {
            const response = await fetchWithTimeout(
                `/api/v1/customer/orders/${ord.id}`,
                {
                    method: 'PUT',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ status: 'cancelled' }),
                },
                20000
            );

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    result?.message || 'Gagal membatalkan pesanan.'
                );
            }

            setFeedback({
                type: 'success',
                message: `Pesanan ${ord.transaction_code} berhasil dibatalkan.`,
            });
            if (selectedOrder?.id === ord.id) {
                setSelectedOrder(result?.data || null);
            }
            await fetchCustomerData();
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err.message || 'Gagal membatalkan pesanan.',
            });
        }
    };

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
                20000
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

    const displayName = profileForm.name || user?.name || 'Pengguna Depotify';
    const initial = displayName.charAt(0).toUpperCase();
    const unitBuyPrice = calcItemPrice(buyProduct, buyForm.transaction_type);
    const totalCartItems = cart.reduce((sum, i) => sum + Number(i.qty || 0), 0);

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
                                <span>KATALOG & BELI</span>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={
                                activeMenu === 'cart'
                                    ? 'supplier-nav-item active'
                                    : 'supplier-nav-item'
                            }
                            onClick={() => setActiveMenu('cart')}
                        >
                            <span className="supplier-nav-item-left">
                                <span className="supplier-nav-icon">◰</span>
                                <span>KERANJANG</span>
                            </span>
                            {totalCartItems > 0 && (
                                <span className="supplier-nav-badge">
                                    {totalCartItems}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            className={
                                activeMenu === 'orders'
                                    ? 'supplier-nav-item active'
                                    : 'supplier-nav-item'
                            }
                            onClick={() => setActiveMenu('orders')}
                        >
                            <span className="supplier-nav-item-left">
                                <span className="supplier-nav-icon">⇄</span>
                                <span>PESANAN SAYA</span>
                            </span>
                            {orders.length > 0 && (
                                <span className="supplier-nav-badge">
                                    {orders.length}
                                </span>
                            )}
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
                {/* HEADER */}
                <div className="adm-header">
                    <div className="adm-header-title">
                        <h1>
                            {activeMenu === 'catalog'
                                ? 'Katalog Produk Depot'
                                : activeMenu === 'cart'
                                ? 'Keranjang Belanja'
                                : activeMenu === 'orders'
                                ? 'Pesanan Saya'
                                : 'Profil Saya'}
                        </h1>
                    </div>

                    <div className="adm-header-actions">
                        {totalCartItems > 0 && activeMenu !== 'cart' && (
                            <button
                                type="button"
                                className="adm-btn-primary"
                                onClick={() => setActiveMenu('cart')}
                            >
                                Keranjang ({totalCartItems}) ·{' '}
                                {formatRupiah(cartTotal)}
                            </button>
                        )}
                        <button
                            type="button"
                            className="adm-btn-secondary"
                            onClick={fetchCustomerData}
                            disabled={loading}
                        >
                            ↻ Segarkan
                        </button>
                    </div>
                </div>

                {/* SUMMARY METRICS */}
                <div className="adm-metrics-grid">
                    <div className="adm-metric-card">
                        <span className="adm-metric-label">
                            Produk Tersedia
                        </span>
                        <strong className="adm-metric-value green">
                            {catalogData.summary?.available_products || 0}
                        </strong>
                    </div>

                    <div className="adm-metric-card">
                        <span className="adm-metric-label">
                            Isi Keranjang
                        </span>
                        <strong className="adm-metric-value blue">
                            {totalCartItems} unit
                        </strong>
                    </div>

                    <div className="adm-metric-card">
                        <span className="adm-metric-label">
                            Pesanan Diproses
                        </span>
                        <strong className="adm-metric-value blue">
                            {orderSummary.processing || 0}
                        </strong>
                    </div>

                    <div className="adm-metric-card">
                        <span className="adm-metric-label">
                            Pesanan Selesai
                        </span>
                        <strong className="adm-metric-value green">
                            {orderSummary.completed || 0}
                        </strong>
                    </div>
                </div>

                {feedback.message && (
                    <div
                        className={`purchase-alert ${
                            feedback.type === 'error'
                                ? 'purchase-alert-error'
                                : 'purchase-alert-success'
                        }`}
                    >
                        <span>{feedback.message}</span>
                        <button
                            type="button"
                            onClick={() =>
                                setFeedback({ type: '', message: '' })
                            }
                        >
                            ×
                        </button>
                    </div>
                )}

                {error && (
                    <div className="purchase-alert purchase-alert-error">
                        <span>{error}</span>
                        <button type="button" onClick={fetchCustomerData}>
                            ↻
                        </button>
                    </div>
                )}

                {/* MENU 1: KATALOG & BELI */}
                {activeMenu === 'catalog' && (
                    <div className="adm-panel">
                        <div className="adm-toolbar">
                            <div className="adm-search">
                                <span>⌕</span>
                                <input
                                    type="search"
                                    placeholder="Cari air mineral, gas LPG, atau kategori..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            <select
                                className="adm-select"
                                value={categoryFilter}
                                onChange={(e) =>
                                    setCategoryFilter(e.target.value)
                                }
                            >
                                <option value="">Semua Kategori</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {loading ? (
                            <div className="adm-empty">
                                Memuat katalog produk...
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="adm-empty">
                                Produk tidak ditemukan.
                            </div>
                        ) : (
                            <div className="adm-table-wrap">
                                <table className="adm-table">
                                    <thead>
                                        <tr>
                                            <th>Produk</th>
                                            <th>Kategori</th>
                                            <th>Harga Isi Ulang / Jual</th>
                                            <th>Stok</th>
                                            <th>Status</th>
                                            <th>Aksi</th>
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
                                                            {product.variant
                                                                ? ` · ${product.variant}`
                                                                : ''}
                                                        </strong>
                                                        {product.uses_container &&
                                                            Number(
                                                                product.deposit_price ||
                                                                    0
                                                            ) > 0 && (
                                                                <small>
                                                                    Deposit
                                                                    wadah baru:{' '}
                                                                    {formatRupiah(
                                                                        product.deposit_price
                                                                    )}
                                                                </small>
                                                            )}
                                                    </td>
                                                    <td>
                                                        {product.category
                                                            ?.name || '-'}
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
                                                                0}{' '}
                                                            {unitLabel(
                                                                product.unit
                                                            )}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`adm-badge ${
                                                                inStock
                                                                    ? 'green'
                                                                    : 'red'
                                                            }`}
                                                        >
                                                            {inStock
                                                                ? 'Tersedia'
                                                                : 'Habis'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: '8px',
                                                                alignItems:
                                                                    'center',
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="adm-btn-secondary adm-btn-sm"
                                                                disabled={
                                                                    !inStock
                                                                }
                                                                onClick={() =>
                                                                    addToCart(
                                                                        product
                                                                    )
                                                                }
                                                            >
                                                                ＋ Keranjang
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="adm-btn-primary adm-btn-sm"
                                                                disabled={
                                                                    !inStock
                                                                }
                                                                onClick={() =>
                                                                    openBuyModal(
                                                                        product
                                                                    )
                                                                }
                                                            >
                                                                Beli Sekarang
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* MENU 2: KERANJANG BELANJA */}
                {activeMenu === 'cart' && (
                    <div className="adm-panel">
                        {cart.length === 0 ? (
                            <div className="adm-empty">
                                <p>Keranjang belanja Anda masih kosong.</p>
                                <button
                                    type="button"
                                    className="adm-btn-primary"
                                    onClick={() => setActiveMenu('catalog')}
                                >
                                    Pilih Produk di Katalog
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleCartCheckout}>
                                <div className="adm-table-wrap">
                                    <table className="adm-table">
                                        <thead>
                                            <tr>
                                                <th>Produk</th>
                                                <th>Jenis Pembelian</th>
                                                <th>Jumlah</th>
                                                <th>Harga Satuan</th>
                                                <th>Subtotal</th>
                                                <th>Hapus</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cart.map((item) => {
                                                const unitPrice = calcItemPrice(
                                                    item.product,
                                                    item.transaction_type
                                                );
                                                return (
                                                    <tr key={item.product.id}>
                                                        <td>
                                                            <strong>
                                                                {
                                                                    item.product
                                                                        .name
                                                                }
                                                            </strong>
                                                            <small>
                                                                Stok:{' '}
                                                                {
                                                                    item.product
                                                                        .stock_content
                                                                }
                                                            </small>
                                                        </td>
                                                        <td>
                                                            {item.product
                                                                .uses_container ? (
                                                                <select
                                                                    className="adm-select"
                                                                    style={{
                                                                        height: '36px',
                                                                    }}
                                                                    value={
                                                                        item.transaction_type
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        updateCartItem(
                                                                            item
                                                                                .product
                                                                                .id,
                                                                            'transaction_type',
                                                                            e
                                                                                .target
                                                                                .value
                                                                        )
                                                                    }
                                                                >
                                                                    <option value="top_up">
                                                                        Isi
                                                                        Ulang
                                                                    </option>
                                                                    <option value="new_deposit">
                                                                        Pinjam
                                                                        Wadah
                                                                        (+Deposit)
                                                                    </option>
                                                                    <option value="buy_disconnect">
                                                                        Beli
                                                                        Putus
                                                                    </option>
                                                                </select>
                                                            ) : (
                                                                <span>
                                                                    Beli Putus
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="adm-date-input"
                                                                style={{
                                                                    width: '86px',
                                                                    height: '36px',
                                                                }}
                                                                min="1"
                                                                max={
                                                                    item.product
                                                                        .stock_content
                                                                }
                                                                value={item.qty}
                                                                onChange={(e) =>
                                                                    updateCartItem(
                                                                        item
                                                                            .product
                                                                            .id,
                                                                        'qty',
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </td>
                                                        <td>
                                                            {formatRupiah(
                                                                unitPrice
                                                            )}
                                                        </td>
                                                        <td>
                                                            <strong>
                                                                {formatRupiah(
                                                                    unitPrice *
                                                                        item.qty
                                                                )}
                                                            </strong>
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="adm-btn-danger adm-btn-sm"
                                                                onClick={() =>
                                                                    removeFromCart(
                                                                        item
                                                                            .product
                                                                            .id
                                                                    )
                                                                }
                                                            >
                                                                ×
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div
                                    className="purchase-form-grid"
                                    style={{ marginTop: '18px' }}
                                >
                                    <label>
                                        Metode Pembayaran
                                        <select
                                            value={checkoutForm.payment_method}
                                            onChange={(e) =>
                                                setCheckoutForm((prev) => ({
                                                    ...prev,
                                                    payment_method:
                                                        e.target.value,
                                                }))
                                            }
                                        >
                                            <option value="cash">
                                                Tunai / COD
                                            </option>
                                            <option value="transfer">
                                                Transfer Bank
                                            </option>
                                            <option value="other">QRIS</option>
                                        </select>
                                    </label>

                                    <label>
                                        Nomor Telepon Penerima
                                        <input
                                            type="text"
                                            placeholder="0812xxxxxxxx"
                                            value={checkoutForm.customer_phone}
                                            onChange={(e) =>
                                                setCheckoutForm((prev) => ({
                                                    ...prev,
                                                    customer_phone:
                                                        e.target.value,
                                                }))
                                            }
                                        />
                                    </label>

                                    <label className="purchase-form-full">
                                        Alamat Pengiriman
                                        <input
                                            type="text"
                                            placeholder="Alamat pengiriman pesanan"
                                            value={
                                                checkoutForm.customer_address
                                            }
                                            onChange={(e) =>
                                                setCheckoutForm((prev) => ({
                                                    ...prev,
                                                    customer_address:
                                                        e.target.value,
                                                }))
                                            }
                                        />
                                    </label>
                                </div>

                                <div
                                    className="purchase-detail-total"
                                    style={{ marginTop: '18px' }}
                                >
                                    <span>Total Pembayaran</span>
                                    <strong>{formatRupiah(cartTotal)}</strong>
                                </div>

                                <div className="purchase-modal-footer">
                                    <button
                                        type="button"
                                        className="adm-btn-secondary"
                                        onClick={() => setCart([])}
                                        disabled={buying}
                                    >
                                        Kosongkan Keranjang
                                    </button>
                                    <button
                                        type="submit"
                                        className="adm-btn-primary"
                                        disabled={buying}
                                    >
                                        {buying
                                            ? 'Memproses...'
                                            : 'Checkout Sekarang'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}

                {/* MENU 3: PESANAN SAYA */}
                {activeMenu === 'orders' && (
                    <div className="adm-panel">
                        <div className="adm-toolbar">
                            <div className="adm-search">
                                <span>⌕</span>
                                <input
                                    type="search"
                                    placeholder="Cari kode pesanan atau nama produk..."
                                    value={orderSearch}
                                    onChange={(e) => {
                                        setOrderSearch(e.target.value);
                                        setOrderPage(1);
                                    }}
                                />
                            </div>

                            <select
                                className="adm-select"
                                value={orderStatusFilter}
                                onChange={(e) => {
                                    setOrderStatusFilter(e.target.value);
                                    setOrderPage(1);
                                }}
                            >
                                <option value="">Semua Status</option>
                                <option value="processing">Diproses</option>
                                <option value="completed">Selesai</option>
                                <option value="cancelled">Dibatalkan</option>
                            </select>
                        </div>

                        {pagedOrders.length === 0 ? (
                            <div className="adm-empty">
                                Belum ada riwayat pesanan.
                            </div>
                        ) : (
                            <>
                                <div className="adm-table-wrap">
                                    <table className="adm-table">
                                        <thead>
                                            <tr>
                                                <th>Kode Pesanan</th>
                                                <th>Waktu</th>
                                                <th>Produk</th>
                                                <th>Pembayaran</th>
                                                <th>Total</th>
                                                <th>Status</th>
                                                <th>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedOrders.map((ord) => (
                                                <tr key={ord.id}>
                                                    <td>
                                                        <strong>
                                                            {
                                                                ord.transaction_code
                                                            }
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {formatDateTime(
                                                            ord.transaction_date
                                                        )}
                                                    </td>
                                                    <td>
                                                        {(ord.items || []).map(
                                                            (it) => (
                                                                <div
                                                                    key={it.id}
                                                                >
                                                                    <strong>
                                                                        {
                                                                            it.product_name
                                                                        }{' '}
                                                                        ×{' '}
                                                                        {it.qty}
                                                                    </strong>
                                                                    <small>
                                                                        {transactionTypeLabel(
                                                                            it.transaction_type
                                                                        )}
                                                                    </small>
                                                                </div>
                                                            )
                                                        )}
                                                    </td>
                                                    <td>
                                                        {paymentLabel(
                                                            ord.payment_method
                                                        )}
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {formatRupiah(
                                                                ord.total_amount
                                                            )}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`adm-badge ${statusBadgeColor(
                                                                ord.status
                                                            )}`}
                                                        >
                                                            {statusLabel(
                                                                ord.status
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: '8px',
                                                                alignItems:
                                                                    'center',
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="adm-btn-icon"
                                                                onClick={() =>
                                                                    setSelectedOrder(
                                                                        ord
                                                                    )
                                                                }
                                                                title="Detail Pesanan"
                                                            >
                                                                ⌕
                                                            </button>

                                                            {[
                                                                'pending',
                                                                'processing',
                                                            ].includes(
                                                                ord.status
                                                            ) && (
                                                                <button
                                                                    type="button"
                                                                    className="adm-btn-danger adm-btn-sm"
                                                                    onClick={() =>
                                                                        handleCancelOrder(
                                                                            ord
                                                                        )
                                                                    }
                                                                >
                                                                    ✕ Batalkan
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {totalOrderPages > 1 && (
                                    <div className="adm-pagination">
                                        <span className="adm-pagination-info">
                                            Halaman {currentOrderPage} dari{' '}
                                            {totalOrderPages}
                                        </span>
                                        <div className="adm-pagination-btns">
                                            <button
                                                type="button"
                                                className="adm-btn-secondary adm-btn-sm"
                                                disabled={currentOrderPage <= 1}
                                                onClick={() =>
                                                    setOrderPage((p) =>
                                                        Math.max(1, p - 1)
                                                    )
                                                }
                                            >
                                                ‹ Sebelumnya
                                            </button>
                                            <button
                                                type="button"
                                                className="adm-btn-secondary adm-btn-sm"
                                                disabled={
                                                    currentOrderPage >=
                                                    totalOrderPages
                                                }
                                                onClick={() =>
                                                    setOrderPage((p) =>
                                                        Math.min(
                                                            totalOrderPages,
                                                            p + 1
                                                        )
                                                    )
                                                }
                                            >
                                                Selanjutnya ›
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* MENU 4: PROFIL SAYA */}
                {activeMenu === 'profile' && (
                    <div className="adm-panel">
                        <form
                            className="supplier-profile-form"
                            onSubmit={handleSaveProfile}
                        >
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
                                    />
                                </div>

                                <div className="supplier-form-group full-width">
                                    <label htmlFor="cust-address">
                                        Alamat Pengiriman
                                    </label>
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
                                    />
                                </div>
                            </div>

                            <div className="supplier-form-actions">
                                <button
                                    type="submit"
                                    className="adm-btn-primary"
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

                {/* MODAL BELI LANGSUNG 1 PRODUK */}
                {buyProduct && (
                    <div
                        className="purchase-modal-backdrop"
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget && !buying) {
                                setBuyProduct(null);
                            }
                        }}
                    >
                        <form
                            className="purchase-modal"
                            style={{ maxWidth: '500px' }}
                            onSubmit={handleDirectBuy}
                        >
                            <div className="purchase-modal-header">
                                <div>
                                    <h2>Beli {buyProduct.name}</h2>
                                    <p>
                                        Stok tersedia:{' '}
                                        {buyProduct.stock_content}{' '}
                                        {unitLabel(buyProduct.unit)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="purchase-close-btn"
                                    onClick={() => setBuyProduct(null)}
                                    disabled={buying}
                                >
                                    ×
                                </button>
                            </div>

                            <div
                                className="purchase-form-grid"
                                style={{ gridTemplateColumns: '1fr' }}
                            >
                                {buyProduct.uses_container && (
                                    <label>
                                        Jenis Pembelian
                                        <select
                                            value={buyForm.transaction_type}
                                            onChange={(e) =>
                                                setBuyForm((prev) => ({
                                                    ...prev,
                                                    transaction_type:
                                                        e.target.value,
                                                }))
                                            }
                                        >
                                            <option value="top_up">
                                                Isi Ulang / Tukar Wadah
                                            </option>
                                            <option value="new_deposit">
                                                Pinjam Wadah Baru (+Deposit{' '}
                                                {formatRupiah(
                                                    buyProduct.deposit_price
                                                )}
                                                )
                                            </option>
                                            <option value="buy_disconnect">
                                                Beli Putus
                                            </option>
                                        </select>
                                    </label>
                                )}

                                <label>
                                    Jumlah ({unitLabel(buyProduct.unit)})
                                    <input
                                        type="number"
                                        min="1"
                                        max={buyProduct.stock_content}
                                        value={buyForm.qty}
                                        onChange={(e) =>
                                            setBuyForm((prev) => ({
                                                ...prev,
                                                qty: e.target.value,
                                            }))
                                        }
                                        required
                                    />
                                </label>

                                <label>
                                    Metode Pembayaran
                                    <select
                                        value={buyForm.payment_method}
                                        onChange={(e) =>
                                            setBuyForm((prev) => ({
                                                ...prev,
                                                payment_method: e.target.value,
                                            }))
                                        }
                                    >
                                        <option value="cash">
                                            Tunai / COD
                                        </option>
                                        <option value="transfer">
                                            Transfer Bank
                                        </option>
                                        <option value="other">QRIS</option>
                                    </select>
                                </label>
                            </div>

                            <div
                                className="purchase-detail-total"
                                style={{ marginTop: '14px' }}
                            >
                                <span>Total Pembayaran</span>
                                <strong>
                                    {formatRupiah(
                                        Number(buyForm.qty || 1) * unitBuyPrice
                                    )}
                                </strong>
                            </div>

                            <div className="purchase-modal-footer">
                                <button
                                    type="button"
                                    className="adm-btn-secondary"
                                    onClick={() => setBuyProduct(null)}
                                    disabled={buying}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="adm-btn-primary"
                                    disabled={buying}
                                >
                                    {buying ? 'Memproses...' : 'Beli Sekarang'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* MODAL DETAIL PESANAN CUSTOMER */}
                {selectedOrder && (
                    <div
                        className="purchase-modal-backdrop"
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) {
                                setSelectedOrder(null);
                            }
                        }}
                    >
                        <div className="purchase-modal purchase-detail-modal">
                            <div className="purchase-modal-header">
                                <div>
                                    <h2>{selectedOrder.transaction_code}</h2>
                                    <p>
                                        {formatDateTime(
                                            selectedOrder.transaction_date
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="purchase-close-btn"
                                    onClick={() => setSelectedOrder(null)}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="purchase-detail-meta">
                                <div>
                                    <small>Pembayaran</small>
                                    <strong>
                                        {paymentLabel(
                                            selectedOrder.payment_method
                                        )}
                                    </strong>
                                </div>
                                <div>
                                    <small>Total</small>
                                    <strong>
                                        {formatRupiah(
                                            selectedOrder.total_amount
                                        )}
                                    </strong>
                                </div>
                                <div>
                                    <small>Status</small>
                                    <span
                                        className={`adm-badge ${statusBadgeColor(
                                            selectedOrder.status
                                        )}`}
                                    >
                                        {statusLabel(selectedOrder.status)}
                                    </span>
                                </div>
                            </div>

                            <div className="adm-table-wrap">
                                <table className="adm-table">
                                    <thead>
                                        <tr>
                                            <th>Produk</th>
                                            <th>Tipe</th>
                                            <th>Qty</th>
                                            <th>Harga</th>
                                            <th>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedOrder.items || []).map(
                                            (it) => (
                                                <tr key={it.id}>
                                                    <td>
                                                        <strong>
                                                            {it.product_name}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {transactionTypeLabel(
                                                            it.transaction_type
                                                        )}
                                                    </td>
                                                    <td>{it.qty}</td>
                                                    <td>
                                                        {formatRupiah(
                                                            it.unit_price
                                                        )}
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {formatRupiah(
                                                                it.subtotal
                                                            )}
                                                        </strong>
                                                    </td>
                                                </tr>
                                            )
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="purchase-modal-footer">
                                <button
                                    type="button"
                                    className="adm-btn-secondary"
                                    onClick={() => setSelectedOrder(null)}
                                >
                                    Tutup
                                </button>

                                {['pending', 'processing'].includes(
                                    selectedOrder.status
                                ) && (
                                    <button
                                        type="button"
                                        className="adm-btn-danger"
                                        onClick={() =>
                                            handleCancelOrder(selectedOrder)
                                        }
                                    >
                                        ✕ Batalkan Pesanan
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default CustomerDashboard;
