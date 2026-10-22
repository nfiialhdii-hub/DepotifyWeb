import {
    formatDate,
    formatPaymentMethod,
    formatRupiah,
    getAvailableSupplierActions,
    getStatusMeta,
} from './helpers';

function OrderDetailModal({
    order,
    notesInput,
    onNotesChange,
    statusUpdating,
    onClose,
    onUpdateStatus,
}) {
    if (!order) return null;

    const statusMeta = getStatusMeta(order.status);
    const availableActions = getAvailableSupplierActions(order.status);

    return (
        <div
            className="supplier-modal-backdrop"
            onClick={() => !statusUpdating && onClose()}
        >
            <div
                className="supplier-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="supplier-modal-header">
                    <div>
                        <p className="supplier-eyebrow">
                            RINCIAN PURCHASE ORDER
                        </p>
                        <h3>{order.po_number}</h3>
                    </div>

                    <span className={`supplier-badge ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                    </span>
                </div>

                <div className="supplier-detail-grid">
                    <div className="supplier-detail-item">
                        <span>Tanggal Pesanan</span>
                        <strong>{formatDate(order.po_date)}</strong>
                    </div>

                    <div className="supplier-detail-item">
                        <span>Pemesan / Pihak Depot</span>
                        <strong>
                            {order.creator?.name || 'Depotify Owner'}
                        </strong>
                    </div>

                    <div className="supplier-detail-item">
                        <span>Metode Pembayaran</span>
                        <strong>
                            {formatPaymentMethod(order.payment_method)}
                        </strong>
                    </div>

                    <div className="supplier-detail-item">
                        <span>Total Nilai Pesanan</span>
                        <strong>{formatRupiah(order.total_price)}</strong>
                    </div>

                    <div
                        className="supplier-detail-item"
                        style={{ gridColumn: '1 / -1' }}
                    >
                        <span>Alamat Pengiriman Depot</span>
                        <strong>
                            {order.shipping_address ||
                                'Alamat utama depot (belum dicantumkan khusus)'}
                        </strong>
                    </div>
                </div>

                {/* Daftar Item Produk */}
                <div className="supplier-table-wrap">
                    <table className="supplier-table">
                        <thead>
                            <tr>
                                <th>Nama Produk</th>
                                <th>Keterangan</th>
                                <th>Kuantitas</th>
                                <th>Harga Satuan</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.isArray(order.items) &&
                            order.items.length > 0 ? (
                                order.items.map((item) => (
                                    <tr
                                        key={
                                            item.id ||
                                            `${order.id}-${item.product_id}`
                                        }
                                    >
                                        <td>
                                            <strong>{item.product_name}</strong>
                                        </td>
                                        <td>
                                            {item.product_description || '-'}
                                        </td>
                                        <td>
                                            <strong>{item.qty_ordered}</strong>
                                        </td>
                                        <td>
                                            {formatRupiah(item.agreed_price)}
                                        </td>
                                        <td>
                                            <strong>
                                                {formatRupiah(item.total_price)}
                                            </strong>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5}>
                                        Tidak ada item produk pada pesanan ini.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Catatan Pesanan */}
                <div
                    className="supplier-form-group full"
                    style={{ marginTop: '18px' }}
                >
                    <label htmlFor="po-supplier-notes">
                        Catatan Pesanan / Pengiriman
                    </label>
                    <textarea
                        id="po-supplier-notes"
                        rows={2}
                        placeholder="Tambahkan catatan konfirmasi atau informasi pengiriman..."
                        value={notesInput}
                        onChange={(e) => onNotesChange(e.target.value)}
                        disabled={statusUpdating || availableActions.length === 0}
                    />
                </div>

                {/* Tombol Aksi Perubahan Status */}
                <div className="supplier-modal-actions">
                    <button
                        type="button"
                        className="supplier-btn supplier-btn-secondary"
                        onClick={onClose}
                        disabled={statusUpdating}
                    >
                        Tutup
                    </button>

                    <div className="supplier-action-group">
                        {availableActions.map((action) => (
                            <button
                                key={action.nextStatus}
                                type="button"
                                className={`supplier-btn ${action.variant}`}
                                disabled={statusUpdating}
                                onClick={() =>
                                    onUpdateStatus(
                                        order.id,
                                        action.nextStatus,
                                        notesInput
                                    )
                                }
                            >
                                {statusUpdating ? 'Memproses...' : action.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OrderDetailModal;
