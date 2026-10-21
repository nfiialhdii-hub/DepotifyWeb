import { useEffect, useState } from 'react';
import '../../css/category.css';

const EMPTY_FORM = {
    code: '',
    name: '',
    description: '',
};


function Category() {

    const [categories, setCategories] =
        useState([]);

    const [search, setSearch] =
        useState('');

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [deleting, setDeleting] =
        useState(false);

    const [error, setError] =
        useState('');

    const [showForm, setShowForm] =
        useState(false);

    const [editingCategory, setEditingCategory] =
        useState(null);

    const [showDeleteConfirm, setShowDeleteConfirm] =
        useState(false);

    const [deletingCategory, setDeletingCategory] =
        useState(null);

    const [form, setForm] =
        useState(EMPTY_FORM);


    // =====================================================
    // TOAST
    // =====================================================

    const [toast, setToast] = useState({
        show: false,
        type: 'success',
        message: '',
    });


    const showToast = (
        type,
        message
    ) => {

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
    // TOKEN
    // =====================================================

    const getToken = () => {

        return localStorage.getItem(
            'depotify_token'
        );

    };


    // =====================================================
    // API ERROR
    // =====================================================

    const getApiError = (
        result,
        fallback
    ) => {

        if (
            result?.errors &&
            typeof result.errors === 'object'
        ) {

            const firstError =
                Object.values(
                    result.errors
                )[0];


            if (
                Array.isArray(firstError)
            ) {

                return firstError[0];

            }


            if (
                typeof firstError === 'string'
            ) {

                return firstError;

            }
        }


        return (
            result?.message ||
            fallback
        );
    };


    // =====================================================
    // FETCH CATEGORY
    // =====================================================

    const fetchCategories = async () => {

        try {

            setLoading(true);

            setError('');


            const token =
                getToken();


            if (!token) {

                throw new Error(
                    'Token login tidak ditemukan.'
                );
            }


            let url =
                'http://127.0.0.1:8000/api/v1/categories';


            const params =
                new URLSearchParams();


            if (
                search.trim() !== ''
            ) {

                params.append(
                    'search',
                    search.trim()
                );

            }


            if (
                params.toString() !== ''
            ) {

                url +=
                    `?${params.toString()}`;

            }


            const response =
                await fetch(
                    url,
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
                        'Gagal mengambil data kategori.'
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


            setError(
                error.message
            );


            showToast(
                'error',
                error.message ||
                    'Gagal mengambil data kategori.'
            );

        } finally {

            setLoading(false);

        }
    };


    // =====================================================
    // INITIAL LOAD
    // =====================================================

    useEffect(() => {

        fetchCategories();

    }, []);


    // =====================================================
    // SEARCH
    // =====================================================

    useEffect(() => {

        const timer =
            setTimeout(() => {

                fetchCategories();

            }, 400);


        return () => {

            clearTimeout(timer);

        };

    }, [search]);


    // =====================================================
    // HANDLE CHANGE
    // =====================================================

    const handleChange = (e) => {

        const {
            name,
            value,
        } = e.target;


        setForm((previous) => ({
            ...previous,

            [name]: value,
        }));

    };


    // =====================================================
    // RESET FORM
    // =====================================================

    const resetForm = () => {

        setForm({
            ...EMPTY_FORM,
        });

        setEditingCategory(null);

    };


    // =====================================================
    // TAMBAH KATEGORI
    // =====================================================

    const openAddForm = () => {

        resetForm();

        setError('');

        setShowForm(true);

    };


    // =====================================================
    // EDIT KATEGORI
    // =====================================================

    const handleEdit = (
        category
    ) => {

        setEditingCategory(
            category
        );


        setError('');


        setForm({

            code:
                category.code ||
                '',

            name:
                category.name ||
                '',

            description:
                category.description ||
                '',

        });


        setShowForm(true);

    };


    // =====================================================
    // SUBMIT
    // =====================================================

    const handleSubmit = async (
        e
    ) => {

        e.preventDefault();


        if (saving) {

            return;

        }


        setSaving(true);

        setError('');


        try {

            const token =
                getToken();


            if (!token) {

                throw new Error(
                    'Token login tidak ditemukan.'
                );

            }


            const isEdit =
                Boolean(
                    editingCategory
                );


            const url = isEdit

                ? `http://127.0.0.1:8000/api/v1/categories/${editingCategory.id}`

                : 'http://127.0.0.1:8000/api/v1/categories';


            const method =
                isEdit
                    ? 'PUT'
                    : 'POST';


            const payload = {

                code:
                    form.code
                        .trim()
                        .toUpperCase(),

                name:
                    form.name.trim(),

                description:
                    form.description
                        .trim() ||
                    null,

            };


            const response =
                await fetch(
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
                            ? 'Gagal memperbarui kategori.'
                            : 'Gagal menambahkan kategori.'
                    )
                );

            }


            // =============================================
            // BERHASIL
            // =============================================

            if (isEdit) {

                showToast(
                    'success',
                    'Kategori berhasil diperbarui.'
                );

            } else {

                showToast(
                    'success',
                    'Kategori berhasil ditambahkan.'
                );

            }


            resetForm();

            setShowForm(false);


            await fetchCategories();

        } catch (error) {

            console.error(
                'SAVE CATEGORY ERROR:',
                error
            );


            setError(
                error.message
            );


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
    // OPEN DELETE
    // =====================================================

    const handleDeleteClick = (
        category
    ) => {

        setDeletingCategory(
            category
        );

        setShowDeleteConfirm(
            true
        );

    };


    // =====================================================
    // CLOSE DELETE
    // =====================================================

    const closeDeleteConfirm = () => {

        if (deleting) {

            return;

        }


        setShowDeleteConfirm(
            false
        );

        setDeletingCategory(
            null
        );

    };


    // =====================================================
    // DELETE
    // =====================================================

    const handleDelete = async () => {

        if (
            !deletingCategory ||
            deleting
        ) {

            return;

        }


        setDeleting(true);


        try {

            const token =
                getToken();


            if (!token) {

                throw new Error(
                    'Token login tidak ditemukan.'
                );

            }


            const response =
                await fetch(
                    `http://127.0.0.1:8000/api/v1/categories/${deletingCategory.id}`,

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
                        'Gagal menghapus kategori.'
                    )
                );

            }


            // =============================================
            // BERHASIL HAPUS
            // =============================================

            setShowDeleteConfirm(
                false
            );

            setDeletingCategory(
                null
            );


            showToast(
                'success',
                'Kategori berhasil dihapus.'
            );


            await fetchCategories();

        } catch (error) {

            console.error(
                'DELETE CATEGORY ERROR:',
                error
            );


            showToast(
                'error',
                error.message ||
                    'Gagal menghapus kategori.'
            );

        } finally {

            setDeleting(false);

        }
    };


    // =====================================================
    // RENDER
    // =====================================================

    return (

        <div className="categories-page">


            {/* =================================================
                TOAST
            ================================================= */}

            {toast.show && (

                <div
                    className={`category-toast ${toast.type}`}
                >

                    <div className="category-toast-icon">

                        {toast.type ===
                        'success'
                            ? '✓'
                            : '!'}

                    </div>


                    <div className="category-toast-content">

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
                        className="category-toast-close"

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

            <div className="categories-header">

                <div>

                    <p className="categories-label">
                        MASTER DATA
                    </p>


                    <h1>
                        Kategori
                    </h1>


                    <p className="categories-description">
                        Kelola kategori produk
                        yang tersedia di depot.
                    </p>

                </div>


                <button
                    type="button"
                    className="add-category-button"

                    onClick={
                        openAddForm
                    }
                >
                    + Tambah Kategori
                </button>

            </div>


            {/* =================================================
                ERROR
            ================================================= */}

            {error && !loading && (

                <div className="categories-error">

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
                SEARCH
            ================================================= */}

            <div className="categories-toolbar">

                <input
                    type="text"

                    className="category-search"

                    placeholder="Cari kode atau nama kategori..."

                    value={search}

                    onChange={(e) =>
                        setSearch(
                            e.target.value
                        )
                    }
                />

            </div>


            {/* =================================================
                TABLE
            ================================================= */}

            <div className="categories-card">

                {loading && (

                    <div className="categories-loading">

                        <div className="category-spinner"></div>

                        <p>
                            Memuat data kategori...
                        </p>

                    </div>

                )}


                {!loading &&
                    categories.length >
                        0 && (

                    <div className="categories-table-wrapper">

                        <table className="categories-table">

                            <thead>

                                <tr>

                                    <th>
                                        Kode
                                    </th>

                                    <th>
                                        Nama Kategori
                                    </th>

                                    <th>
                                        Deskripsi
                                    </th>

                                    <th>
                                        Aksi
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {categories.map(
                                    (
                                        category
                                    ) => (

                                    <tr
                                        key={
                                            category.id
                                        }
                                    >

                                        <td>

                                            <span className="category-code">

                                                {
                                                    category.code
                                                }

                                            </span>

                                        </td>


                                        <td>

                                            <strong className="category-name">

                                                {
                                                    category.name
                                                }

                                            </strong>

                                        </td>


                                        <td>

                                            <span className="category-description">

                                                {
                                                    category.description ||
                                                    '-'
                                                }

                                            </span>

                                        </td>


                                        <td>

                                            <div className="category-actions">

                                                <button
                                                    type="button"

                                                    className="category-edit-button"

                                                    onClick={() =>
                                                        handleEdit(
                                                            category
                                                        )
                                                    }
                                                >
                                                    Edit
                                                </button>


                                                <button
                                                    type="button"

                                                    className="category-delete-button"

                                                    onClick={() =>
                                                        handleDeleteClick(
                                                            category
                                                        )
                                                    }
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


                {!loading &&
                    categories.length ===
                        0 && (

                    <div className="categories-empty">

                        <div className="categories-empty-icon">
                            🗂️
                        </div>


                        <h3>
                            Kategori tidak ditemukan
                        </h3>


                        <p>
                            Belum ada kategori
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
                    className="category-modal-overlay"

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
                        className="category-modal"

                        onMouseDown={(e) =>
                            e.stopPropagation()
                        }
                    >

                        <div className="category-modal-header">

                            <div>

                                <p className="categories-label">
                                    MASTER DATA
                                </p>


                                <h2>

                                    {editingCategory
                                        ? 'Edit Kategori'
                                        : 'Tambah Kategori'}

                                </h2>


                                <p>

                                    {editingCategory
                                        ? 'Perbarui informasi kategori.'
                                        : 'Masukkan informasi kategori baru.'}

                                </p>

                            </div>


                            <button
                                type="button"

                                className="category-modal-close"

                                onClick={
                                    closeForm
                                }

                                disabled={
                                    saving
                                }
                            >
                                ×
                            </button>

                        </div>


                        <form
                            className="category-form"

                            onSubmit={
                                handleSubmit
                            }
                        >

                            {/* KODE */}

                            <div className="category-form-field">

                                <label>
                                    Kode Kategori
                                </label>


                                <input
                                    type="text"

                                    name="code"

                                    placeholder="Contoh: LPG"

                                    value={
                                        form.code
                                    }

                                    onChange={
                                        handleChange
                                    }

                                    maxLength="20"

                                    required
                                />

                            </div>


                            {/* NAMA */}

                            <div className="category-form-field">

                                <label>
                                    Nama Kategori
                                </label>


                                <input
                                    type="text"

                                    name="name"

                                    placeholder="Contoh: Gas LPG"

                                    value={
                                        form.name
                                    }

                                    onChange={
                                        handleChange
                                    }

                                    maxLength="100"

                                    required
                                />

                            </div>


                            {/* DESCRIPTION */}

                            <div className="category-form-field">

                                <label>
                                    Deskripsi
                                </label>


                                <textarea
                                    name="description"

                                    placeholder="Contoh: Kategori produk gas LPG"

                                    value={
                                        form.description
                                    }

                                    onChange={
                                        handleChange
                                    }

                                    rows="4"
                                />

                            </div>


                            {/* BUTTON */}

                            <div className="category-form-actions">

                                <button
                                    type="button"

                                    className="category-cancel-button"

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

                                    className="category-save-button"

                                    disabled={
                                        saving
                                    }
                                >

                                    {saving ? (

                                        <>

                                            <span className="category-button-spinner"></span>

                                            Menyimpan...

                                        </>

                                    ) : editingCategory ? (

                                        'Simpan Perubahan'

                                    ) : (

                                        'Tambah Kategori'

                                    )}

                                </button>

                            </div>

                        </form>

                    </div>

                </div>

            )}


            {/* =================================================
                DELETE MODAL
            ================================================= */}

            {showDeleteConfirm &&
                deletingCategory && (

                <div
                    className="category-delete-overlay"

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
                        className="category-delete-modal"

                        onMouseDown={(e) =>
                            e.stopPropagation()
                        }
                    >

                        <div className="category-delete-icon">
                            🗑️
                        </div>


                        <div className="category-delete-content">

                            <h2>
                                Hapus Kategori?
                            </h2>


                            <p>

                                Apakah kamu yakin
                                ingin menghapus
                                kategori{' '}

                                <strong>
                                    {
                                        deletingCategory.name
                                    }
                                </strong>
                                ?

                            </p>


                            <span>
                                Data yang sudah
                                dihapus tidak dapat
                                dikembalikan.
                            </span>

                        </div>


                        <div className="category-delete-actions">

                            <button
                                type="button"

                                className="category-delete-cancel"

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

                                className="category-delete-confirm"

                                onClick={
                                    handleDelete
                                }

                                disabled={
                                    deleting
                                }
                            >

                                {deleting ? (

                                    <>

                                        <span className="category-button-spinner"></span>

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


export default Category;
