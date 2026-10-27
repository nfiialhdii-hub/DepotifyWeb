import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/admin-modules.css';
import '../../css/purchase.css';
import { emitSessionInvalidated, fetchWithTimeout } from '../utils/session';

const API = '/api/v1';
const ITEMS_PER_PAGE = 10;

function rupiah(value) {
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

function statusLabel(status) {
    const map = {
        completed: 'Selesai',
        processing: 'Diproses',
        cancelled: 'Dibatalkan',
    };
    return map[status] || status || '-';
}

function statusBadgeColor(status) {
    if (status === 'completed') return 'green';
    if (status === 'processing') return 'blue';
    return 'red';
}

function paymentLabel(method) {
    const map = {
        cash: 'Tunai',
        transfer: 'Transfer',
        other: 'QRIS',
    };
    return map[method] || method || '-';
}

function transactionTypeLabel(type) {
    const map = {
        top_up: 'Isi Ulang',
        new_deposit: 'Pinjam Wadah',
        buy_disconnect: 'Beli Putus',
    };
    return map[type] || type || '-';
}

function unwrapList(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.data)) return result.data.data;
    return [];
}

export default function Transactions() {
    const token = localStorage.getItem('depotify_token');

    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({
        total: 0,
        completed: 0,
        processing: 0,
        cancelled: 0,
        total_revenue: 0,
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState(null);

    const headers = useMemo(
        () => ({
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        }),
        [token]
    );

    const request = useCallback(
        async (url, options = {}) => {
            if (!token) {
                emitSessionInvalidated(
                    'missing_token',
                    'Token login tidak ditemukan. Silakan login kembali.'
                );
                throw new Error('Token login tidak ditemukan.');
            }

            const response = await fetchWithTimeout(
                `${API}${url}`,
                {
                    ...options,
                    headers: {
                        ...headers,
                        ...(options.headers || {}),
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
                throw new Error('Sesi berakhir.');
            }

            if (!response.ok) {
                throw new Error(
                    result.message || 'Permintaan gagal diproses.'
                );
            }

            return result;
        },
        [headers, token]
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const salesRes = await request('/sales?per_page=100');
            setTransactions(unwrapList(salesRes));
            if (salesRes?.summary) {
                setSummary(salesRes.summary);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [request]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter((tx) => {
            const q = search.trim().toLowerCase();
            const custName =
                tx.customer?.name || tx.creator?.name || 'Customer';
            const itemNames = (tx.items || [])
                .map((i) => i.product_name || i.product?.name || '')
                .join(' ');

            const matchesSearch =
                !q ||
                [tx.transaction_code, custName, itemNames].some((val) =>
                    String(val || '')
                        .toLowerCase()
                        .includes(q)
                );

            const matchesStatus = !statusFilter || tx.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [transactions, search, statusFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
    );
    const currentPage = Math.min(page, totalPages);
    const pagedTransactions = filteredTransactions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handleChangeStatus = async (tx, nextStatus) => {
        setError('');
        setSuccess('');

        try {
            const res = await request(`/sales/${tx.id}`, {
                method: 'PUT',
                body: JSON.stringify({ status: nextStatus }),
            });

            setSuccess(
                res?.message ||
                    `Status transaksi ${tx.transaction_code} diperbarui.`
            );

            await fetchData();
            if (detail && detail.id === tx.id) {
                setDetail(res?.data || null);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <section className="adm-page">
            <div className="adm-header">
                <div className="adm-header-title">
                    <h1>Riwayat Transaksi</h1>
                </div>

                <div className="adm-header-actions">
                    <button
                        type="button"
                        className="adm-btn-secondary"
                        onClick={fetchData}
                        disabled={loading}
                    >
                        ↻ Segarkan
                    </button>
                </div>
            </div>

            {error && (
                <div className="purchase-alert purchase-alert-error">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError('')}>
                        ×
                    </button>
                </div>
            )}

            {success && (
                <div className="purchase-alert purchase-alert-success">
                    <span>{success}</span>
                    <button type="button" onClick={() => setSuccess('')}>
                        ×
                    </button>
                </div>
            )}

            {/* RINGKASAN METRIK */}
            <div className="adm-metrics-grid">
                <div className="adm-metric-card">
                    <span className="adm-metric-label">Total Transaksi</span>
                    <strong className="adm-metric-value">
                        {summary.total}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">Selesai</span>
                    <strong className="adm-metric-value green">
                        {summary.completed}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">Diproses</span>
                    <strong className="adm-metric-value blue">
                        {summary.processing}
                    </strong>
                </div>

                <div className="adm-metric-card">
                    <span className="adm-metric-label">Dibatalkan</span>
                    <strong className="adm-metric-value red">
                        {summary.cancelled}
                    </strong>
                </div>
            </div>

            {/* TABEL TRANSAKSI CUSTOMER */}
            <div className="adm-panel">
                <div className="adm-toolbar">
                    <div className="adm-search">
                        <span>⌕</span>
                        <input
                            type="search"
                            placeholder="Cari kode transaksi, customer, atau produk..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>

                    <select
                        className="adm-select"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">Semua Status</option>
                        <option value="completed">Selesai</option>
                        <option value="processing">Diproses</option>
                        <option value="cancelled">Dibatalkan</option>
                    </select>
                </div>

                {loading ? (
                    <div className="adm-empty">Memuat transaksi...</div>
                ) : pagedTransactions.length === 0 ? (
                    <div className="adm-empty">
                        Belum ada riwayat transaksi dari customer.
                    </div>
                ) : (
                    <>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr>
                                        <th>Kode</th>
                                        <th>Tanggal</th>
                                        <th>Customer</th>
                                        <th>Produk</th>
                                        <th>Pembayaran</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedTransactions.map((tx) => (
                                        <tr key={tx.id}>
                                            <td>
                                                <strong>
                                                    {tx.transaction_code}
                                                </strong>
                                            </td>
                                            <td>
                                                {formatDateTime(
                                                    tx.transaction_date
                                                )}
                                            </td>
                                            <td>
                                                <strong>
                                                    {tx.customer?.name ||
                                                        tx.creator?.name ||
                                                        'Customer'}
                                                </strong>
                                                {tx.customer?.phone && (
                                                    <small>
                                                        {tx.customer.phone}
                                                    </small>
                                                )}
                                            </td>
                                            <td>
                                                {(tx.items || []).map((item) => (
                                                    <div key={item.id}>
                                                        <strong>
                                                            {item.product_name ||
                                                                item.product
                                                                    ?.name}{' '}
                                                            × {item.qty}
                                                        </strong>
                                                        <small>
                                                            {transactionTypeLabel(
                                                                item.transaction_type
                                                            )}
                                                        </small>
                                                    </div>
                                                ))}
                                            </td>
                                            <td>
                                                {paymentLabel(
                                                    tx.payment_method
                                                )}
                                            </td>
                                            <td>
                                                <strong>
                                                    {rupiah(tx.total_amount)}
                                                </strong>
                                            </td>
                                            <td>
                                                <span
                                                    className={`adm-badge ${statusBadgeColor(tx.status)}`}
                                                >
                                                    {statusLabel(tx.status)}
                                                </span>
                                            </td>
                                            <td>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        gap: '8px',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="adm-btn-icon"
                                                        onClick={() =>
                                                            setDetail(tx)
                                                        }
                                                        title="Detail"
                                                    >
                                                        ⌕
                                                    </button>

                                                    {tx.status ===
                                                        'processing' && (
                                                        <button
                                                            type="button"
                                                            className="adm-btn-primary adm-btn-sm"
                                                            onClick={() =>
                                                                handleChangeStatus(
                                                                    tx,
                                                                    'completed'
                                                                )
                                                            }
                                                        >
                                                            ✓ Selesai
                                                        </button>
                                                    )}

                                                    {tx.status !==
                                                        'cancelled' && (
                                                        <button
                                                            type="button"
                                                            className="adm-btn-danger adm-btn-sm"
                                                            onClick={() =>
                                                                handleChangeStatus(
                                                                    tx,
                                                                    'cancelled'
                                                                )
                                                            }
                                                        >
                                                            ✕ Batal
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="adm-pagination">
                                <span className="adm-pagination-info">
                                    Halaman {currentPage} dari {totalPages}
                                </span>
                                <div className="adm-pagination-btns">
                                    <button
                                        type="button"
                                        className="adm-btn-secondary adm-btn-sm"
                                        disabled={currentPage <= 1}
                                        onClick={() =>
                                            setPage((p) => Math.max(1, p - 1))
                                        }
                                    >
                                        ‹ Sebelumnya
                                    </button>
                                    <button
                                        type="button"
                                        className="adm-btn-secondary adm-btn-sm"
                                        disabled={currentPage >= totalPages}
                                        onClick={() =>
                                            setPage((p) =>
                                                Math.min(totalPages, p + 1)
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

            {/* MODAL DETAIL */}
            {detail && (
                <div
                    className="purchase-modal-backdrop"
                    role="presentation"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) {
                            setDetail(null);
                        }
                    }}
                >
                    <div className="purchase-modal purchase-detail-modal">
                        <div className="purchase-modal-header">
                            <div>
                                <h2>{detail.transaction_code}</h2>
                                <p>
                                    {detail.customer?.name ||
                                        detail.creator?.name ||
                                        'Customer'}{' '}
                                    · {formatDateTime(detail.transaction_date)}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="purchase-close-btn"
                                onClick={() => setDetail(null)}
                            >
                                ×
                            </button>
                        </div>

                        <div className="purchase-detail-meta">
                            <div>
                                <small>Pembayaran</small>
                                <strong>
                                    {paymentLabel(detail.payment_method)}
                                </strong>
                            </div>
                            <div>
                                <small>Total</small>
                                <strong>{rupiah(detail.total_amount)}</strong>
                            </div>
                            <div>
                                <small>Status</small>
                                <span
                                    className={`adm-badge ${statusBadgeColor(detail.status)}`}
                                >
                                    {statusLabel(detail.status)}
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
                                    {(detail.items || []).map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <strong>
                                                    {item.product_name ||
                                                        item.product?.name}
                                                </strong>
                                            </td>
                                            <td>
                                                {transactionTypeLabel(
                                                    item.transaction_type
                                                )}
                                            </td>
                                            <td>{item.qty}</td>
                                            <td>{rupiah(item.unit_price)}</td>
                                            <td>
                                                <strong>
                                                    {rupiah(item.subtotal)}
                                                </strong>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="purchase-modal-footer">
                            <button
                                type="button"
                                className="adm-btn-secondary"
                                onClick={() => setDetail(null)}
                            >
                                Tutup
                            </button>

                            {detail.status === 'processing' && (
                                <button
                                    type="button"
                                    className="adm-btn-primary"
                                    onClick={() =>
                                        handleChangeStatus(detail, 'completed')
                                    }
                                >
                                    ✓ Tandai Selesai
                                </button>
                            )}

                            {detail.status !== 'cancelled' && (
                                <button
                                    type="button"
                                    className="adm-btn-danger"
                                    onClick={() =>
                                        handleChangeStatus(detail, 'cancelled')
                                    }
                                >
                                    ✕ Batalkan
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
