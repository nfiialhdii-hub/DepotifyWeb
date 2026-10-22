
import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/purchase.css';

const API = '/api/v1';

const emptyForm = () => ({
    vendor_id: '',
    payment_method: 'cash',
    shipping_address: '',
    notes: '',
});

const emptyItem = () => ({
    product_id: '',
    qty_ordered: '1',
});

function rupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

function statusLabel(status) {
    const labels = {
        draft: 'Pending',
        ordered: 'Pending',
        confirmed: 'Diproses',
        shipped: 'Dikirim Supplier',
        received: 'Selesai (Diterima)',
        rejected: 'Ditolak Supplier',
        cancelled: 'Batal',
    };

    return labels[status] || status || '-';
}

function statusBadgeClass(status) {
    if (['draft', 'ordered'].includes(status)) return 'status-ordered';
    if (status === 'confirmed') return 'status-confirmed';
    if (status === 'shipped') return 'status-shipped';
    if (status === 'received') return 'status-received';
    return 'status-cancelled';
}

function paymentMethodLabel(method) {
    const labels = {
        cash: 'Tunai',
        transfer: 'Transfer bank',
        qris: 'QRIS',
        credit: 'Tempo / Utang',
    };

    return labels[method] || method || '-';
}

function unwrapList(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.data)) return result.data.data;
    return [];
}

