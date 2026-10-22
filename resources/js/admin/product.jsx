import { useEffect, useState } from 'react';
import '../../css/product.css';

const EMPTY_FORM = {
    name: '',
    sku: '',
    category_id: '',
    variant: '',
    unit: '',
    selling_price: '',
    deposit_price: '',
    purchase_price: '',
    minimum_stock: '',
    is_active: true,
};

function Products() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editingProduct, setEditingProduct] = useState(null);

    const [showDeleteConfirm, setShowDeleteConfirm] =
        useState(false);

    const [deletingProduct, setDeletingProduct] =
        useState(null);

    const [deleting, setDeleting] = useState(false);

    const [form, setForm] = useState(EMPTY_FORM);

    const [toast, setToast] = useState({
        show: false,
        type: 'success',
        message: '',
    });


    // =====================================================
    // TOKEN
    // =====================================================

    const getToken = () => {
        return localStorage.getItem('depotify_token');
    };


    // =====================================================
    // TOAST / NOTIFICATION
    // =====================================================

    const showToast = (type, message) => {
        setToast({
            show: true,
            type,
            message,
        });

        setTimeout(() => {
            setToast((previous) => ({
                ...previous,
                show: false,
            }));
        }, 3000);
    };


    // =====================================================
    // FORMAT ERROR API
    // =====================================================

    const getApiError = (result, fallback) => {
        if (
            result?.errors &&
            typeof result.errors === 'object'
        ) {
            const firstError =
                Object.values(result.errors)[0];

            if (Array.isArray(firstError)) {
                return firstError[0];
            }

            if (typeof firstError === 'string') {
                return firstError;
            }
        }

        return result?.message || fallback;
    };


    // =====================================================
    // FETCH PRODUCTS
    // =====================================================

    const fetchProducts = async () => {
        try {
            setLoading(true);
            setError('');

            const token = getToken();

            if (!token) {
                throw new Error(
                    'Token login tidak ditemukan.'
                );
            }

            let url =
                '/api/v1/products';

            const params = new URLSearchParams();

            if (search.trim() !== '') {
                params.append(
                    'search',
                    search.trim()
                );
            }

            if (categoryFilter !== '') {
                params.append(
                    'category_id',
                    categoryFilter
                );
            }

            if (params.toString() !== '') {
                url += `?${params.toString()}`;
            }

            const response = await fetch(url, {
                method: 'GET',

                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    getApiError(
                        result,
                        'Gagal mengambil data produk.'
                    )
                );
            }

            setProducts(result.data || []);
        } catch (error) {
            console.error(
                'PRODUCT ERROR:',
                error
            );

            setError(error.message);

            showToast(
                'error',
                error.message ||
                    'Gagal mengambil data produk.'
            );
        } finally {
            setLoading(false);
        }
    };


    // =====================================================
    // FETCH CATEGORIES
    // =====================================================

    const fetchCategories = async () => {
        try {
            const token = getToken();

            if (!token) {
                return;
            }

            const response = await fetch(
                '/api/v1/categories',
                {
                    method: 'GET',

                    headers: {
                        Accept:
                            'application/json',

                        Authorization:
                            `Bearer ${token}`,
                    },
                }
            );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    getApiError(
                        result,
                        'Gagal mengambil kategori.'
                    )
                );
            }

            setCategories(
                result.data || []
            );
        } catch (error) {
            console.error(
                'CATEGORY ERROR:',
                error
            );

            showToast(
                'error',
                error.message ||
                    'Gagal mengambil kategori.'
            );
        }
    };


    // =====================================================
    // INITIAL LOAD
    // =====================================================

    useEffect(() => {
        fetchCategories();
    }, []);


    // =====================================================
    // SEARCH / FILTER
    // =====================================================

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 400);

        return () => {
            clearTimeout(timer);
        };
    }, [
        search,
        categoryFilter,
    ]);


    // =====================================================
    // FORM CHANGE
    // =====================================================

    const handleChange = (e) => {
        const {
            name,
            value,
            type,
            checked,
        } = e.target;

        setForm((previous) => ({
            ...previous,

            [name]:
                type === 'checkbox'
                    ? checked
                    : value,
        }));
    };


    // =====================================================
    // RESET FORM
    // =====================================================

    const resetForm = () => {
        setForm({
            ...EMPTY_FORM,
        });

        setEditingProduct(null);
    };


    // =====================================================
    // OPEN ADD FORM
    // =====================================================

    const openAddForm = () => {
        resetForm();

        setError('');

        setShowForm(true);
    };


    // =====================================================
    // OPEN EDIT FORM
    // =====================================================

    const handleEdit = (product) => {
        setEditingProduct(product);

        setError('');

        setForm({
            name: product.name || '',

            sku: product.sku || '',

            category_id:
                product.category_id
                    ? String(product.category_id)
                    : '',

            variant:
                product.variant || '',

            unit:
                product.unit || '',

            selling_price:
                product.selling_price ??
                '',

            deposit_price:
                product.deposit_price ??
                '',

            purchase_price:
                product.purchase_price ??
                '',

            minimum_stock:
                product.minimum_stock ??
                '',

            is_active:
                Boolean(product.is_active),
        });

        setShowForm(true);
    };


    // =====================================================
    // SUBMIT ADD / EDIT
    // =====================================================

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (saving) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            const token = getToken();

            if (!token) {
                throw new Error(
                    'Token login tidak ditemukan.'
                );
            }

            const isEdit =
                Boolean(editingProduct);

            const url = isEdit
                ? `/api/v1/products/${editingProduct.id}`
                : '/api/v1/products';

            const method = isEdit
                ? 'PUT'
                : 'POST';

            const payload = {
                name: form.name.trim(),

                sku:
                    form.sku.trim() ||
                    null,

                category_id:
                    Number(form.category_id),

                variant:
                    form.variant.trim() ||
                    null,

                unit: form.unit,

                selling_price:
                    Number(form.selling_price),

                deposit_price:
                    form.deposit_price === ''
                        ? 0
                        : Number(
                              form.deposit_price
                          ),

                purchase_price:
                    Number(form.purchase_price),

                minimum_stock:
                    form.minimum_stock === ''
                        ? 0
                        : Number(
                              form.minimum_stock
                          ),

                is_active:
                    form.is_active,
            };

            const response = await fetch(
                url,
                {
                    method,

                    headers: {
                        'Content-Type':
                            'application/json',

                        Accept:
                            'application/json',

                        Authorization:
                            `Bearer ${token}`,
                    },

                    body:
                        JSON.stringify(
                            payload
                        ),
                }
            );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    getApiError(
                        result,
                        isEdit
                            ? 'Gagal memperbarui produk.'
                            : 'Gagal menambahkan produk.'
                    )
                );
            }


            // =============================================
            // SUKSES
            // =============================================

            if (isEdit) {
                showToast(
                    'success',
                    'Produk berhasil diperbarui.'
                );
            } else {
                showToast(
                    'success',
                    'Produk berhasil ditambahkan.'
                );
            }

            resetForm();

            setShowForm(false);

            await fetchProducts();
        } catch (error) {
            console.error(
                'SAVE PRODUCT ERROR:',
                error
            );

            setError(error.message);

            showToast(
                'error',
                error.message ||
                    'Terjadi kesalahan.'
            );
        } finally {
            setSaving(false);
        }
    };


    // =====================================================
    // CLOSE FORM
    // =====================================================

    const closeForm = () => {
        if (saving) {
            return;
        }

        setShowForm(false);

        resetForm();

        setError('');
    };


    // =====================================================
    // OPEN DELETE CONFIRM
    // =====================================================

    const handleDeleteClick = (product) => {
        setDeletingProduct(product);

        setShowDeleteConfirm(true);
    };


    // =====================================================
    // CLOSE DELETE CONFIRM
    // =====================================================

    const closeDeleteConfirm = () => {
        if (deleting) {
            return;
        }

        setShowDeleteConfirm(false);

        setDeletingProduct(null);
    };


    // =====================================================
    // DELETE PRODUCT
    // =====================================================

    const handleDelete = async () => {
        if (!deletingProduct || deleting) {
            return;
        }

        setDeleting(true);

        try {
            const token = getToken();

            if (!token) {
                throw new Error(
                    'Token login tidak ditemukan.'
                );
            }

            const response =
                await fetch(
                    `/api/v1/products/${deletingProduct.id}`,
                    {
                        method: 'DELETE',

                        headers: {
                            Accept:
                                'application/json',

                            Authorization:
                                `Bearer ${token}`,
                        },
                    }
                );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    getApiError(
                        result,
                        'Gagal menghapus produk.'
                    )
                );
            }


            // =============================================
            // SUKSES HAPUS
            // =============================================

            setShowDeleteConfirm(false);

            setDeletingProduct(null);

            showToast(
                'success',
                'Produk berhasil dihapus.'
            );

            await fetchProducts();
        } catch (error) {
            console.error(
                'DELETE PRODUCT ERROR:',
                error
            );

            showToast(
                'error',
                error.message ||
                    'Gagal menghapus produk.'
            );
        } finally {
            setDeleting(false);
        }
    };


    // =====================================================
    // FORMAT RUPIAH
    // =====================================================

    const formatRupiah = (value) => {
        return Number(
            value || 0
        ).toLocaleString(
            'id-ID'
        );
    };


    // =====================================================
    // RENDER
    // =====================================================

    return (
        <div className="products-page">

            {/* =================================================
                TOAST NOTIFICATION
            ================================================= */}

            {toast.show && (
                <div
                    className={`product-toast ${
                        toast.type
                    }`}
                >
                    <div className="toast-icon">
                        {toast.type ===
                        'success'
                            ? '✓'
                            : '!'}
                    </div>

                    <div className="toast-content">
                        <strong>
                            {toast.type ===
                            'success'
                                ? 'Berhasil'
                                : 'Gagal'}
                        </strong>

                        <span>
                            {toast.message}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="toast-close"
                        onClick={() =>
                            setToast(
                                (
                                    previous
                                ) => ({
                                    ...previous,
                                    show: false,
                                })
                            )
                        }
                    >
                        ×
                    </button>
                </div>
            )}


            {/* =================================================
                HEADER
            ================================================= */}

            <div className="products-header">

                <div>
                    <p className="products-label">
                        MASTER DATA
                    </p>

                    <h1>
                        Produk
                    </h1>

                    <p className="products-description">
                        Kelola data produk yang
                        tersedia di depot.
                    </p>
                </div>


                <button
                    type="button"
                    className="add-product-button"
                    onClick={
                        openAddForm
                    }
                >
                    + Tambah Produk
                </button>

            </div>


            {/* =================================================
                ERROR GLOBAL
            ================================================= */}

            {error && !loading && (
                <div className="products-error-top">

                    <span>
                        {error}
                    </span>

                    <button
                        type="button"
                        onClick={() =>
                            setError('')
                        }
                    >
                        ×
                    </button>

                </div>
            )}


            {/* =================================================
                TOOLBAR
            ================================================= */}

            <div className="products-toolbar">

                <input
                    type="text"
                    className="product-search"
                    placeholder="Cari produk atau SKU..."
                    value={search}
                    onChange={(e) =>
                        setSearch(
                            e.target.value
                        )
                    }
                />


                <select
                    className="product-filter"
                    value={categoryFilter}
                    onChange={(e) =>
                        setCategoryFilter(
                            e.target.value
                        )
                    }
                >
                    <option value="">
                        Semua Kategori
                    </option>

                    {categories.map(
                        (category) => (
                            <option
                                key={
                                    category.id
                                }
                                value={
                                    category.id
                                }
                            >
                                {
                                    category.name
                                }
                            </option>
                        )
                    )}
                </select>

            </div>


            {/* =================================================
                TABLE
            ================================================= */}

            <div className="products-card">

                {loading && (
                    <div className="products-loading">

                        <div className="loading-spinner"></div>

                        <p>
                            Memuat data produk...
                        </p>

                    </div>
                )}


                {!loading &&
                    products.length >
                        0 && (
                        <div className="products-table-wrapper">

                            <table className="products-table">

                                <thead>
                                    <tr>

                                        <th>
                                            SKU
                                        </th>

                                        <th>
                                            Produk
                                        </th>

                                        <th>
                                            Kategori
                                        </th>

                                        <th>
                                            Varian
                                        </th>

                                        <th>
                                            Harga
                                        </th>

                                        <th>
                                            Stok
                                        </th>

                                        <th>
                                            Aksi
                                        </th>

                                    </tr>
                                </thead>


                                <tbody>

                                    {products.map(
                                        (
                                            product
                                        ) => (
                                            <tr
                                                key={
                                                    product.id
                                                }
                                            >

                                                <td>
                                                    <span className="sku-text">
                                                        {
                                                            product.sku ||
                                                            '-'
                                                        }
                                                    </span>
                                                </td>


                                                <td>
                                                    <div className="product-name">

                                                        <strong>
                                                            {
                                                                product.name
                                                            }
                                                        </strong>

                                                        <span>
                                                            {
                                                                product.unit
                                                            }
                                                        </span>

                                                    </div>
                                                </td>


                                                <td>
                                                    {
                                                        product
                                                            .category
                                                            ?.name ||
                                                        '-'
                                                    }
                                                </td>


                                                <td>
                                                    {
                                                        product.variant ||
                                                        '-'
                                                    }
                                                </td>


                                                <td>
                                                    <strong>
                                                        Rp{' '}
                                                        {
                                                            formatRupiah(
                                                                product.selling_price
                                                            )
                                                        }
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
                                                        {
                                                            product.stock_content ??
                                                            0
                                                        }
                                                    </span>
                                                </td>


                                                <td>
                                                    <div className="product-actions">

                                                        <button
                                                            type="button"
                                                            className="edit-button"
                                                            onClick={() =>
                                                                handleEdit(
                                                                    product
                                                                )
                                                            }
                                                        >
                                                            Edit
                                                        </button>


                                                        <button
                                                            type="button"
                                                            className="delete-button"
                                                            onClick={() =>
                                                                handleDeleteClick(
                                                                    product
                                                                )
                                                            }
                                                        >
                                                            Hapus
                                                        </button>

                                                    </div>
                                                </td>

                                            </tr>
                                        )
                                    )}

                                </tbody>

                            </table>

                        </div>
                    )}


                {!loading &&
                    products.length ===
                        0 && (
                        <div className="empty-products">

                            <div className="empty-icon">
                                📦
                            </div>

                            <h3>
                                Produk tidak ditemukan
                            </h3>

                            <p>
                                Tidak ada produk
                                yang sesuai dengan
                                pencarian.
                            </p>

                        </div>
                    )}

            </div>


            {/* =================================================
                MODAL TAMBAH / EDIT
            ================================================= */}

            {showForm && (
                <div
                    className="product-modal-overlay"
                    onMouseDown={(e) => {
                        if (
                            e.target ===
                            e.currentTarget
                        ) {
                            closeForm();
                        }
                    }}
                >

                    <div
                        className="product-modal"
                        onMouseDown={(e) =>
                            e.stopPropagation()
                        }
                    >

                        <div className="product-modal-header">

                            <div>

                                <p className="products-label">
                                    MASTER DATA
                                </p>

                                <h2>
                                    {editingProduct
                                        ? 'Edit Produk'
                                        : 'Tambah Produk'}
                                </h2>

                                <p>
                                    {editingProduct
                                        ? 'Perbarui informasi produk.'
                                        : 'Masukkan informasi produk baru.'}
                                </p>

                            </div>


                            <button
                                type="button"
                                className="modal-close"
                                onClick={
                                    closeForm
                                }
                                disabled={saving}
                            >
                                ×
                            </button>

                        </div>


                        <form
                            className="product-form"
                            onSubmit={
                                handleSubmit
                            }
                        >

                            {/* NAMA */}

                            <div className="form-field">

                                <label>
                                    Nama Produk
                                </label>

                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Contoh: Aqua"
                                    value={
                                        form.name
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                />

                            </div>


                            {/* SKU */}

                            <div className="form-field">

                                <label>
                                    SKU
                                </label>

                                <input
                                    type="text"
                                    name="sku"
                                    placeholder="Contoh: AIR-AQ19"
                                    value={
                                        form.sku
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                            </div>


                            {/* KATEGORI */}

                            <div className="form-field">

                                <label>
                                    Kategori
                                </label>

                                <select
                                    name="category_id"
                                    value={
                                        form.category_id
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                >

                                    <option value="">
                                        Pilih kategori
                                    </option>

                                    {categories.map(
                                        (
                                            category
                                        ) => (
                                            <option
                                                key={
                                                    category.id
                                                }
                                                value={
                                                    category.id
                                                }
                                            >
                                                {
                                                    category.name
                                                }
                                            </option>
                                        )
                                    )}

                                </select>

                            </div>


                            {/* VARIAN */}

                            <div className="form-field">

                                <label>
                                    Varian
                                </label>

                                <input
                                    type="text"
                                    name="variant"
                                    placeholder="Contoh: 19 L"
                                    value={
                                        form.variant
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                            </div>


                            {/* SATUAN */}

                            <div className="form-field">

                                <label>
                                    Satuan
                                </label>

                                <select
                                    name="unit"
                                    value={
                                        form.unit
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                >

                                    <option value="">
                                        Pilih satuan
                                    </option>

                                    <option value="canister">
                                        Canister
                                    </option>

                                    <option value="gallon">
                                        Gallon
                                    </option>

                                    <option value="pcs">
                                        Pcs
                                    </option>

                                    <option value="other">
                                        Lainnya
                                    </option>

                                </select>

                            </div>


                            {/* HARGA JUAL + DEPOSIT */}

                            <div className="form-row">

                                <div className="form-field">

                                    <label>
                                        Harga Jual
                                    </label>

                                    <input
                                        type="number"
                                        name="selling_price"
                                        placeholder="23000"
                                        min="0"
                                        value={
                                            form.selling_price
                                        }
                                        onChange={
                                            handleChange
                                        }
                                        required
                                    />

                                </div>


                                <div className="form-field">

                                    <label>
                                        Harga Deposit
                                    </label>

                                    <input
                                        type="number"
                                        name="deposit_price"
                                        placeholder="50000"
                                        min="0"
                                        value={
                                            form.deposit_price
                                        }
                                        onChange={
                                            handleChange
                                        }
                                    />

                                </div>

                            </div>


                            {/* HARGA BELI */}

                            <div className="form-field">

                                <label>
                                    Harga Beli
                                </label>

                                <input
                                    type="number"
                                    name="purchase_price"
                                    placeholder="18000"
                                    min="0"
                                    value={
                                        form.purchase_price
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                />

                            </div>


                            {/* MINIMUM STOCK */}

                            <div className="form-field">

                                <label>
                                    Minimum Stok
                                </label>

                                <input
                                    type="number"
                                    name="minimum_stock"
                                    placeholder="0"
                                    min="0"
                                    value={
                                        form.minimum_stock
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                                <small className="field-hint">
                                    Isi jika produk
                                    memiliki batas
                                    minimum stok.
                                </small>

                            </div>


                            {/* STATUS */}

                            <div className="active-field">

                                <label className="checkbox-label">

                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={
                                            form.is_active
                                        }
                                        onChange={
                                            handleChange
                                        }
                                    />

                                    <span>
                                        Produk aktif
                                    </span>

                                </label>

                            </div>


                            {/* BUTTON */}

                            <div className="product-form-actions">

                                <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={
                                        closeForm
                                    }
                                    disabled={
                                        saving
                                    }
                                >
                                    Batal
                                </button>


                                <button
                                    type="submit"
                                    className="save-button"
                                    disabled={
                                        saving
                                    }
                                >
                                    {saving ? (
                                        <>
                                            <span className="button-spinner"></span>
                                            Menyimpan...
                                        </>
                                    ) : editingProduct ? (
                                        'Simpan Perubahan'
                                    ) : (
                                        'Tambah Produk'
                                    )}
                                </button>

                            </div>

                        </form>

                    </div>

                </div>
            )}


            {/* =================================================
                MODAL KONFIRMASI HAPUS
            ================================================= */}

            {showDeleteConfirm &&
                deletingProduct && (
                    <div
                        className="delete-modal-overlay"
                        onMouseDown={(e) => {
                            if (
                                e.target ===
                                e.currentTarget
                            ) {
                                closeDeleteConfirm();
                            }
                        }}
                    >

                        <div
                            className="delete-modal"
                            onMouseDown={(e) =>
                                e.stopPropagation()
                            }
                        >

                            <div className="delete-modal-icon">
                                🗑️
                            </div>


                            <div className="delete-modal-content">

                                <h2>
                                    Hapus Produk?
                                </h2>

                                <p>
                                    Apakah kamu yakin
                                    ingin menghapus
                                    produk{' '}
                                    <strong>
                                        {
                                            deletingProduct.name
                                        }
                                    </strong>
                                    ?
                                </p>

                                <span className="delete-warning">
                                    Data yang sudah
                                    dihapus tidak dapat
                                    dikembalikan.
                                </span>

                            </div>


                            <div className="delete-modal-actions">

                                <button
                                    type="button"
                                    className="delete-cancel-button"
                                    onClick={
                                        closeDeleteConfirm
                                    }
                                    disabled={
                                        deleting
                                    }
                                >
                                    Batal
                                </button>


                                <button
                                    type="button"
                                    className="delete-confirm-button"
                                    onClick={
                                        handleDelete
                                    }
                                    disabled={
                                        deleting
                                    }
                                >
                                    {deleting ? (
                                        <>
                                            <span className="button-spinner"></span>
                                            Menghapus...
                                        </>
                                    ) : (
                                        'Ya, Hapus'
                                    )}
                                </button>

                            </div>

                        </div>

                    </div>
                )}

        </div>
    );
}

export default Products;
