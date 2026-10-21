import { useEffect, useState } from "react";
import "../../css/vendor.css";

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

const emptyForm = {
    name: "",
    phone: "",
    address: "",
    account_email: "",
    account_password: "",
    account_password_confirmation: "",
};

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
            const url = query.toString() ? `${API}?${query.toString()}` : API;
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
            const response = await fetch(`${API}/${vendor.id}`, { headers: headers() });
            const detail = await responseData(response);
            setSelected(detail);

            if (mode === "edit") {
                setForm({
                    name: detail.name || "",
                    phone: detail.phone || "",
                    address: detail.address || "",
                    account_email: detail.user?.email || "",
                    account_password: "",
                    account_password_confirmation: "",
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
        const hasAccount = Boolean(selected?.user?.id);

        if (form.account_password && form.account_password !== form.account_password_confirmation) {
            setError("Konfirmasi kata sandi tidak sama.");
            setSaving(false);
            return;
        }

        if ((!editing || !hasAccount) && !form.account_password) {
            setError("Kata sandi awal wajib diisi untuk membuat akun supplier.");
            setSaving(false);
            return;
        }

        const payload = {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            account_email: form.account_email.trim(),
        };

        if (form.account_password) {
            payload.account_password = form.account_password;
            payload.account_password_confirmation = form.account_password_confirmation;
        }

        try {
            const response = await fetch(editing ? `${API}/${selected.id}` : API, {
                method: editing ? "PUT" : "POST",
                headers: headers(true),
                body: JSON.stringify(payload),
            });

            await responseData(response);
            setModal("");
            setNotice(editing
                ? "Data supplier dan akun loginnya berhasil diperbarui."
                : "Supplier dan akun loginnya berhasil dibuat.");
            await loadVendors(search);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteVendor(vendor) {
        if (!window.confirm(`Hapus supplier "${vendor.name}" beserta akun loginnya?`)) return;

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

    const hasSelectedAccount = Boolean(selected?.user?.id);

    return (
        <main className="vendors-page">
            <header className="vendors-header">
                <div>
                    <p className="vendors-label">DATA MASTER</p>
                    <h1>Supplier</h1>
                    <p className="vendors-description">
                        Kelola data pemasok sekaligus akun login supplier.
                    </p>
                </div>
                <button className="vendor-primary" onClick={openAdd}>
                    + Tambah Supplier
                </button>
            </header>

            {error && (
                <div className="vendor-alert vendor-alert-error">
                    {error}
                    <button onClick={() => setError("")} aria-label="Tutup pesan error">×</button>
                </div>
            )}

            {notice && (
                <div className="vendor-alert vendor-alert-success">
                    {notice}
                    <button onClick={() => setNotice("")} aria-label="Tutup pesan">×</button>
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
                        <p>Setiap supplier dapat memiliki akun login sendiri.</p>
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
                                <th>Email Login</th>
                                <th>Akun</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="vendor-empty">Memuat data...</td></tr>
                            ) : vendors.length === 0 ? (
                                <tr><td colSpan="5" className="vendor-empty">Belum ada supplier.</td></tr>
                            ) : vendors.map((vendor) => (
                                <tr key={vendor.id}>
                                    <td>
                                        <strong>{vendor.name}</strong>
                                        <small>ID: {vendor.id}</small>
                                    </td>
                                    <td>{vendor.phone || "—"}</td>
                                    <td>{vendor.user?.email || "Belum ada akun"}</td>
                                    <td>
                                        <span className={`vendor-account-status ${vendor.user?.is_active ? "is-active" : "is-inactive"}`}>
                                            {vendor.user?.is_active ? "Aktif" : "Belum dibuat"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="vendor-actions">
                                            <button onClick={() => openDetail(vendor)}>Detail</button>
                                            <button onClick={() => openDetail(vendor, "edit")}>Edit</button>
                                            <button className="vendor-delete" onClick={() => deleteVendor(vendor)}>Hapus</button>
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
                    <section className="vendor-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-form-title">
                        <h2 id="vendor-form-title">{selected ? "Edit Supplier" : "Tambah Supplier"}</h2>
                        <p className="vendor-form-note">
                            Data supplier dan akun login dikelola bersamaan oleh owner.
                        </p>

                        <form onSubmit={saveVendor}>
                            <label>
                                Nama supplier *
                                <input
                                    required
                                    maxLength={150}
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Contoh: PT Sumber Gas"
                                />
                            </label>

                            <label>
                                Nomor telepon
                                <input
                                    maxLength={20}
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    placeholder="Nomor telepon supplier"
                                />
                            </label>

                            <label>
                                Alamat
                                <textarea
                                    rows={3}
                                    value={form.address}
                                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                                    placeholder="Alamat supplier"
                                />
                            </label>

                            <div className="vendor-account-section">
                                <h3>Akun Login Supplier</h3>
                                <p>Gunakan email ini untuk login ke Depotify.</p>

                                <label>
                                    Email login *
                                    <input
                                        type="email"
                                        required
                                        maxLength={150}
                                        autoComplete="username"
                                        value={form.account_email}
                                        onChange={(e) => setForm({ ...form, account_email: e.target.value })}
                                        placeholder="supplier@email.com"
                                    />
                                </label>

                                <label>
                                    {selected && hasSelectedAccount ? "Kata sandi baru (opsional)" : "Kata sandi awal *"}
                                    <input
                                        type="password"
                                        required={!selected || !hasSelectedAccount}
                                        minLength={8}
                                        autoComplete="new-password"
                                        value={form.account_password}
                                        onChange={(e) => setForm({ ...form, account_password: e.target.value })}
                                        placeholder={selected && hasSelectedAccount ? "Kosongkan jika tidak diubah" : "Minimal 8 karakter"}
                                    />
                                </label>

                                <label>
                                    {selected && hasSelectedAccount ? "Konfirmasi kata sandi baru" : "Konfirmasi kata sandi *"}
                                    <input
                                        type="password"
                                        required={(!selected || !hasSelectedAccount) || Boolean(form.account_password)}
                                        minLength={8}
                                        autoComplete="new-password"
                                        value={form.account_password_confirmation}
                                        onChange={(e) => setForm({ ...form, account_password_confirmation: e.target.value })}
                                        placeholder="Ulangi kata sandi"
                                    />
                                </label>
                            </div>

                            <div className="vendor-modal-actions">
                                <button type="button" className="vendor-secondary" onClick={() => setModal("")} disabled={saving}>
                                    Batal
                                </button>
                                <button type="submit" className="vendor-primary" disabled={saving}>
                                    {saving ? "Menyimpan..." : "Simpan Supplier & Akun"}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {modal === "detail" && selected && (
                <div className="vendor-overlay">
                    <section className="vendor-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-detail-title">
                        <h2 id="vendor-detail-title">Detail Supplier</h2>
                        <dl className="vendor-detail">
                            <dt>Nama supplier</dt><dd>{selected.name}</dd>
                            <dt>Nomor telepon</dt><dd>{selected.phone || "Belum diisi"}</dd>
                            <dt>Alamat</dt><dd>{selected.address || "Belum diisi"}</dd>
                            <dt>Email login</dt><dd>{selected.user?.email || "Belum ada akun login"}</dd>
                            <dt>Status akun</dt><dd>{selected.user?.is_active ? "Aktif" : "Belum dibuat / tidak aktif"}</dd>
                            <dt>Kategori</dt>
                            <dd>
                                {selected.categories?.length
                                    ? selected.categories.map((category) => category.name).join(", ")
                                    : "Belum ada kategori"}
                            </dd>
                        </dl>
                        <div className="vendor-modal-actions">
                            <button className="vendor-secondary" onClick={() => setModal("")}>Tutup</button>
                            <button className="vendor-primary" onClick={() => openDetail(selected, "edit")}>Edit Supplier</button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
