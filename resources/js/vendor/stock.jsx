import { useCallback, useEffect, useMemo, useState } from 'react';
import '../../css/stock.css';
import '../../css/product.css';
import { supplierApiRequest } from './helpers';

function VendorStock() {
    const [stocks, setStocks] = useState([]);
    const [summary, setSummary] = useState({
        total_products: 0,
        total_stock_content: 0,
        total_empty_stock: 0,
        low_stock_products: 0,
    });

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal Atur Stok Gudang Supplier
    const [editingItem, setEditingItem] = useState(null);
    const [stockForm, setStockForm] = useState({
        stock_content: '0',
        empty_stock: '0',
        minimum_stock: '0',
        notes: '',
    });
    const [savingStock, setSavingStock] = useState(false);

    const fetchStocks = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            const result = await supplierApiRequest('/stock');

            setStocks(result?.data?.products || []);
            setSummary(
                result?.data?.summary || {
                    total_products: 0,
                    total_stock_content: 0,
                    total_empty_stock: 0,
                    low_stock_products: 0,
                }
            );
        } catch (err) {
            setError(err.message || 'Gagal mengambil data stok supplier.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStocks();
    }, [fetchStocks]);

    const categories = useMemo(() => {
        return [
            ...new Set(stocks.map((stock) => stock.category).filter(Boolean)),
        ];
    }, [stocks]);

    const filteredStocks = useMemo(() => {
        return stocks.filter((stock) => {
            const keyword = search.toLowerCase();

            const matchesSearch =
                stock.name?.toLowerCase().includes(keyword) ||
                stock.sku?.toLowerCase().includes(keyword);

            const matchesCategory =
                !categoryFilter || stock.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });
    }, [stocks, search, categoryFilter]);

    const getStatusLabel = (status) => {
        switch (status) {
            case 'aman':
                return 'Aman';
            case 'menipis':
                return 'Menipis';
            case 'habis':
                return 'Habis';
            default:
                return '-';
        }
    };

    const openAdjustModal = (item) => {
        setEditingItem(item);
        setStockForm({
            stock_content: String(item.stock_content ?? 0),
            empty_stock: String(item.empty_stock ?? 0),
            minimum_stock: String(item.minimum_stock ?? 0),
            notes: '',
        });
    };

    const handleSaveStock = async (e) => {
        e.preventDefault();
        if (!editingItem) return;

        try {
            setSavingStock(true);
            setError('');

            await supplierApiRequest(`/stock/${editingItem.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    stock_content: Number(stockForm.stock_content || 0),
                    empty_stock: Number(stockForm.empty_stock || 0),
                    minimum_stock: Number(stockForm.minimum_stock || 0),
                    notes: stockForm.notes.trim() || null,
                }),
            });

            setEditingItem(null);
            fetchStocks();
        } catch (err) {
            setError(err.message || 'Gagal memperbarui stok gudang.');
        } finally {
            setSavingStock(false);
        }
    };

    if (loading) {
        return (
            <div className="stock-page">
                <div className="stock-loading">
                    Memuat data stok gudang supplier...
                </div>
            </div>
        );
    }

    return (
        <div className="stock-page">
            <div className="stock-header">
                <div>
                    <h1>Stok Gudang</h1>
                </div>
            </div>

            {error && <div className="stock-error">{error}</div>}

            <div className="stock-summary">
                <div className="stock-summary-card">
                    <span>Total Jenis Produk</span>
                    <strong>{summary.total_products}</strong>
                </div>

                <div className="stock-summary-card">
                    <span>Total Stok Siap Kirim</span>
                    <strong>{summary.total_stock_content}</strong>
                </div>

                <div className="stock-summary-card">
                    <span>Total Wadah Kosong</span>
                    <strong>{summary.total_empty_stock}</strong>
                </div>

                <div className="stock-summary-card">
                    <span>Stok Menipis / Habis</span>
                    <strong>{summary.low_stock_products}</strong>
                </div>
            </div>

            <div className="stock-content">
                <div className="stock-toolbar">
                    <input
                        type="text"
                        placeholder="Cari nama produk atau SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="">Semua Kategori</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="stock-table-wrapper">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Nama Produk</th>
                                <th>Kategori</th>
                                <th>Varian</th>
                                <th>Satuan</th>
                                <th>Stok Siap Kirim</th>
                                <th>Stok Minimum</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredStocks.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="stock-empty">
                                        Tidak ada data stok produk supplier.
                                    </td>
                                </tr>
                            ) : (
                                filteredStocks.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.sku || '-'}</td>
                                        <td>
                                            <strong>{item.name}</strong>
                                        </td>
                                        <td>{item.category || '-'}</td>
                                        <td>{item.variant || '-'}</td>
                                        <td>{item.unit}</td>
                                        <td>
                                            <strong>
                                                {item.stock_content}
                                            </strong>
                                        </td>
                                        <td>{item.minimum_stock}</td>
                                        <td>
                                            <span
                                                className={`stock-status stock-status-${item.status}`}
                                            >
                                                {getStatusLabel(item.status)}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="edit-button"
                                                onClick={() =>
                                                    openAdjustModal(item)
                                                }
                                            >
                                                Atur Stok
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {editingItem && (
                <div
                    className="product-modal-overlay"
                    onClick={() => !savingStock && setEditingItem(null)}
                >
                    <div
                        className="product-modal"
                        style={{ maxWidth: '500px' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="product-modal-header">
                            <div>
                                <p className="products-label">
                                    UPDATE STOK GUDANG SUPPLIER
                                </p>
                                <h2>{editingItem.name}</h2>
                                <p>
                                    Sesuaikan jumlah stok siap kirim di gudang
                                    supplier Anda.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setEditingItem(null)}
                            >
                                ×
                            </button>
                        </div>

                        <form
                            onSubmit={handleSaveStock}
                            className="product-form"
                        >
                            <div className="form-row">
                                <div className="form-field">
                                    <label>Stok Siap Kirim (Isi)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={stockForm.stock_content}
                                        onChange={(e) =>
                                            setStockForm((prev) => ({
                                                ...prev,
                                                stock_content: e.target.value,
                                            }))
                                        }
                                        required
                                    />
                                </div>

                                <div className="form-field">
                                    <label>Batas Stok Minimum</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={stockForm.minimum_stock}
                                        onChange={(e) =>
                                            setStockForm((prev) => ({
                                                ...prev,
                                                minimum_stock: e.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            </div>

                            <div className="form-field">
                                <label>Catatan Penyesuaian (Opsional)</label>
                                <input
                                    type="text"
                                    placeholder="Contoh: Tambahan produksi harian 50 galon"
                                    value={stockForm.notes}
                                    onChange={(e) =>
                                        setStockForm((prev) => ({
                                            ...prev,
                                            notes: e.target.value,
                                        }))
                                    }
                                />
                            </div>

                            <div className="product-form-actions">
                                <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={() => setEditingItem(null)}
                                    disabled={savingStock}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="save-button"
                                    disabled={savingStock}
                                >
                                    {savingStock
                                        ? 'Menyimpan...'
                                        : 'Simpan Stok'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default VendorStock;
