import { useCallback, useEffect, useState } from 'react';
import '../../css/product.css';
import { formatRupiah, supplierApiRequest } from './helpers';

const EMPTY_FORM = {
    category_id: '',
    sku: '',
    name: '',
    variant: '',
    unit: 'gallon',
    selling_price: '',
    stock_content: '0',
    minimum_stock: '5',
    is_active: true,
};

function VendorProducts() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingProduct, setDeletingProduct] = useState(null);

    const [form, setForm] = useState(EMPTY_FORM);

    const [toast, setToast] = useState({
        show: false,
        type: 'success',
        message: '',
    });

    const showToast = useCallback((type, message) => {
        setToast({ show: true, type, message });
        setTimeout(() => {
            setToast((prev) => ({ ...prev, show: false }));
        }, 3000);
    }, []);

    const fetchCategories = useCallback(async () => {
        try {
            const result = await supplierApiRequest('/categories');
            setCategories(Array.isArray(result?.data) ? result.data : []);
        } catch (err) {
            console.error('SUPPLIER CATEGORY ERROR:', err);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            const params = new URLSearchParams();
            if (search.trim() !== '') {
                params.set('search', search.trim());
            }
            if (categoryFilter !== '') {
                params.set('category_id', categoryFilter);
            }

            const query = params.toString() ? `?${params.toString()}` : '';
            const result = await supplierApiRequest(`/products${query}`);

            setProducts(Array.isArray(result?.data) ? result.data : []);
        } catch (err) {
            setError(err.message || 'Gagal mengambil data produk supplier.');
        } finally {
            setLoading(false);
        }
    }, [search, categoryFilter]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 250);
        return () => clearTimeout(timer);
    }, [fetchProducts]);

    const openCreateModal = () => {
        setEditingProduct(null);
        setForm({
            ...EMPTY_FORM,
            category_id: categories[0]?.id ? String(categories[0].id) : '',
        });
        setShowForm(true);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setForm({
            category_id: product.category_id ? String(product.category_id) : '',
            sku: product.sku || '',
            name: product.name || '',
            variant: product.variant || '',
            unit: product.unit || 'gallon',
            selling_price: product.selling_price ?? '',
            stock_content: String(product.stock_content ?? 0),
            minimum_stock: String(product.minimum_stock ?? 0),
            is_active: Boolean(product.is_active),
        });
        setShowForm(true);
    };

    const closeModal = () => {
        if (saving) return;
        setShowForm(false);
        setEditingProduct(null);
        setForm(EMPTY_FORM);
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setSaving(true);
            setError('');

            const priceNum = Number(form.selling_price || 0);
            const payload = {
                category_id: Number(form.category_id),
                sku: form.sku.trim() === '' ? null : form.sku.trim(),
                name: form.name.trim(),
                variant:
                    form.variant.trim() === '' ? null : form.variant.trim(),
                unit: form.unit,
                selling_price: priceNum,
                purchase_price: priceNum,
                stock_content: Number(form.stock_content || 0),
                minimum_stock: Number(form.minimum_stock || 0),
                is_active: Boolean(form.is_active),
            };

            const endpoint = editingProduct
                ? `/products/${editingProduct.id}`
                : '/products';
            const method = editingProduct ? 'PUT' : 'POST';

            await supplierApiRequest(endpoint, {
                method,
                body: JSON.stringify(payload),
            });

            showToast(
                'success',
                editingProduct
                    ? 'Produk pasokan berhasil diperbarui.'
                    : 'Produk pasokan baru berhasil ditambahkan.'
            );

            closeModal();
            fetchProducts();
        } catch (err) {
            setError(err.message);
            showToast('error', err.message || 'Gagal menyimpan produk.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingProduct) return;

        try {
            setDeleting(true);
            await supplierApiRequest(`/products/${deletingProduct.id}`, {
                method: 'DELETE',
            });

            showToast('success', 'Produk berhasil dihapus.');
            setShowDeleteConfirm(false);
            setDeletingProduct(null);
            fetchProducts();
        } catch (err) {
            showToast('error', err.message || 'Gagal menghapus produk.');
        } finally {
            setDeleting(false);
        }
    };

    const unitLabel = (unit) => {
        const map = {
            gallon: 'Galon',
            canister: 'Tabung Gas',
            pcs: 'Pcs',
            other: 'Lainnya',
        };
        return map[unit] || unit || '-';
    };

    return (
        <div className="products-page">
            {toast.show && (
                <div className={`product-toast ${toast.type}`}>
                    <div className="toast-icon">
                        {toast.type === 'success' ? '✓' : '!'}
                    </div>
                    <div className="toast-content">
                        <strong>
                            {toast.type === 'success'
                                ? 'Berhasil'
                                : 'Terjadi Kesalahan'}
                        </strong>
                        <span>{toast.message}</span>
                    </div>
                    <button
                        type="button"
                        className="toast-close"
                        onClick={() =>
                            setToast((prev) => ({ ...prev, show: false }))
                        }
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="products-header">
                <div>
                    <p className="products-label">KATALOG PRODUK</p>
                    <h1>Produk yang Dijual </h1>
                    <p className="products-description">
                    </p>
                </div>

                <button
                    type="button"
                    className="add-product-button"
                    onClick={openCreateModal}
                >
                    + Tambah Produk Supplier
                </button>
            </div>

            {error && (
                <div className="products-error-top">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError('')}>
                        ×
                    </button>
                </div>
            )}

            <div className="products-toolbar">
                <input
                    type="text"
                    placeholder="Cari nama produk, atau SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="product-search"
                />

                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="product-filter"
                >
                    <option value="">Semua Kategori</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="products-card">
                {loading ? (
                    <div className="products-loading">
                        <div className="loading-spinner" />
                        <p>Memuat katalog produk supplier...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="empty-products">
                        <div className="empty-icon">💧</div>
                        <h3>Belum ada produk pasokan</h3>
                    </div>
                ) : (
                    <div className="products-table-wrapper">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Produk & Varian</th>
                                    <th>Kategori</th>
                                    <th>Satuan</th>
                                    <th>Harga (Satuan)</th>
                                    <th>Stok </th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.id}>
                                        <td>
                                            <span className="sku-text">
                                                {product.sku || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="product-name">
                                                <strong>{product.name}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            {product.category?.name || '-'}
                                        </td>
                                        <td>{unitLabel(product.unit)}</td>
                                        <td>
                                            <strong>
                                                {formatRupiah(
                                                    product.selling_price
                                                )}
                                            </strong>
                                        </td>
                                        <td>
                                            <span
                                                className={
                                                    Number(
                                                        product.stock_content
                                                    ) <=
                                                    Number(
                                                        product.minimum_stock
                                                    )
                                                        ? 'stock-badge low'
                                                        : 'stock-badge'
                                                }
                                            >
                                                {product.stock_content}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="product-actions">
                                                <button
                                                    type="button"
                                                    className="edit-button"
                                                    onClick={() =>
                                                        openEditModal(product)
                                                    }
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="delete-button"
                                                    onClick={() => {
                                                        setDeletingProduct(
                                                            product
                                                        );
                                                        setShowDeleteConfirm(
                                                            true
                                                        );
                                                    }}
                                                >
                                                    Hapus
                                                </button>
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
                <div className="product-modal-overlay" onClick={closeModal}>
                    <div
                        className="product-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="product-modal-header">
                            <div>
                                <p className="products-label">
                                    {editingProduct
                                        ? 'EDIT PRODUK '
                                        : 'TAMBAH PRODUK '}
                                </p>
                                <h2>
                                    {editingProduct
                                        ? 'Perbarui Produk '
                                        : 'Produk Baru'}
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={closeModal}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="product-form">
                            <div className="form-row">
                                <div className="form-field">
                                    <label>Kategori</label>
                                    <select
                                        name="category_id"
                                        value={form.category_id}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="">
                                            Pilih Kategori
                                        </option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label>Kode SKU</label>
                                    <input
                                        type="text"
                                        name="sku"
                                        placeholder="Contoh: SUP-MIN-19L"
                                        value={form.sku}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-field">
                                    <label>Nama Produk</label>
                                    <input
                                        type="text"
                                        name="name"
                                        placeholder="Contoh: Aqua, Le Minerale"
                                        value={form.name}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-field">
                                    <label>Varian / Ukuran</label>
                                    <input
                                        type="text"
                                        name="variant"
                                        placeholder="Contoh:  19L /  3 Kg"
                                        value={form.variant}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-field">
                                    <label>Satuan Barang</label>
                                    <select
                                        name="unit"
                                        value={form.unit}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="gallon">
                                            Galon
                                        </option>
                                        <option value="canister">
                                            Tabung Gas
                                        </option>
                                        <option value="pcs">Pcs</option>
                                        <option value="other">Lainnya</option>
                                    </select>
                                </div>

                                <div className="form-field">
                                    <label>
                                        Harga Jual ke Depot (Rp / Satuan)
                                    </label>
                                    <input
                                        type="number"
                                        name="selling_price"
                                        min="0"
                                        placeholder="Contoh: 15000"
                                        value={form.selling_price}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-field">
                                    <label>Stok Tersedia </label>
                                    <input
                                        type="number"
                                        name="stock_content"
                                        min="0"
                                        value={form.stock_content}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>

                                <div className="form-field">
                                    <label>Batas Stok Minimum</label>
                                    <input
                                        type="number"
                                        name="minimum_stock"
                                        min="0"
                                        value={form.minimum_stock}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="active-field">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={form.is_active}
                                        onChange={handleChange}
                                    />
                                    <span>
                                        Tampilkan produk ini
                                    </span>
                                </label>
                            </div>

                            <div className="product-form-actions">
                                <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={closeModal}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="save-button"
                                    disabled={saving || categories.length === 0}
                                >
                                    {saving ? (
                                        <>
                                            <span className="button-spinner" />
                                            Menyimpan...
                                        </>
                                    ) : editingProduct ? (
                                        'Simpan Perubahan'
                                    ) : (
                                        'Simpan Produk'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showDeleteConfirm && deletingProduct && (
                <div
                    className="delete-modal-overlay"
                    onClick={() => !deleting && setShowDeleteConfirm(false)}
                >
                    <div
                        className="delete-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="delete-modal-icon">🗑️</div>
                        <div className="delete-modal-content">
                            <h2>Hapus Produk Pasokan?</h2>
                            <p>
                                Anda yakin ingin menghapus produk{' '}
                                <strong>{deletingProduct.name}</strong>?
                            </p>
                            <span className="delete-warning">
                                Produk yang sudah pernah masuk ke transaksi PO
                                tidak dapat dihapus.
                            </span>
                        </div>
                        <div className="delete-modal-actions">
                            <button
                                type="button"
                                className="delete-cancel-button"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="delete-confirm-button"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default VendorProducts;
