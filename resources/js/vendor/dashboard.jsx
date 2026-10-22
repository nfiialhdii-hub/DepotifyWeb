import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/supplier.css';
import {
    formatDate,
    formatPaymentMethod,
    formatRupiah,
    getStatusMeta,
    supplierApiRequest,
} from './helpers';
import VendorOrders from './orders';
import VendorHistory from './history';
import VendorProfile from './profile';
import VendorProducts from './product';
import VendorCategory from './category';
import VendorStock from './stock';
import OrderDetailModal from './order-detail-modal';

function VendorDashboard({ user, onLogout }) {
    const [activeMenu, setActiveMenu] = useState('dashboard');
    const [presetStatusFilter, setPresetStatusFilter] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // State Ringkasan Dashboard
    const [dashboardData, setDashboardData] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');

    // State Nama/Profil Supplier untuk Header & Sidebar
    const [profileData, setProfileData] = useState(null);

    // State Modal Detail Pesanan & Aksi Status
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [orderNotesInput, setOrderNotesInput] = useState('');

    // Notifikasi Banner
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    const showFeedback = useCallback((type, message) => {
        setFeedback({ type, message });
    }, []);

    /**
     * Ambil data ringkasan Dashboard Supplier
     */
    const fetchSupplierDashboard = useCallback(async () => {
        setDashboardLoading(true);
        setDashboardError('');

        try {
            const result = await supplierApiRequest('/supplier/dashboard');
            setDashboardData(result?.data || null);
        } catch (err) {
            const isTimeout = err?.name === 'AbortError';
            setDashboardError(
                isTimeout
                    ? 'Permintaan data dashboard melebihi batas waktu.'
                    : err.message || 'Gagal memuat data dashboard supplier.'
            );
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    useEffect(() => {
        setFeedback({ type: '', message: '' });

        if (activeMenu === 'dashboard') {
            fetchSupplierDashboard();
        }
    }, [activeMenu, fetchSupplierDashboard]);

    /**
     * Buka detail pesanan dari backend GET /api/v1/purchase-orders/{id}
     */
    const handleOpenDetail = async (orderId) => {
        setDetailLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            const detail = await supplierApiRequest(
                `/purchase-orders/${orderId}`
            );
            setSelectedOrder(detail);
            setOrderNotesInput(detail?.notes || '');
        } catch (err) {
            showFeedback(
                'error',
                err.message || 'Gagal memuat detail pesanan pembelian.'
            );
        } finally {
            setDetailLoading(false);
        }
    };

    /**
     * Ubah status pesanan oleh Supplier melalui PUT /api/v1/purchase-orders/{id}
     */
    const handleUpdateOrderStatus = async (
        orderId,
        nextStatus,
        customNotes
    ) => {
        setStatusUpdating(true);
        setFeedback({ type: '', message: '' });

        try {
            const payload = { status: nextStatus };
            if (typeof customNotes === 'string') {
                payload.notes = customNotes;
            }

            const updated = await supplierApiRequest(
                `/purchase-orders/${orderId}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                }
            );

            const statusMeta = getStatusMeta(updated?.status || nextStatus);
            showFeedback(
                'success',
                `Status pesanan ${updated?.po_number || ''} berhasil diperbarui menjadi "${statusMeta.label}".`
            );

            if (selectedOrder && selectedOrder.id === orderId) {
                setSelectedOrder(updated);
                setOrderNotesInput(updated?.notes || '');
            }

            // Segarkan data dashboard dan trigger refresh tabel orders/history
            fetchSupplierDashboard();
            setRefreshTrigger((prev) => prev + 1);
        } catch (err) {
            showFeedback(
                'error',
                err.message || 'Gagal memperbarui status pesanan.'
            );
        } finally {
            setStatusUpdating(false);
        }
    };

    const handleMenuChange = (nextMenu, presetFilter = '') => {
        setActiveMenu(nextMenu);
        setPresetStatusFilter(presetFilter);
    };

    const summary = useMemo(
        () =>
            dashboardData?.summary || {
                total_orders: 0,
                pending_orders: 0,
                processing_orders: 0,
                completed_orders: 0,
                cancelled_orders: 0,
                total_order_value: 0,
            },
        [dashboardData]
    );

    const supplierDisplayName =
        profileData?.name ||
        dashboardData?.vendor?.name ||
        user?.vendor?.name ||
        user?.name ||
        'Mitra Supplier';

    const supplierInitial = supplierDisplayName.charAt(0).toUpperCase();

    /**
     * Render Konten Utama Ringkasan Dashboard
     */
    const renderOverviewSection = () => {
        if (dashboardLoading) {
            return (
                <div className="supplier-state-box">
                    <h3>Memuat ringkasan dashboard supplier...</h3>
                    <p>
                        Mengambil statistik pesanan dan daftar Purchase Order
                        terbaru dari server.
                    </p>
                </div>
            );
        }

        if (dashboardError) {
            return (
                <div className="supplier-alert error" role="alert">
                    <span>{dashboardError}</span>
                    <button
                        type="button"
                        className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                        onClick={fetchSupplierDashboard}
                    >
                        Muat Ulang
                    </button>
                </div>
            );
        }

        const recentOrders = Array.isArray(dashboardData?.recent_orders)
            ? dashboardData.recent_orders
            : [];

        return (
            <>
                {/* 4 Kartu Statistik Utama */}
                <section className="supplier-stats-grid">
                    <article className="supplier-stat-card highlight">
                        <p className="supplier-stat-label">Pesanan Diterima</p>
                        <h2 className="supplier-stat-value">
                            {summary.total_orders}
                        </h2>
                    </article>

                    <article className="supplier-stat-card">
                        <p className="supplier-stat-label">
                            Menunggu Konfirmasi
                        </p>
                        <h2 className="supplier-stat-value">
                            {summary.pending_orders}
                        </h2>
                    </article>

                    <article className="supplier-stat-card">
                        <p className="supplier-stat-label">Sedang Diproses</p>
                        <h2 className="supplier-stat-value">
                            {summary.processing_orders}
                        </h2>
                    </article>

                    <article className="supplier-stat-card">
                        <p className="supplier-stat-label">Pesanan Selesai</p>
                        <h2 className="supplier-stat-value">
                            {summary.completed_orders}
                        </h2>
                    </article>
                </section>

                {/* Daftar Pesanan Pembelian Terbaru */}
                <section className="supplier-panel">
                    <div className="supplier-panel-header">
                        <div className="supplier-panel-title">
                            <h2>Pesanan Pembelian Terbaru</h2>
                        </div>

                        <div className="supplier-action-group">
                            {summary.pending_orders > 0 && (
                                <button
                                    type="button"
                                    className="supplier-btn supplier-btn-success"
                                    onClick={() =>
                                        handleMenuChange('orders', 'pending')
                                    }
                                >
                                    Lihat Menunggu Konfirmasi (
                                    {summary.pending_orders})
                                </button>
                            )}
                            <button
                                type="button"
                                className="supplier-btn supplier-btn-primary"
                                onClick={() => handleMenuChange('orders', '')}
                            >
                                Lihat Semua Pesanan
                            </button>
                        </div>
                    </div>

                    {recentOrders.length === 0 ? (
                        <div className="supplier-state-box">
                            <h3>Belum ada pesanan pembelian</h3>
                            <p>
                                Pesanan pembelian dari Owner Depotify yang
                                ditujukan ke akun supplier Anda akan otomatis
                                muncul di halaman ini.
                            </p>
                        </div>
                    ) : (
                        <div className="supplier-table-wrap">
                            <table className="supplier-table">
                                <thead>
                                    <tr>
                                        <th>Nomor Pesanan</th>
                                        <th>Tanggal</th>
                                        <th>Pemesan / Depot</th>
                                        <th>Produk & Kuantitas</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentOrders.map((order) => {
                                        const statusMeta = getStatusMeta(
                                            order.status
                                        );
                                        const items = Array.isArray(order.items)
                                            ? order.items
                                            : [];

                                        return (
                                            <tr key={order.id}>
                                                <td>
                                                    <span className="supplier-po-number">
                                                        {order.po_number}
                                                    </span>
                                                </td>
                                                <td>
                                                    {formatDate(order.po_date)}
                                                </td>
                                                <td>
                                                    <strong>
                                                        {order.creator?.name ||
                                                            'Depotify Owner'}
                                                    </strong>
                                                </td>
                                                <td>
                                                    {items.length > 0 ? (
                                                        <div className="supplier-item-preview">
                                                            {items
                                                                .slice(0, 2)
                                                                .map((item) => (
                                                                    <span
                                                                        key={
                                                                            item.id ||
                                                                            `${order.id}-${item.product_id}`
                                                                        }
                                                                    >
                                                                        •{' '}
                                                                        {
                                                                            item.product_name
                                                                        }{' '}
                                                                        (
                                                                        <strong>
                                                                            {
                                                                                item.qty_ordered
                                                                            }
                                                                        </strong>
                                                                        )
                                                                    </span>
                                                                ))}
                                                            {items.length >
                                                                2 && (
                                                                <span className="supplier-subtext">
                                                                    +
                                                                    {items.length -
                                                                        2}{' '}
                                                                    produk
                                                                    lainnya
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="supplier-subtext">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <strong>
                                                        {formatRupiah(
                                                            order.total_price
                                                        )}
                                                    </strong>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`supplier-badge ${statusMeta.badgeClass}`}
                                                    >
                                                        {statusMeta.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                                                        onClick={() =>
                                                            handleOpenDetail(
                                                                order.id
                                                            )
                                                        }
                                                        disabled={detailLoading}
                                                    >
                                                        Detail Pesanan
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </>
        );
    };

    const navItems = [
        {
            id: 'dashboard',
            label: 'OVERVIEW',
            icon: '◐',
            badge: null,
        },
        {
            id: 'products',
            label: 'PRODUK',
            icon: '◈',
            badge: null,
        },
        {
            id: 'category',
            label: 'KATEGORI',
            icon: '❖',
            badge: null,
        },
        {
            id: 'stock',
            label: 'STOK',
            icon: '◫',
            badge: null,
        },
        {
            id: 'orders',
            label: 'PESANAN PO',
            icon: '▤',
            badge:
                summary.pending_orders > 0 ? summary.pending_orders : null,
        },
        {
            id: 'history',
            label: 'RIWAYAT',
            icon: '◷',
            badge: null,
        },
        {
            id: 'profile',
            label: 'PROFIL MITRA',
            icon: '⚙',
            badge: null,
        },
    ];

    return (
        <div className="supplier-layout">
            {/* SIDEBAR SUPPLIER - NEUMORPHIC REFERENCE STYLE */}
            <aside className="supplier-sidebar">
                <div className="supplier-brand">
                    <span>Depotify</span>
                </div>

                <div className="supplier-profile-slab">
                    <div className="supplier-avatar-ring">
                        <div className="supplier-avatar-core">
                            {supplierInitial}
                        </div>
                    </div>
                    <strong className="supplier-profile-name">
                        {supplierDisplayName}
                    </strong>
                    <span className="supplier-profile-id">
                        {user?.email || 'SUPPLIER PARTNER'}
                    </span>
                </div>

                <div className="supplier-sidebar-section">
                    <nav className="supplier-nav">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={
                                    activeMenu === item.id
                                        ? 'supplier-nav-item active'
                                        : 'supplier-nav-item'
                                }
                                onClick={() => handleMenuChange(item.id, '')}
                            >
                                <span className="supplier-nav-item-left">
                                    <span className="supplier-nav-icon">
                                        {item.icon}
                                    </span>
                                    <span>{item.label}</span>
                                </span>

                                {item.badge !== null && (
                                    <span className="supplier-nav-badge">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        ))}
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

            {/* MAIN CONTENT */}
            <main className="supplier-main">
                <header className="supplier-header">
                    <div>
                        <p className="supplier-eyebrow">
                            DASHBOARD
                        </p>
                        <h1>Halo, {supplierDisplayName}</h1>
                        <p>
                            Pantau pesanan pembelian dari Depotify, konfirmasi
                            ketersediaan barang, dan kelola pengiriman Anda.
                        </p>
                    </div>

                    <div className="supplier-user-card">
                        <div className="supplier-user-avatar">
                            {supplierInitial}
                        </div>
                        <div className="supplier-user-info">
                            <strong>{supplierDisplayName}</strong>
                            <span>
                                {user?.email || 'Akun Supplier Terverifikasi'}
                            </span>
                        </div>
                    </div>
                </header>

                {feedback.message && (
                    <div
                        className={`supplier-alert ${
                            feedback.type === 'error' ? 'error' : 'success'
                        }`}
                        role="status"
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

                {activeMenu === 'dashboard' && renderOverviewSection()}

                {activeMenu === 'products' && <VendorProducts />}

                {activeMenu === 'category' && <VendorCategory />}

                {activeMenu === 'stock' && <VendorStock />}

                {activeMenu === 'orders' && (
                    <VendorOrders
                        initialStatusFilter={presetStatusFilter}
                        refreshTrigger={refreshTrigger}
                        detailLoading={detailLoading}
                        onOpenDetail={handleOpenDetail}
                    />
                )}

                {activeMenu === 'history' && (
                    <VendorHistory
                        refreshTrigger={refreshTrigger}
                        detailLoading={detailLoading}
                        onOpenDetail={handleOpenDetail}
                    />
                )}

                {activeMenu === 'profile' && (
                    <VendorProfile
                        user={user}
                        onProfileUpdated={setProfileData}
                        onShowFeedback={showFeedback}
                    />
                )}
            </main>

            {/* MODAL DETAIL PESANAN PEMBELIAN */}
            <OrderDetailModal
                order={selectedOrder}
                notesInput={orderNotesInput}
                onNotesChange={setOrderNotesInput}
                statusUpdating={statusUpdating}
                onClose={() => setSelectedOrder(null)}
                onUpdateStatus={handleUpdateOrderStatus}
            />
        </div>
    );
}

export default VendorDashboard;
