import { useCallback, useEffect, useState } from 'react';
import '../../css/category.css';
import { supplierApiRequest } from './helpers';

const EMPTY_FORM = {
    code: '',
    name: '',
    description: '',
};

function VendorCategory() {
    const [categories, setCategories] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState(null);

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
            setLoading(true);
            setError('');

            const params = new URLSearchParams();
            if (search.trim() !== '') {
                params.set('search', search.trim());
            }

            const query = params.toString() ? `?${params.toString()}` : '';
            const result = await supplierApiRequest(`/categories${query}`);

            setCategories(Array.isArray(result?.data) ? result.data : []);
        } catch (err) {
            setError(err.message || 'Gagal mengambil data kategori.');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchCategories();
        }, 250);
        return () => clearTimeout(timer);
    }, [fetchCategories]);

    const openCreateModal = () => {
        setEditingCategory(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEditModal = (category) => {
        setEditingCategory(category);
        setForm({
            code: category.code || '',
            name: category.name || '',
            description: category.description || '',
        });
        setShowForm(true);
    };

    const closeModal = () => {
        if (saving) return;
        setShowForm(false);
        setEditingCategory(null);
        setForm(EMPTY_FORM);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError('');

            const payload = {
                code: form.code.trim().toUpperCase(),
                name: form.name.trim(),
                description: form.description.trim() || null,
            };

            const endpoint = editingCategory
                ? `/categories/${editingCategory.id}`
                : '/categories';
            const method = editingCategory ? 'PUT' : 'POST';

            await supplierApiRequest(endpoint, {
                method,
                body: JSON.stringify(payload),
            });

            showToast(
                'success',
                editingCategory
                    ? 'Kategori  berhasil diperbarui.'
                    : 'Kategori  baru berhasil ditambahkan.'
            );

            closeModal();
            fetchCategories();
        } catch (err) {
            setError(err.message);
            showToast('error', err.message || 'Gagal menyimpan kategori.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingCategory) return;

        try {
            setDeleting(true);
            await supplierApiRequest(`/categories/${deletingCategory.id}`, {
                method: 'DELETE',
            });

            showToast('success', 'Kategori berhasil dihapus.');
            setShowDeleteConfirm(false);
            setDeletingCategory(null);
            fetchCategories();
        } catch (err) {
            showToast('error', err.message || 'Gagal menghapus kategori.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="categories-page">
            {toast.show && (
                <div className={`category-toast ${toast.type}`}>
                    <div className="category-toast-icon">
                        {toast.type === 'success' ? '✓' : '!'}
                    </div>
                    <div className="category-toast-content">
                        <strong>
                            {toast.type === 'success'
                                ? 'Berhasil'
                                : 'Terjadi Kesalahan'}
                        </strong>
                        <span>{toast.message}</span>
                    </div>
                    <button
                        type="button"
                        className="category-toast-close"
                        onClick={() =>
                            setToast((prev) => ({ ...prev, show: false }))
                        }
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="categories-header">
                <div>
                    <p className="categories-label">KATALOG  SUPPLIER</p>
                    <h1>Kategori Barang </h1>
                </div>

                <button
                    type="button"
                    className="add-category-button"
                    onClick={openCreateModal}
                >
                    + Tambah Kategori
                </button>
            </div>

            {error && (
                <div className="categories-error">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError('')}>
                        ×
                    </button>
                </div>
            )}

            <div className="categories-toolbar">
                <input
                    type="text"
                    placeholder="Cari kode atau nama kategori pasokan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="category-search"
                />
            </div>

            <div className="categories-card">
                {loading ? (
                    <div className="categories-loading">
                        <div className="category-spinner" />
                        <p>Memuat kategori pasokan...</p>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="categories-empty">
                        <div className="categories-empty-icon">🏷️</div>
                        <h3>Belum ada kategori pasokan</h3>
                    </div>
                ) : (
                    <div className="categories-table-wrapper">
                        <table className="categories-table">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Kategori</th>
                                    <th>Deskripsi</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((category) => (
                                    <tr key={category.id}>
                                        <td>
                                            <span className="category-code">
                                                {category.code}
                                            </span>
                                        </td>
                                        <td>
                                            <strong className="category-name">
                                                {category.name}
                                            </strong>
                                        </td>
                                        <td>
                                            <span className="category-description">
                                                {category.description || '-'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="category-actions">
                                                <button
                                                    type="button"
                                                    className="category-edit-button"
                                                    onClick={() =>
                                                        openEditModal(category)
                                                    }
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="category-delete-button"
                                                    onClick={() => {
                                                        setDeletingCategory(
                                                            category
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
                <div className="category-modal-overlay" onClick={closeModal}>
                    <div
                        className="category-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="category-modal-header">
                            <div>
                                <p className="categories-label">
                                    {editingCategory
                                        ? 'EDIT KATEGORI '
                                        : 'TAMBAH KATEGORI '}
                                </p>
                                <h2>
                                    {editingCategory
                                        ? 'Perbarui Kategori'
                                        : 'Kategori  Baru'}
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="category-modal-close"
                                onClick={closeModal}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="category-form">
                            <div className="category-form-field">
                                <label>Kode Kategori</label>
                                <input
                                    type="text"
                                    name="code"
                                    placeholder="Contoh: AIR-MINERAL"
                                    value={form.code}
                                    onChange={(e) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            code: e.target.value.toUpperCase(),
                                        }))
                                    }
                                    required
                                />
                            </div>

                            <div className="category-form-field">
                                <label>Nama Kategori</label>
                                <input
                                    type="text"
                                    name="name"
                                    placeholder="Contoh: Air Mineral, Gas LPG"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                        }))
                                    }
                                    required
                                />
                            </div>

                            <div className="category-form-field">
                                <label>Deskripsi (Opsional)</label>
                                <textarea
                                    name="description"
                                    placeholder="Keterangan singkat..."
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            description: e.target.value,
                                        }))
                                    }
                                />
                            </div>

                            <div className="category-form-actions">
                                <button
                                    type="button"
                                    className="category-cancel-button"
                                    onClick={closeModal}
                                    disabled={saving}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="category-save-button"
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <>
                                            <span className="category-button-spinner" />
                                            Menyimpan...
                                        </>
                                    ) : editingCategory ? (
                                        'Simpan Perubahan'
                                    ) : (
                                        'Simpan Kategori'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showDeleteConfirm && deletingCategory && (
                <div
                    className="category-delete-overlay"
                    onClick={() => !deleting && setShowDeleteConfirm(false)}
                >
                    <div
                        className="category-delete-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="category-delete-icon">🗑️</div>
                        <div className="category-delete-content">
                            <h2>Hapus Kategori?</h2>
                            <p>
                                Anda yakin ingin menghapus kategori{' '}
                                <strong>{deletingCategory.name}</strong>?
                            </p>
                            <span>
                                Kategori yang masih memiliki produk tidak dapat
                                dihapus.
                            </span>
                        </div>
                        <div className="category-delete-actions">
                            <button
                                type="button"
                                className="category-delete-cancel"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleting}
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                className="category-delete-confirm"
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

export default VendorCategory;
