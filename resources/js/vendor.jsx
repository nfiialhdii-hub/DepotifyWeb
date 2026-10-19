
import { useEffect, useState } from "react";
import "../css/vendor.css";

const API = "/api/v1/vendors";

function headers(json = false) {
    const token = localStorage.getItem("depotify_token");

    return {
        Accept: "application/json",
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function responseData(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errors = data.errors
            ? Object.values(data.errors).flat().join(" ")
            : "";

        throw new Error(errors || data.message || "Permintaan gagal.");
    }

    return data;
}

function getList(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.data)) return result.data.data;
    return [];
}

const emptyForm = { name: "", phone: "", address: "" };

export default function Vendors() {
    const [vendors, setVendors] = useState([]);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [selected, setSelected] = useState(null);
    const [modal, setModal] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    async function loadVendors(keyword = "") {
        setLoading(true);
        setError("");

        try {
            const query = new URLSearchParams();
            if (keyword.trim()) query.set("search", keyword.trim());

            const url = query.toString()
                ? `${API}?${query.toString()}`
                : API;

            const response = await fetch(url, { headers: headers() });
            setVendors(getList(await responseData(response)));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadVendors();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => loadVendors(search), 350);
        return () => clearTimeout(timer);
    }, [search]);

    function openAdd() {
        setSelected(null);
        setForm(emptyForm);
        setError("");
        setModal("form");
    }

    async function openDetail(vendor, mode = "detail") {
        setError("");

        try {
            const response = await fetch(`${API}/${vendor.id}`, {
                headers: headers(),
            });

            const detail = await responseData(response);
            setSelected(detail);

            if (mode === "edit") {
                setForm({
                    name: detail.name || "",
                    phone: detail.phone || "",
                    address: detail.address || "",
                });
            }

            setModal(mode === "edit" ? "form" : "detail");
        } catch (err) {
            setError(err.message);
        }
    }

    async function saveVendor(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setNotice("");

        const editing = Boolean(selected?.id);

        try {
            const response = await fetch(
                editing ? `${API}/${selected.id}` : API,
                {
                    method: editing ? "PUT" : "POST",
                    headers: headers(true),
                    body: JSON.stringify({
                        name: form.name.trim(),
                        phone: form.phone.trim() || null,
                        address: form.address.trim() || null,
                    }),
                }
            );

            await responseData(response);
            setModal("");
            setNotice(editing
                ? "Data supplier berhasil diperbarui."
                : "Supplier berhasil ditambahkan.");

            await loadVendors(search);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteVendor(vendor) {
        if (!window.confirm(
            `Hapus supplier "${vendor.name}"?`
        )) return;

        setError("");
        setNotice("");

        try {
            const response = await fetch(`${API}/${vendor.id}`, {
                method: "DELETE",
                headers: headers(),
            });

            const result = await responseData(response);
            setNotice(result.message || "Supplier berhasil dihapus.");
            await loadVendors(search);
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <main className="vendors-page">
            <header className="vendors-header">
                <div>
                    <p className="vendors-label">DATA MASTER</p>
                    <h1>Supplier</h1>
                    <p className="vendors-description">
                        Kelola data pemasok barang depot.
                    </p>
                </div>

                <button className="vendor-primary" onClick={openAdd}>
                    + Tambah Supplier
                </button>
            </header>

            {error && (
                <div className="vendor-alert vendor-alert-error">
                    {error}
                    <button onClick={() => setError("")}>×</button>
                </div>
            )}

            {notice && (
                <div className="vendor-alert vendor-alert-success">
                    {notice}
                    <button onClick={() => setNotice("")}>×</button>
                </div>
            )}

            <section className="vendor-summary">
                <span className="vendor-summary-icon">♧</span>
                <div>
                    <p>Total supplier ditemukan</p>
                    <strong>{loading ? "..." : vendors.length}</strong>
                </div>
            </section>

            <section className="vendor-card">
                <div className="vendor-toolbar">
                    <div>
                        <h2>Daftar Supplier</h2>
                        <p>Supplier yang terdaftar di Depotify.</p>
                    </div>

                    <input
                        className="vendor-search"
                        type="search"
                        placeholder="Cari nama supplier..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <div className="vendor-table-wrap">
                    <table className="vendor-table">
                        <thead>
                            <tr>
                                <th>Nama Supplier</th>
                                <th>Telepon</th>
                                <th>Alamat</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="vendor-empty">
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : vendors.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="vendor-empty">
                                        Belum ada supplier.
                                    </td>
                                </tr>
                            ) : vendors.map((vendor) => (
                                <tr key={vendor.id}>
                                    <td>
                                        <strong>{vendor.name}</strong>
                                        <small>ID: {vendor.id}</small>
                                    </td>
                                    <td>{vendor.phone || "—"}</td>
                                    <td>{vendor.address || "—"}</td>
                                    <td>
                                        <div className="vendor-actions">
                                            <button
                                                onClick={() => openDetail(vendor)}
                                            >
                                                Detail
                                            </button>
                                            <button
                                                onClick={() => openDetail(vendor, "edit")}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="vendor-delete"
                                                onClick={() => deleteVendor(vendor)}
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
            </section>

            {modal === "form" && (
                <div className="vendor-overlay">
                    <section className="vendor-modal">
                        <h2>
                            {selected ? "Edit Supplier" : "Tambah Supplier"}
                        </h2>

                        <form onSubmit={saveVendor}>
                            <label>
                                Nama supplier *
                                <input
                                    required
                                    maxLength={150}
                                    value={form.name}
                                    onChange={(e) => setForm({
                                        ...form,
                                        name: e.target.value,
                                    })}
                                    placeholder="Contoh: PT Sumber Gas"
                                />
                            </label>

                            <label>
                                Nomor telepon
                                <input
                                    maxLength={20}
                                    value={form.phone}
                                    onChange={(e) => setForm({
                                        ...form,
                                        phone: e.target.value,
                                    })}
                                    placeholder="Nomor telepon supplier"
                                />
                            </label>

                            <label>
                                Alamat
                                <textarea
                                    rows={3}
                                    value={form.address}
                                    onChange={(e) => setForm({
                                        ...form,
                                        address: e.target.value,
                                    })}
                                    placeholder="Alamat supplier"
                                />
                            </label>

                            <div className="vendor-modal-actions">
                                <button
                                    type="button"
                                    className="vendor-secondary"
                                    onClick={() => setModal("")}
                                    disabled={saving}
                                >
                                    Batal
                                </button>

                                <button
                                    type="submit"
                                    className="vendor-primary"
                                    disabled={saving}
                                >
                                    {saving ? "Menyimpan..." : "Simpan"}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {modal === "detail" && selected && (
                <div className="vendor-overlay">
                    <section className="vendor-modal">
                        <h2>Detail Supplier</h2>

                        <dl className="vendor-detail">
                            <dt>Nama supplier</dt>
                            <dd>{selected.name}</dd>

                            <dt>Nomor telepon</dt>
                            <dd>{selected.phone || "Belum diisi"}</dd>

                            <dt>Alamat</dt>
                            <dd>{selected.address || "Belum diisi"}</dd>

                            <dt>Kategori</dt>
                            <dd>
                                {selected.categories?.length
                                    ? selected.categories
                                        .map((category) => category.name)
                                        .join(", ")
                                    : "Belum ada kategori"}
                            </dd>
                        </dl>

                        <div className="vendor-modal-actions">
                            <button
                                className="vendor-secondary"
                                onClick={() => setModal("")}
                            >
                                Tutup
                            </button>
                            <button
                                className="vendor-primary"
                                onClick={() => openDetail(selected, "edit")}
                            >
                                Edit Supplier
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
