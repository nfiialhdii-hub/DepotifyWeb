import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/admin-modules.css';
import { emitSessionInvalidated, fetchWithTimeout } from '../utils/session';

const ITEMS_PER_PAGE = 10;

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

function roleLabel(role) {
    const map = {
        owner: 'Owner',
        vendor: 'Supplier',
        customer: 'Customer',
    };
    return map[role] || role || 'Sistem';
}

function roleBadgeColor(role) {
    if (role === 'owner') return 'green';
    if (role === 'vendor') return 'blue';
    return 'amber';
}

function moduleLabel(module) {
    const map = {
        auth: 'Autentikasi',
        purchase_order: 'Pembelian (PO)',
        sales_transaction: 'Transaksi Customer',
        stock: 'Stok',
        product: 'Produk',
        category: 'Kategori',
        vendor: 'Supplier',
    };
    return map[module] || module || '-';
}

function actionBadge(actionType) {
    switch (actionType) {
        case 'login':
            return { label: 'Login', color: 'green' };
        case 'logout':
            return { label: 'Logout', color: 'red' };
        case 'register':
            return { label: 'Registrasi', color: 'blue' };
        case 'create':
            return { label: 'Tambah', color: 'green' };
        case 'status_change':
            return { label: 'Status', color: 'blue' };
        case 'update':
            return { label: 'Update', color: 'amber' };
        case 'delete':
            return { label: 'Hapus', color: 'red' };
        default:
            return { label: actionType || 'Aksi', color: 'blue' };
    }
}

