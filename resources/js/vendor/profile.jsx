import { useCallback, useEffect, useState } from 'react';
import { USER_STORAGE_KEY } from '../utils/session';
import { supplierApiRequest } from './helpers';

function VendorProfile({ user, onProfileUpdated, onShowFeedback }) {
    const [profileData, setProfileData] = useState(null);
    const [profileForm, setProfileForm] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        password: '',
        password_confirmation: '',
    });
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);

    const fetchSupplierProfile = useCallback(async () => {
        setProfileLoading(true);

        try {
            const result = await supplierApiRequest('/supplier/profile');
            const vendor = result?.data;
            setProfileData(vendor);

            if (vendor) {
                setProfileForm({
                    name: vendor.name || user?.name || '',
                    email: vendor.user?.email || user?.email || '',
                    phone: vendor.phone || vendor.user?.phone || '',
                    address: vendor.address || '',
                    password: '',
                    password_confirmation: '',
                });

                if (typeof onProfileUpdated === 'function') {
                    onProfileUpdated(vendor);
                }
            }
        } catch (err) {
            if (typeof onShowFeedback === 'function') {
                onShowFeedback(
                    'error',
                    err.message || 'Gagal memuat profil supplier.'
                );
            }
        } finally {
            setProfileLoading(false);
        }
    }, [onProfileUpdated, onShowFeedback, user?.email, user?.name]);

    useEffect(() => {
        fetchSupplierProfile();
    }, [fetchSupplierProfile]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setProfileSaving(true);
        if (typeof onShowFeedback === 'function') {
            onShowFeedback('', '');
        }

        try {
            const payload = {
                name: profileForm.name.trim(),
                email: profileForm.email.trim(),
                phone: profileForm.phone.trim() || null,
                address: profileForm.address.trim() || null,
            };

            if (profileForm.password) {
                payload.password = profileForm.password;
                payload.password_confirmation =
                    profileForm.password_confirmation;
            }

            const result = await supplierApiRequest('/supplier/profile', {
                method: 'PUT',
                body: JSON.stringify(payload),
            });

            const updatedVendor = result?.data;
            setProfileData(updatedVendor);
            setProfileForm((prev) => ({
                ...prev,
                password: '',
                password_confirmation: '',
            }));

            if (typeof onProfileUpdated === 'function') {
                onProfileUpdated(updatedVendor);
            }

            // Perbarui informasi nama/email user di localStorage agar tetap sinkron
            try {
                const rawUser = localStorage.getItem(USER_STORAGE_KEY);
                if (rawUser) {
                    const parsedUser = JSON.parse(rawUser);
                    const syncedUser = {
                        ...parsedUser,
                        name: updatedVendor?.name || payload.name,
                        email: updatedVendor?.user?.email || payload.email,
                        phone: updatedVendor?.phone || payload.phone,
                    };
                    localStorage.setItem(
                        USER_STORAGE_KEY,
                        JSON.stringify(syncedUser)
                    );
                }
            } catch {
                // Abaikan jika gagal update cache profil
            }

            if (typeof onShowFeedback === 'function') {
                onShowFeedback(
                    'success',
                    'Profil supplier berhasil diperbarui.'
                );
            }
        } catch (err) {
            if (typeof onShowFeedback === 'function') {
                onShowFeedback(
                    'error',
                    err.message || 'Gagal memperbarui profil supplier.'
                );
            }
        } finally {
            setProfileSaving(false);
        }
    };

    if (profileLoading) {
        return (
            <div className="supplier-state-box">
                <h3>Memuat profil supplier...</h3>
                <p>Mengambil informasi perusahaan dan akun dari server.</p>
            </div>
        );
    }

    const categories = Array.isArray(profileData?.categories)
        ? profileData.categories
        : [];

    return (
        <div className="supplier-panel">
            <div className="supplier-panel-header">
                <div className="supplier-panel-title">
                    <h2>Profil Mitra Supplier</h2>
                </div>
            </div>

            <form onSubmit={handleSaveProfile}>
                <div className="supplier-form-grid">
                    <div className="supplier-form-group">
                        <label htmlFor="supplier-name">
                            Nama Perusahaan / Supplier
                        </label>
                        <input
                            id="supplier-name"
                            type="text"
                            value={profileForm.name}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                }))
                            }
                            required
                            disabled={profileSaving}
                        />
                    </div>

                    <div className="supplier-form-group">
                        <label htmlFor="supplier-email">Email Login</label>
                        <input
                            id="supplier-email"
                            type="email"
                            value={profileForm.email}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    email: e.target.value,
                                }))
                            }
                            required
                            disabled={profileSaving}
                        />
                    </div>

                    <div className="supplier-form-group">
                        <label htmlFor="supplier-phone">
                            Nomor Telepon / WhatsApp
                        </label>
                        <input
                            id="supplier-phone"
                            type="text"
                            placeholder="Contoh: 08123456789"
                            value={profileForm.phone}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    phone: e.target.value,
                                }))
                            }
                            disabled={profileSaving}
                        />
                    </div>

                    <div className="supplier-form-group">
                        <label>Kategori Pasokan Terdaftar</label>
                        {categories.length > 0 ? (
                            <div className="supplier-category-chips">
                                {categories.map((cat) => (
                                    <span
                                        key={cat.id}
                                        className="supplier-category-chip"
                                    >
                                        {cat.name}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="supplier-subtext">
                                Belum ada kategori khusus yang dikaitkan oleh
                                Owner.
                            </span>
                        )}
                    </div>

                    <div className="supplier-form-group full">
                        <label htmlFor="supplier-address">
                            Alamat Lengkap Supplier
                        </label>
                        <textarea
                            id="supplier-address"
                            rows={3}
                            placeholder="Masukkan alamat gudang atau kantor supplier"
                            value={profileForm.address}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    address: e.target.value,
                                }))
                            }
                            disabled={profileSaving}
                        />
                    </div>

                    <div className="supplier-form-group">
                        <label htmlFor="supplier-password">
                            Kata Sandi Baru (Opsional)
                        </label>
                        <input
                            id="supplier-password"
                            type="password"
                            placeholder="Kosongkan jika tidak ingin mengubah sandi"
                            value={profileForm.password}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    password: e.target.value,
                                }))
                            }
                            disabled={profileSaving}
                        />
                    </div>

                    <div className="supplier-form-group">
                        <label htmlFor="supplier-password-confirm">
                            Konfirmasi Kata Sandi Baru
                        </label>
                        <input
                            id="supplier-password-confirm"
                            type="password"
                            placeholder="Ulangi kata sandi baru"
                            value={profileForm.password_confirmation}
                            onChange={(e) =>
                                setProfileForm((prev) => ({
                                    ...prev,
                                    password_confirmation: e.target.value,
                                }))
                            }
                            disabled={profileSaving}
                        />
                    </div>
                </div>

                <div
                    style={{
                        marginTop: '20px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <button
                        type="submit"
                        className="supplier-btn supplier-btn-success"
                        disabled={profileSaving}
                    >
                        {profileSaving
                            ? 'Menyimpan...'
                            : 'Simpan Perubahan Profil'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default VendorProfile;
