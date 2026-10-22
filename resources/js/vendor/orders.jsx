import { useCallback, useEffect, useState } from 'react';
import {
    formatDate,
    formatPaymentMethod,
    formatRupiah,
    getStatusMeta,
    supplierApiRequest,
} from './helpers';

function VendorOrders({
    initialStatusFilter = '',
    refreshTrigger = 0,
    detailLoading = false,
    onOpenDetail,
}) {
    const [orders, setOrders] = useState([]);
    const [ordersMeta, setOrdersMeta] = useState({
        current_page: 1,
        last_page: 1,
        per_page: 10,
        total: 0,
        from: 0,
        to: 0,
    });
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setStatusFilter(initialStatusFilter || '');
        setCurrentPage(1);
    }, [initialStatusFilter]);

    const fetchSupplierOrders = useCallback(
        async ({
            page = currentPage,
            search = searchQuery,
            status = statusFilter,
        } = {}) => {
            setOrdersLoading(true);
            setOrdersError('');

            try {
                const params = new URLSearchParams();
                params.set('page', String(page));
                params.set('per_page', '10');

                if (search.trim() !== '') {
                    params.set('search', search.trim());
                }

                if (status) {
                    params.set('status', status);
                }

                const result = await supplierApiRequest(
                    `/purchase-orders?${params.toString()}`
                );

                const list = Array.isArray(result?.data) ? result.data : [];
                setOrders(list);
                setOrdersMeta({
                    current_page: result?.current_page || 1,
                    last_page: result?.last_page || 1,
                    per_page: result?.per_page || 10,
                    total: result?.total || list.length,
                    from: result?.from || (list.length > 0 ? 1 : 0),
                    to: result?.to || list.length,
                });
            } catch (err) {
                setOrdersError(
                    err.message || 'Gagal memuat daftar pesanan pembelian.'
                );
            } finally {
                setOrdersLoading(false);
            }
        },
        [currentPage, searchQuery, statusFilter]
    );

    useEffect(() => {
        fetchSupplierOrders({
            page: currentPage,
            search: searchQuery,
            status: statusFilter,
        });
    }, [currentPage, searchQuery, statusFilter, refreshTrigger, fetchSupplierOrders]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        setSearchQuery(searchInput);
    };

    return (
        <div className="supplier-panel">
            <div className="supplier-panel-header">
                <div className="supplier-panel-title">
                    <h2>Daftar Pesanan Pembelian (Purchase Orders)</h2>
                </div>

                <button
                    type="button"
                    className="supplier-btn supplier-btn-secondary"
                    onClick={() =>
                        fetchSupplierOrders({
                            page: currentPage,
                            search: searchQuery,
                            status: statusFilter,
                        })
                    }
                    disabled={ordersLoading}
                >
                    {ordersLoading ? 'Memuat...' : 'Segarkan Data'}
                </button>
            </div>

            {/* Toolbar Pencarian & Filter Status */}
            <div className="supplier-toolbar">
                <form
                    className="supplier-search-box"
                    onSubmit={handleSearchSubmit}
                >
                    <input
                        type="text"
                        className="supplier-search-input"
                        placeholder="Cari nomor PO, nama produk, atau catatan..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="supplier-btn supplier-btn-primary"
                    >
                        Cari
                    </button>
                    {(searchQuery || statusFilter) && (
                        <button
                            type="button"
                            className="supplier-btn supplier-btn-secondary"
                            onClick={() => {
                                setSearchInput('');
                                setSearchQuery('');
                                setStatusFilter('');
                                setCurrentPage(1);
                            }}
                        >
                            Reset
                        </button>
                    )}
                </form>

                <div className="supplier-filter-group">
                    <select
                        className="supplier-select"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                        aria-label="Filter status pesanan"
                    >
                        <option value="">Semua Status</option>
                        <option value="pending">Menunggu Konfirmasi</option>
                        <option value="processing">
                            Sedang Diproses (Dikonfirmasi / Dikirim)
                        </option>
                        <option value="confirmed">
                            Dikonfirmasi (Confirmed)
                        </option>
                        <option value="shipped">
                            Sedang Dikirim (Shipped)
                        </option>
                        <option value="received">
                            Selesai / Diterima (Received)
                        </option>
                        <option value="dibatalkan">Ditolak / Dibatalkan</option>
                    </select>
                </div>
            </div>

            {ordersError && (
                <div className="supplier-alert error" role="alert">
                    <span>{ordersError}</span>
                    <button
                        type="button"
                        className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                        onClick={() => fetchSupplierOrders()}
                    >
                        Coba Lagi
                    </button>
                </div>
            )}

            {ordersLoading ? (
                <div className="supplier-state-box">
                    <h3>Memuat daftar pesanan...</h3>
                    <p>
                        Sedang mengambil data Purchase Orders terbaru dari
                        server Depotify.
                    </p>
                </div>
            ) : orders.length === 0 ? (
                <div className="supplier-state-box">
                    <h3>Belum ada pesanan yang ditemukan</h3>
                    <p>
                        {searchQuery || statusFilter
                            ? 'Tidak ada pesanan pembelian yang cocok dengan kata kunci atau filter status yang dipilih.'
                            : 'Saat ini belum ada pesanan pembelian (Purchase Order) yang tercatat untuk akun supplier Anda.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="supplier-table-wrap">
                        <table className="supplier-table">
                            <thead>
                                <tr>
                                    <th>Nomor Pesanan</th>
                                    <th>Tanggal</th>
                                    <th>Pemesan / Depot</th>
                                    <th>Daftar Produk & Kuantitas</th>
                                    <th>Total Pesanan</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const statusMeta = getStatusMeta(
                                        order.status
                                    );
                                    const items = Array.isArray(order.items)
                                        ? order.items
                                        : [];
                                    const totalQty = items.reduce(
                                        (acc, item) =>
                                            acc +
                                            Number(item.qty_ordered || 0),
                                        0
                                    );

                                    return (
                                        <tr key={order.id}>
                                            <td>
                                                <span className="supplier-po-number">
                                                    {order.po_number}
                                                </span>
                                            </td>
                                            <td>{formatDate(order.po_date)}</td>
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
                                                        {items.length > 2 && (
                                                            <span className="supplier-subtext">
                                                                +
                                                                {items.length -
                                                                    2}{' '}
                                                                produk lainnya
                                                                (Total{' '}
                                                                {totalQty} item)
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="supplier-subtext">
                                                        Tidak ada rincian item
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
                                                <div className="supplier-action-group">
                                                    <button
                                                        type="button"
                                                        className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                                                        onClick={() =>
                                                            onOpenDetail(
                                                                order.id
                                                            )
                                                        }
                                                        disabled={detailLoading}
                                                    >
                                                        Detail Pesanan
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="supplier-pagination">
                        <span className="supplier-pagination-info">
                            Menampilkan {ordersMeta.from}–{ordersMeta.to} dari
                            total {ordersMeta.total} pesanan (Halaman{' '}
                            {ordersMeta.current_page} dari{' '}
                            {ordersMeta.last_page})
                        </span>

                        <div className="supplier-pagination-actions">
                            <button
                                type="button"
                                className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                                disabled={
                                    ordersMeta.current_page <= 1 ||
                                    ordersLoading
                                }
                                onClick={() =>
                                    setCurrentPage((prev) =>
                                        Math.max(1, prev - 1)
                                    )
                                }
                            >
                                ← Sebelumnya
                            </button>
                            <button
                                type="button"
                                className="supplier-btn supplier-btn-sm supplier-btn-secondary"
                                disabled={
                                    ordersMeta.current_page >=
                                        ordersMeta.last_page || ordersLoading
                                }
                                onClick={() =>
                                    setCurrentPage((prev) =>
                                        Math.min(
                                            ordersMeta.last_page,
                                            prev + 1
                                        )
                                    )
                                }
                            >
                                Berikutnya →
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default VendorOrders;