export default function ActivityHistory() {
    // Slide aktif: 'sessions' | 'logs'
    const [activeSlide, setActiveSlide] = useState('sessions');
    const [sessionPage, setSessionPage] = useState(1);
    const [logPage, setLogPage] = useState(1);

    const [data, setData] = useState({
        summary: {
            total_logs: 0,
            login_count: 0,
            transaction_actions: 0,
            active_sessions_count: 0,
        },
        recent_sessions: [],
        logs: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');

    const fetchHistory = useCallback(async () => {
        const token = localStorage.getItem('depotify_token');
        if (!token) {
            emitSessionInvalidated(
                'missing_token',
                'Token login tidak ditemukan. Silakan login kembali.'
            );
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetchWithTimeout(
                '/api/v1/activity-logs',
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                },
                20000
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
                    result?.message || 'Gagal memuat riwayat akun.'
                );
            }

            setData(
                result?.data || {
                    summary: {
                        total_logs: 0,
                        login_count: 0,
                        transaction_actions: 0,
                        active_sessions_count: 0,
                    },
                    recent_sessions: [],
                    logs: [],
                }
            );
        } catch (err) {
            setError(err.message || 'Gagal mengambil data riwayat.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const filteredSessions = useMemo(() => {
        return (data.recent_sessions || []).filter((ses) => {
            const q = search.trim().toLowerCase();
            const matchesSearch =
                !q ||
                [ses.user_name, ses.user_email].some((v) =>
                    String(v || '')
                        .toLowerCase()
                        .includes(q)
                );
            const matchesRole = !roleFilter || ses.user_role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [data.recent_sessions, search, roleFilter]);

    const filteredLogs = useMemo(() => {
        return (data.logs || []).filter((log) => {
            const q = search.trim().toLowerCase();
            const matchesSearch =
                !q ||
                [
                    log.user_name,
                    log.user_email,
                    log.description,
                    log.module,
                ].some((v) =>
                    String(v || '')
                        .toLowerCase()
                        .includes(q)
                );

            const matchesRole = !roleFilter || log.user_role === roleFilter;

            const matchesAction =
                !actionFilter ||
                (actionFilter === 'auth' &&
                    ['login', 'logout', 'register'].includes(
                        log.action_type
                    )) ||
                log.action_type === actionFilter;

            return matchesSearch && matchesRole && matchesAction;
        });
    }, [data.logs, search, roleFilter, actionFilter]);

    const summary = data.summary || {};

    // Pagination Sesi Login (10 per halaman)
    const totalSessionPages = Math.max(
        1,
        Math.ceil(filteredSessions.length / ITEMS_PER_PAGE)
    );
    const currentSessionPage = Math.min(sessionPage, totalSessionPages);
    const pagedSessions = filteredSessions.slice(
        (currentSessionPage - 1) * ITEMS_PER_PAGE,
        currentSessionPage * ITEMS_PER_PAGE
    );

    // Pagination Audit Aktivitas (10 per halaman)
    const totalLogPages = Math.max(
        1,
        Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
    );
    const currentLogPage = Math.min(logPage, totalLogPages);
    const pagedLogs = filteredLogs.slice(
        (currentLogPage - 1) * ITEMS_PER_PAGE,
        currentLogPage * ITEMS_PER_PAGE
    );

    return (
        <section className="adm-page">
            <div className="adm-header">
                <div className="adm-header-title">
                    <h1>Riwayat Akun</h1>
                </div>

                <div className="adm-header-actions">
                    <button
                        type="button"
                        className="adm-btn-secondary"
                        onClick={fetchHistory}
                        disabled={loading}
                    >
                        ↻ Segarkan
                    </button>
                </div>
            </div>

            {/* RINGKASAN METRIK */}
            <div className="adm-metrics-grid">
                <div className="adm-metric-card">
                    <span className="adm-metric-label">Total Aktivitas</span>
                    <strong className="adm-metric-value">
                        {summary.total_logs || 0}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">Riwayat Login</span>
                    <strong className="adm-metric-value blue">
                        {summary.login_count || 0}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">
                        Transaksi & Stok
                    </span>
                    <strong className="adm-metric-value green">
                        {summary.transaction_actions || 0}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">Sesi Aktif</span>
                    <strong className="adm-metric-value green">
                        {summary.active_sessions_count || 0}
                    </strong>
                </div>
            </div>

            {error && (
                <div className="adm-panel" style={{ color: '#dc2626' }}>
                    {error}
                </div>
            )}

            {/* PANEL UTAMA DENGAN SLIDE SWITCHER */}
            <div className="adm-panel">
                <div className="adm-panel-head">
                    <div className="adm-tabs">
                        <button
                            type="button"
                            className={`adm-tab-btn ${
                                activeSlide === 'sessions' ? 'active' : ''
                            }`}
                            onClick={() => setActiveSlide('sessions')}
                        >
                            Sesi Login ({filteredSessions.length})
                        </button>
                        <button
                            type="button"
                            className={`adm-tab-btn ${
                                activeSlide === 'logs' ? 'active' : ''
                            }`}
                            onClick={() => setActiveSlide('logs')}
                        >
                            Audit Aktivitas ({filteredLogs.length})
                        </button>
                    </div>
                </div>

                <div className="adm-toolbar">
                    <div className="adm-search">
                        <span>⌕</span>
                        <input
                            type="search"
                            placeholder="Cari nama akun, email, atau aktivitas..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setSessionPage(1);
                                setLogPage(1);
                            }}
                        />
                    </div>

                    <select
                        className="adm-select"
                        value={roleFilter}
                        onChange={(e) => {
                            setRoleFilter(e.target.value);
                            setSessionPage(1);
                            setLogPage(1);
                        }}
                    >
                        <option value="">Semua Role</option>
                        <option value="owner">Owner</option>
                        <option value="vendor">Supplier</option>
                        <option value="customer">Customer</option>
                    </select>

                    {activeSlide === 'logs' && (
                        <select
                            className="adm-select"
                            value={actionFilter}
                            onChange={(e) => {
                                setActionFilter(e.target.value);
                                setLogPage(1);
                            }}
                        >
                            <option value="">Semua Jenis</option>
                            <option value="auth">Login / Logout</option>
                            <option value="create">Tambah Data</option>
                            <option value="status_change">Ubah Status</option>
                            <option value="update">Update Stok / Data</option>
                        </select>
                    )}
                </div>

                {loading ? (
                    <div className="adm-empty">Memuat riwayat...</div>
                ) : activeSlide === 'sessions' ? (
                    /* SLIDE 1: SESI LOGIN (10 DATA PER SLIDE) */
                    pagedSessions.length === 0 ? (
                        <div className="adm-empty">
                            Tidak ada data sesi login.
                        </div>
                    ) : (
                        <>
                            <div className="adm-table-wrap">
                                <table className="adm-table">
                                    <thead>
                                        <tr>
                                            <th>Akun</th>
                                            <th>Role</th>
                                            <th>Waktu Login</th>
                                            <th>Terakhir Aktif</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedSessions.map((ses) => (
                                            <tr key={ses.id}>
                                                <td>
                                                    <strong>
                                                        {ses.user_name}
                                                    </strong>
                                                    <small>
                                                        {ses.user_email}
                                                    </small>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`adm-badge ${roleBadgeColor(ses.user_role)}`}
                                                    >
                                                        {roleLabel(
                                                            ses.user_role
                                                        )}
                                                    </span>
                                                </td>
                                                <td>
                                                    {formatDateTime(
                                                        ses.login_at
                                                    )}
                                                </td>
                                                <td>
                                                    {formatDateTime(
                                                        ses.last_used_at
                                                    )}
                                                </td>
                                                <td>
                                                    <span
                                                        className={`adm-badge ${
                                                            ses.is_active_session
                                                                ? 'green'
                                                                : 'red'
                                                        }`}
                                                    >
                                                        {ses.is_active_session
                                                            ? 'Aktif'
                                                            : 'Berakhir'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="adm-pagination">
                                <span className="adm-pagination-info">
                                    Menampilkan {pagedSessions.length} dari{' '}
                                    {filteredSessions.length} sesi (Slide{' '}
                                    {currentSessionPage} / {totalSessionPages})
                                </span>
                                <div className="adm-pagination-btns">
                                    <button
                                        type="button"
                                        className="adm-btn-secondary adm-btn-sm"
                                        disabled={currentSessionPage <= 1}
                                        onClick={() =>
                                            setSessionPage((p) =>
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
                                            currentSessionPage >=
                                            totalSessionPages
                                        }
                                        onClick={() =>
                                            setSessionPage((p) =>
                                                Math.min(
                                                    totalSessionPages,
                                                    p + 1
                                                )
                                            )
                                        }
                                    >
                                        Selanjutnya ›
                                    </button>
                                </div>
                            </div>
                        </>
                    )
                ) : /* SLIDE 2: AUDIT AKTIVITAS (10 DATA PER SLIDE) */
                pagedLogs.length === 0 ? (
                    <div className="adm-empty">
                        Tidak ada riwayat aktivitas.
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr>
                                        <th>Waktu</th>
                                        <th>Akun</th>
                                        <th>Role</th>
                                        <th>Aksi</th>
                                        <th>Modul</th>
                                        <th>Aktivitas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedLogs.map((log) => {
                                        const badge = actionBadge(
                                            log.action_type
                                        );
                                        return (
                                            <tr key={log.id}>
                                                <td>
                                                    {formatDateTime(
                                                        log.created_at
                                                    )}
                                                </td>
                                                <td>
                                                    <strong>
                                                        {log.user_name ||
                                                            'Sistem'}
                                                    </strong>
                                                    <small>
                                                        {log.user_email || '-'}
                                                    </small>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`adm-badge ${roleBadgeColor(log.user_role)}`}
                                                    >
                                                        {roleLabel(
                                                            log.user_role
                                                        )}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`adm-badge ${badge.color}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <strong>
                                                        {moduleLabel(
                                                            log.module
                                                        )}
                                                    </strong>
                                                </td>
                                                <td>{log.description}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="adm-pagination">
                            <span className="adm-pagination-info">
                                Menampilkan {pagedLogs.length} dari{' '}
                                {filteredLogs.length} aktivitas (Slide{' '}
                                {currentLogPage} / {totalLogPages})
                            </span>
                            <div className="adm-pagination-btns">
                                <button
                                    type="button"
                                    className="adm-btn-secondary adm-btn-sm"
                                    disabled={currentLogPage <= 1}
                                    onClick={() =>
                                        setLogPage((p) => Math.max(1, p - 1))
                                    }
                                >
                                    ‹ Sebelumnya
                                </button>
                                <button
                                    type="button"
                                    className="adm-btn-secondary adm-btn-sm"
                                    disabled={currentLogPage >= totalLogPages}
                                    onClick={() =>
                                        setLogPage((p) =>
                                            Math.min(totalLogPages, p + 1)
                                        )
                                    }
                                >
                                    Selanjutnya ›
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