export default function Purchases() {
    const token = localStorage.getItem('depotify_token');

    const [orders, setOrders] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [products, setProducts] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [detail, setDetail] = useState(null);

    const [form, setForm] = useState(emptyForm);
    const [items, setItems] = useState([emptyItem()]);

    const headers = useMemo(() => ({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const request = useCallback(async (url, options = {}) => {
        if (!token) {
            throw new Error(
                'Token login tidak ditemukan. Silakan login kembali.'
            );
        }

        const response = await fetch(`${API}${url}`, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers || {}),
            },
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const firstValidation =
                result.errors && Object.values(result.errors)[0];

            throw new Error(
                (Array.isArray(firstValidation)
                    ? firstValidation[0]
                    : firstValidation) ||
                result.message ||
                'Permintaan gagal diproses.'
            );
        }

        return result;
    }, [headers, token]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const [orderResult, vendorResult, productResult] =
                await Promise.all([
                    request('/purchase-orders'),
                    request('/vendors'),
                    request('/products?scope=supplier'),
                ]);

            setOrders(unwrapList(orderResult));
            setVendors(unwrapList(vendorResult));
            setProducts(unwrapList(productResult));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [request]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Kunci scroll halaman utama saat modal dibuka.
    useEffect(() => {
        const modalOpen = showForm || Boolean(detail);
        if (!modalOpen) return;

        const previousOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [showForm, detail]);

    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            const query = search.trim().toLowerCase();

            const matchesSearch =
                !query ||
                [order.po_number, order.vendor?.name].some((value) =>
                    String(value || '').toLowerCase().includes(query)
                );

            const matchesStatus =
                !statusFilter ||
                (statusFilter === 'pending' &&
                    ['draft', 'ordered'].includes(order.status)) ||
                (statusFilter === 'diproses' &&
                    order.status === 'confirmed') ||
                (statusFilter === 'dikirim' &&
                    order.status === 'shipped') ||
                (statusFilter === 'selesai' &&
                    order.status === 'received') ||
                (statusFilter === 'dibatalkan' &&
                    ['cancelled', 'rejected'].includes(order.status));

            return matchesSearch && matchesStatus;
        });
    }, [orders, search, statusFilter]);

    const summary = useMemo(() => ({
        total: orders.length,
        process: orders.filter((item) =>
            ['ordered', 'confirmed', 'shipped'].includes(item.status)
        ).length,
        // Nilai pesanan baru dihitung setelah supplier memproses/konfirmasi.
        // Pesanan pending atau dibatalkan tidak masuk ke total nilai.
        value: orders
            .filter((item) =>
                ['confirmed', 'shipped', 'received'].includes(item.status)
            )
            .reduce(
                (sum, item) => sum + Number(item.total_price || 0),
                0
            ),
    }), [orders]);

    const updateForm = (event) => {
        const { name, value } = event.target;
        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));

        if (name === 'vendor_id') {
            setItems([emptyItem()]);
        }
    };

    const vendorProducts = useMemo(() => {
        if (!form.vendor_id) return [];
        return products.filter(
            (product) =>
                Number(product.vendor_id) === Number(form.vendor_id) &&
                product.is_active !== false
        );
    }, [products, form.vendor_id]);

    const updateItem = (index, key, value) => {
        setItems((previous) =>
            previous.map((item, i) =>
                i === index ? { ...item, [key]: value } : item
            )
        );
    };

    const selectedProduct = (id) => {
        return products.find(
            (product) => Number(product.id) === Number(id)
        );
    };

    // Harga satuan mengikuti harga produk dari katalog Supplier yang dipilih.
    const subtotal = items.reduce((sum, item) => {
        const product = selectedProduct(item.product_id);
        const price = Number(product?.selling_price || product?.purchase_price || 0);

        return sum + Number(item.qty_ordered || 0) * price;
    }, 0);

    const total = subtotal;

    const openCreate = () => {
        setError('');
        setSuccess('');
        setForm(emptyForm());
        setItems([emptyItem()]);
        setShowForm(true);
    };

    const submitOrder = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (!form.vendor_id) {
            setError('Pilih supplier terlebih dahulu.');
            return;
        }

        if (
            !items.length ||
            items.some(
                (item) =>
                    !item.product_id ||
                    Number(item.qty_ordered) < 1
            )
        ) {
            setError(
                'Pilih produk dan isi jumlah minimal 1 untuk setiap item.'
            );
            return;
        }

        setSaving(true);

        try {
            const result = await request('/purchase-orders', {
                method: 'POST',
                body: JSON.stringify({
                    vendor_id: Number(form.vendor_id),
                    payment_method: form.payment_method,
                    shipping_address: form.shipping_address || null,
                    notes: form.notes || null,
                    items: items.map((item) => ({
                        product_id: Number(item.product_id),
                        qty_ordered: Number(item.qty_ordered),
                    })),
                }),
            });

            setShowForm(false);

            setSuccess(
                `Purchase Order ${
                    result.po_number ||
                    result.data?.po_number ||
                    'baru'
                } berhasil dibuat dengan status Pending.`
            );

            await fetchData();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (order, status) => {
        setError('');
        setSuccess('');

        try {
            await request(`/purchase-orders/${order.id}`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });

            setSuccess(
                status === 'received'
                    ? `Barang untuk ${order.po_number} telah diterima! Stok produk di depot otomatis ditambahkan.`
                    : `Status ${order.po_number} diperbarui menjadi ${statusLabel(status)}.`
            );

            await fetchData();

            if (detail?.id === order.id) {
                const refreshed = await request(
                    `/purchase-orders/${order.id}`
                );

                setDetail(refreshed.data || refreshed);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const openDetail = async (order) => {
        setError('');

        try {
            const result = await request(
                `/purchase-orders/${order.id}`
            );

            setDetail(result.data || result);
        } catch (err) {
            setError(err.message);
        }
    };

    // Di sisi Owner:
    // - Saat status masih Pending (draft/ordered), Owner hanya bisa membatalkan pesanan.
    // - Konfirmasi, tolak, dan pengiriman dilakukan oleh Supplier di Dashboard Supplier.
    // - Saat Supplier sudah mengirim barang (shipped), Owner dapat klik Terima Barang.
    const allowedNext = (status) => ({
        draft: [
            { value: 'cancelled', label: 'Batalkan Pesanan' },
        ],
        ordered: [
            { value: 'cancelled', label: 'Batalkan Pesanan' },
        ],
        shipped: [
            { value: 'received', label: 'Terima Barang (Tambah Stok)' },
        ],
    }[status] || []);

    return (
        <section className="purchases-page">
            <div className="purchases-heading">
                <div>
                    <p className="purchases-eyebrow">
                        PENGADAAN BARANG
                    </p>
                    <h1>Pembelian</h1>
                    <p className="purchases-subtitle">
                        Kelola pesanan stok depot kepada supplier.
                    </p>
                </div>

                <button
                    className="purchase-primary-btn"
                    type="button"
                    onClick={openCreate}
                >
                    ＋ Buat Pembelian
                </button>
            </div>

            {error && (
                <div className="purchase-alert purchase-alert-error">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError('')}
                    >
                        ×
                    </button>
                </div>
            )}

            {success && (
                <div className="purchase-alert purchase-alert-success">
                    <span>{success}</span>
                    <button
                        type="button"
                        onClick={() => setSuccess('')}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="purchase-summary-grid">
                <article className="purchase-summary-card">
                    <span className="purchase-summary-icon">▤</span>
                    <div>
                        <p>Total Pesanan</p>
                        <strong>{summary.total}</strong>
                    </div>
                </article>

                <article className="purchase-summary-card">
                    <span className="purchase-summary-icon blue">⇄</span>
                    <div>
                        <p>Dalam Proses</p>
                        <strong>{summary.process}</strong>
                    </div>
                </article>

                <article className="purchase-summary-card">
                    <span className="purchase-summary-icon green">Rp</span>
                    <div>
                        <p>Nilai Pesanan</p>
                        <strong>{rupiah(summary.value)}</strong>
                    </div>
                </article>
            </div>

            <div className="purchase-list-card">
                <div className="purchase-list-heading">
                    <div>
                        <h2>Daftar Pembelian</h2>
                        <p>
                            Nomor pesanan, supplier, nilai, dan status
                            pengadaan.
                        </p>
                    </div>

                    <button
                        className="purchase-refresh-btn"
                        type="button"
                        onClick={fetchData}
                        title="Muat ulang"
                    >
                        ↻
                    </button>
                </div>

                <div className="purchase-toolbar">
                    <label className="purchase-search">
                        <span>⌕</span>
                        <input
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                            placeholder="Cari nomor PO atau supplier..."
                        />
                    </label>

                    <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        aria-label="Filter status pembelian"
                    >
                        <option value="">Semua Status</option>
                        <option value="pending">Pending</option>
                        <option value="diproses">Diproses</option>
                        <option value="dikirim">Dikirim Supplier</option>
                        <option value="selesai">Selesai (Diterima)</option>
                        <option value="dibatalkan">Dibatalkan / Ditolak</option>
                    </select>
                </div>

                {loading ? (
                    <div className="purchase-empty">
                        <span className="purchase-spinner" />
                        <p>Memuat data pembelian...</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="purchase-empty">
                        <span className="purchase-empty-icon">▤</span>
                        <strong>Belum ada pembelian</strong>
                        <p>
                            {search || statusFilter
                                ? 'Tidak ada pesanan yang sesuai dengan pencarian.'
                                : 'Buat Purchase Order pertama untuk mulai mencatat pesanan ke supplier.'}
                        </p>

                        {!search && (
                            <button
                                className="purchase-primary-btn"
                                type="button"
                                onClick={openCreate}
                            >
                                ＋ Buat Pembelian
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="purchase-table-wrap">
                        <table className="purchase-table">
                            <thead>
                                <tr>
                                    <th>Nomor PO</th>
                                    <th>Supplier</th>
                                    <th>Metode Pembayaran</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredOrders.map((order) => (
                                    <tr key={order.id}>
                                        <td>
                                            <strong className="purchase-po-number">
                                                {order.po_number || `PO-${order.id}`}
                                            </strong>
                                            <small>
                                                {order.items?.length || 0} item
                                            </small>
                                        </td>

                                        <td>
                                            <strong>
                                                {order.vendor?.name || '-'}
                                            </strong>
                                        </td>

                                        <td>
                                            {paymentMethodLabel(order.payment_method)}
                                        </td>

                                        <td>
                                            <strong>
                                                {rupiah(order.total_price)}
                                            </strong>
                                        </td>

                                        <td>
                                            <span
                                                className={`purchase-status ${statusBadgeClass(order.status)}`}
                                            >
                                                {statusLabel(order.status)}
                                            </span>
                                        </td>

                                        <td>
                                            <div className="purchase-row-actions">
                                                <button
                                                    type="button"
                                                    className="purchase-icon-btn"
                                                    onClick={() => openDetail(order)}
                                                    title="Detail"
                                                >
                                                    ⌕
                                                </button>

                                                {order.status === 'shipped' && (
                                                    <button
                                                        type="button"
                                                        className="purchase-primary-btn"
                                                        style={{
                                                            minHeight: '34px',
                                                            padding: '0 14px',
                                                            fontSize: '11.5px',
                                                        }}
                                                        onClick={() =>
                                                            changeStatus(
                                                                order,
                                                                'received'
                                                            )
                                                        }
                                                    >
                                                        ✓ Terima Barang
                                                    </button>
                                                )}

                                                {['draft', 'ordered'].includes(order.status) && (
                                                    <button
                                                        type="button"
                                                        className="purchase-danger-btn"
                                                        style={{
                                                            minHeight: '34px',
                                                            padding: '0 14px',
                                                            fontSize: '11.5px',
                                                        }}
                                                        onClick={() =>
                                                            changeStatus(
                                                                order,
                                                                'cancelled'
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
                )}
            </div>

            {showForm && (
                <div
                    className="purchase-modal-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !saving
                        ) {
                            setShowForm(false);
                        }
                    }}
                >
                    <form
                        className="purchase-modal purchase-create-modal"
                        onSubmit={submitOrder}
                    >
                        <div className="purchase-modal-header">
                            <div>
                                <p className="purchases-eyebrow">
                                    PURCHASE ORDER BARU
                                </p>
                                <h2>Buat Pembelian</h2>
                                <p>
                                    Catat barang yang akan dipesan dari supplier.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="purchase-close-btn"
                                onClick={() => setShowForm(false)}
                                disabled={saving}
                            >
                                ×
                            </button>
                        </div>

                        <div className="purchase-form-grid">
                            <label>
                                Supplier
                                <select
                                    name="vendor_id"
                                    value={form.vendor_id}
                                    onChange={updateForm}
                                    required
                                >
                                    <option value="">Pilih supplier</option>
                                    {vendors.map((vendor) => (
                                        <option
                                            key={vendor.id}
                                            value={vendor.id}
                                        >
                                            {vendor.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                Metode Pembayaran
                                <select
                                    name="payment_method"
                                    value={form.payment_method}
                                    onChange={updateForm}
                                    required
                                >
                                    <option value="cash">Tunai</option>
                                    <option value="transfer">Transfer bank</option>
                                    <option value="qris">QRIS</option>
                                    <option value="credit">Tempo / Utang</option>
                                </select>
                            </label>

                            <label className="purchase-form-full">
                                Alamat Pengiriman
                                <input
                                    name="shipping_address"
                                    value={form.shipping_address}
                                    onChange={updateForm}
                                    placeholder="Alamat tujuan barang"
                                />
                            </label>
                        </div>

                        <div className="purchase-items-heading">
                            <div>
                                <h3>Barang yang Dipesan dari Supplier</h3>
                                <p>
                                    {form.vendor_id
                                        ? vendorProducts.length > 0
                                            ? `Menampilkan ${vendorProducts.length} produk dari katalog supplier terpilih.`
                                            : 'Supplier ini belum menambahkan produk ke katalognya. Minta supplier menambahkan produk di menu Produk.'
                                        : 'Pilih supplier terlebih dahulu untuk menampilkan daftar produk yang dijual supplier tersebut.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                className="purchase-add-item"
                                disabled={!form.vendor_id || vendorProducts.length === 0}
                                onClick={() =>
                                    setItems((previous) => [
                                        ...previous,
                                        emptyItem(),
                                    ])
                                }
                            >
                                ＋ Tambah Barang
                            </button>
                        </div>

                        <div className="purchase-item-list">
                            {items.map((item, index) => {
                                const product = selectedProduct(item.product_id);

                                const price = Number(product?.selling_price || product?.purchase_price || 0);

                                return (
                                    <div
                                        className="purchase-item-row"
                                        key={index}
                                    >
                                        <label className="purchase-item-product">
                                            Produk Supplier
                                            <select
                                                value={item.product_id}
                                                disabled={!form.vendor_id}
                                                onChange={(event) =>
                                                    updateItem(
                                                        index,
                                                        'product_id',
                                                        event.target.value
                                                    )
                                                }
                                                required
                                            >
                                                <option value="">
                                                    {!form.vendor_id
                                                        ? 'Pilih supplier terlebih dahulu'
                                                        : vendorProducts.length === 0
                                                        ? 'Supplier belum memiliki produk'
                                                        : 'Pilih produk supplier'}
                                                </option>

                                                {vendorProducts.map((productOption) => (
                                                    <option
                                                        key={productOption.id}
                                                        value={productOption.id}
                                                    >
                                                        {productOption.name}
                                                        {productOption.variant
                                                            ? ` · ${productOption.variant}`
                                                            : ''}
                                                        {` (${rupiah(productOption.selling_price || productOption.purchase_price || 0)})`}
                                                    </option>
                                                ))}
                                            </select>

                                            {product && (
                                                <small>
                                                    Kategori: {product.category?.name || '-'}
                                                    {' · '}
                                                    SKU: {product.sku || '-'}
                                                    {' · '}
                                                    Stok supplier: {Number(product.stock_content ?? 0)}
                                                    {' · '}
                                                    Harga:{' '}
                                                    {rupiah(price)}
                                                </small>
                                            )}
                                        </label>

                                        <label>
                                            Jumlah
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={item.qty_ordered}
                                                onChange={(event) =>
                                                    updateItem(
                                                        index,
                                                        'qty_ordered',
                                                        event.target.value
                                                    )
                                                }
                                                required
                                            />
                                        </label>

                                        <label>
                                            Harga Satuan
                                            <input
                                                type="text"
                                                value={product ? rupiah(price) : 'Pilih produk'}
                                                readOnly
                                                aria-label="Harga satuan dari data produk"
                                            />
                                        </label>

                                        <div className="purchase-item-total">
                                            <small>Subtotal</small>
                                            <strong>
                                                {rupiah(
                                                    Number(item.qty_ordered || 0) *
                                                    price
                                                )}
                                            </strong>
                                        </div>

                                        {items.length > 1 && (
                                            <button
                                                type="button"
                                                className="purchase-remove-item"
                                                onClick={() =>
                                                    setItems((previous) =>
                                                        previous.filter(
                                                            (_, i) => i !== index
                                                        )
                                                    )
                                                }
                                                aria-label="Hapus item"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="purchase-bottom-grid">
                            <label>
                                Catatan
                                <textarea
                                    name="notes"
                                    value={form.notes}
                                    onChange={updateForm}
                                    rows="2"
                                    placeholder="Catatan tambahan untuk pesanan"
                                />
                            </label>

                            <div className="purchase-total-box">
                                <span>Total pembelian</span>
                                <strong>{rupiah(total)}</strong>
                                <small>Jumlah dihitung dari kuantitas × harga satuan produk.</small>
                            </div>
                        </div>

                        {vendors.length === 0 && (
                            <p className="purchase-inline-warning">
                                Belum ada data supplier. Tambahkan supplier
                                terlebih dahulu pada menu Supplier.
                            </p>
                        )}

                        {products.length === 0 && (
                            <p className="purchase-inline-warning">
                                Belum ada data produk untuk dipesan.
                            </p>
                        )}

                        <div className="purchase-modal-footer">
                            <button
                                type="button"
                                className="purchase-secondary-btn"
                                onClick={() => setShowForm(false)}
                                disabled={saving}
                            >
                                Batal
                            </button>

                            <button
                                type="submit"
                                className="purchase-primary-btn"
                                disabled={
                                    saving ||
                                    vendors.length === 0 ||
                                    products.length === 0
                                }
                            >
                                {saving
                                    ? 'Menyimpan...'
                                    : 'Simpan Pembelian'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {detail && (
                <div
                    className="purchase-modal-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setDetail(null);
                        }
                    }}
                >
                    <div className="purchase-modal purchase-detail-modal">
                        <div className="purchase-modal-header">
                            <div>
                                <p className="purchases-eyebrow">
                                    DETAIL PURCHASE ORDER
                                </p>
                                <h2>
                                    {detail.po_number || `PO-${detail.id}`}
                                </h2>
                                <p>
                                    {detail.vendor?.name ||
                                        'Supplier belum tersedia'}
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
                                <small>Metode Pembayaran</small>
                                <strong>{paymentMethodLabel(detail.payment_method)}</strong>
                            </div>

                            <div>
                                <small>Total Pembelian</small>
                                <strong>{rupiah(detail.total_price)}</strong>
                            </div>

                            <div>
                                <small>Status</small>
                                <span
                                    className={`purchase-status status-${detail.status}`}
                                >
                                    {statusLabel(detail.status)}
                                </span>
                            </div>
                        </div>

                        <div className="purchase-table-wrap">
                            <table className="purchase-table">
                                <thead>
                                    <tr>
                                        <th>Produk</th>
                                        <th>Jumlah</th>
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
                                                        item.product?.name ||
                                                        '-'}
                                                </strong>
                                                <small>
                                                    {item.product_description || ''}
                                                </small>
                                            </td>
                                            <td>{item.qty_ordered}</td>
                                            <td>{rupiah(item.agreed_price)}</td>
                                            <td>{rupiah(item.total_price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="purchase-detail-total">
                            <span>Total pembelian</span>
                            <strong>{rupiah(detail.total_price)}</strong>
                        </div>

                        {detail.notes && (
                            <p className="purchase-detail-notes">
                                <strong>Catatan:</strong> {detail.notes}
                            </p>
                        )}

                        <div className="purchase-modal-footer">
                            <button
                                type="button"
                                className="purchase-secondary-btn"
                                onClick={() => setDetail(null)}
                            >
                                Tutup
                            </button>

                            {allowedNext(detail.status).map((next) => (
                                <button
                                    key={next.value}
                                    type="button"
                                    className={
                                        next.value === 'cancelled' ||
                                        next.value === 'rejected'
                                            ? 'purchase-danger-btn'
                                            : 'purchase-primary-btn'
                                    }
                                    onClick={() =>
                                        changeStatus(detail, next.value)
                                    }
                                >
                                    {next.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
