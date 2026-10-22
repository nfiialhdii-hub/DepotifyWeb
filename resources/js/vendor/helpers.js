import {
    emitSessionInvalidated,
    fetchWithTimeout,
    getStoredToken,
} from '../utils/session';

export const API_BASE = '/api/v1';

export function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value || 0));
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

export function formatPaymentMethod(method) {
    const map = {
        cash: 'Tunai',
        transfer: 'Transfer Bank',
        qris: 'QRIS',
        credit: 'Tempo / Kredit',
    };
    return map[method] || method || '-';
}

export function getStatusMeta(status) {
    switch (status) {
        case 'draft':
        case 'ordered':
            return {
                label: 'Menunggu Konfirmasi',
                badgeClass: 'pending',
                rawLabel: status === 'draft' ? 'Draft PO Baru' : 'Dipesan',
            };
        case 'confirmed':
            return {
                label: 'Dikonfirmasi (Diproses)',
                badgeClass: 'confirmed',
                rawLabel: 'Confirmed',
            };
        case 'shipped':
            return {
                label: 'Sedang Dikirim',
                badgeClass: 'shipped',
                rawLabel: 'Shipped',
            };
        case 'received':
            return {
                label: 'Selesai (Diterima)',
                badgeClass: 'received',
                rawLabel: 'Received',
            };
        case 'rejected':
            return {
                label: 'Ditolak Supplier',
                badgeClass: 'rejected',
                rawLabel: 'Rejected',
            };
        case 'cancelled':
            return {
                label: 'Dibatalkan Depot',
                badgeClass: 'cancelled',
                rawLabel: 'Cancelled',
            };
        default:
            return {
                label: status || '-',
                badgeClass: 'pending',
                rawLabel: status || '-',
            };
    }
}

export function getAvailableSupplierActions(status) {
    if (status === 'draft' || status === 'ordered') {
        return [
            {
                nextStatus: 'confirmed',
                label: 'Konfirmasi Pesanan',
                variant: 'supplier-btn-success',
            },
            {
                nextStatus: 'rejected',
                label: 'Tolak Pesanan',
                variant: 'supplier-btn-danger',
            },
        ];
    }

    if (status === 'confirmed') {
        return [
            {
                nextStatus: 'shipped',
                label: 'Tandai Dikirim',
                variant: 'supplier-btn-primary',
            },
        ];
    }

    return [];
}

/**
 * Helper request API terautentikasi untuk modul Supplier/Vendor.
 */
export async function supplierApiRequest(endpoint, options = {}) {
    const token = getStoredToken();
    if (!token) {
        emitSessionInvalidated(
            'missing_token',
            'Token autentikasi tidak ditemukan. Silakan login kembali.'
        );
        throw new Error('Token autentikasi tidak ditemukan.');
    }

    const response = await fetchWithTimeout(
        `${API_BASE}${endpoint}`,
        {
            ...options,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...(options.headers || {}),
            },
        },
        8000
    );

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
        emitSessionInvalidated(
            'unauthorized',
            'Sesi login Anda telah berakhir atau tidak valid. Silakan login kembali.'
        );
        throw new Error('Sesi berakhir. Silakan login kembali.');
    }

    if (!response.ok) {
        const firstValidation = result?.errors
            ? Object.values(result.errors).flat()[0]
            : null;

        throw new Error(
            firstValidation ||
                result?.message ||
                `Permintaan gagal diproses (HTTP ${response.status}).`
        );
    }

    return result;
}
