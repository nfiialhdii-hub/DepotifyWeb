import { useCallback, useEffect, useState } from 'react';
import '../../css/admin-modules.css';
import { emitSessionInvalidated, fetchWithTimeout } from '../utils/session';

const ITEMS_PER_PAGE = 10;

function rupiah(value) {
    return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(d);
}

export default function Reports({ user }) {
    const [period, setPeriod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Tab rincian kas: 'income' | 'expense'
    const [cashTab, setCashTab] = useState('income');
    const [cashPage, setCashPage] = useState(1);

    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchReport = useCallback(async () => {
        const token = localStorage.getItem('depotify_token');
        if (!token) {
            emitSessionInvalidated(
                'missing_token',
                'Token login tidak ditemukan. Silakan login kembali.'
            );
            return;
        }

        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams({ period });
            if (period === 'custom' && startDate && endDate) {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            }

            const response = await fetchWithTimeout(
                `/api/v1/reports?${params.toString()}`,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                },
                20000
            );

            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                emitSessionInvalidated(
                    'unauthorized',
                    'Sesi login Anda telah berakhir. Silakan login kembali.'
                );
                return;
            }

            if (!response.ok) {
                throw new Error(
                    result?.message || 'Gagal memuat laporan.'
                );
            }

            setReport(result?.data || null);
        } catch (err) {
            setError(err.message || 'Gagal mengambil data laporan.');
        } finally {
            setLoading(false);
        }
    }, [period, startDate, endDate]);

    useEffect(() => {
        if (period !== 'custom' || (startDate && endDate)) {
            fetchReport();
        }
    }, [fetchReport, period, startDate, endDate]);

    const handleExportPdf = () => {
        if (!report) return;

        const summary = report.summary || {};
        const bestSelling = report.best_selling_products || [];
        const leastSelling = report.least_selling_products || [];
        const incomeList = report.income_list || [];
        const expenseList = report.expense_list || [];
        const periodInfo = report.period || {};
        const ownerName = user?.name || 'Owner Depotify';

        const bestRows =
            bestSelling.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Belum ada produk terjual</td></tr>'
                : bestSelling
                      .map(
                          (p, idx) => `
                    <tr>
                        <td style="text-align:center;font-weight:700;">#${idx + 1}</td>
                        <td><strong>${p.name}</strong>${p.variant ? ` (${p.variant})` : ''}</td>
                        <td style="text-align:center;font-weight:700;">${p.total_qty_sold}</td>
                        <td style="text-align:right;font-weight:700;">${rupiah(p.total_revenue)}</td>
                        <td style="text-align:center;">${p.stock_content}</td>
                    </tr>`
                      )
                      .join('');

        const leastRows =
            leastSelling.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Belum ada data produk</td></tr>'
                : leastSelling
                      .map(
                          (p, idx) => `
                    <tr>
                        <td style="text-align:center;font-weight:700;">#${idx + 1}</td>
                        <td><strong>${p.name}</strong>${p.variant ? ` (${p.variant})` : ''}</td>
                        <td style="text-align:center;font-weight:700;">${p.total_qty_sold}</td>
                        <td style="text-align:right;">${rupiah(p.total_revenue)}</td>
                        <td style="text-align:center;">${p.stock_content}</td>
                    </tr>`
                      )
                      .join('');

        const incomeRows =
            incomeList.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Belum ada pemasukan</td></tr>'
                : incomeList
                      .map(
                          (item) => `
                    <tr>
                        <td><strong>${item.code}</strong></td>
                        <td>${formatDate(item.date)}</td>
                        <td>${item.party_name}</td>
                        <td>${item.items_summary || '-'}</td>
                        <td style="text-align:right;font-weight:700;color:#15803d;">+ ${rupiah(item.amount)}</td>
                    </tr>`
                      )
                      .join('');

        const expenseRows =
            expenseList.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Belum ada pengeluaran</td></tr>'
                : expenseList
                      .map(
                          (item) => `
                    <tr>
                        <td><strong>${item.code}</strong></td>
                        <td>${formatDate(item.date)}</td>
                        <td>${item.party_name}</td>
                        <td>${item.items_summary || '-'}</td>
                        <td style="text-align:right;font-weight:700;color:#dc2626;">- ${rupiah(item.amount)}</td>
                    </tr>`
                      )
                      .join('');

        const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8" />
    <title>Laporan Depotify - ${periodInfo.label || 'Semua Waktu'}</title>
    <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { color: #1e293b; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; }
        .brand h1 { margin: 0; font-size: 22px; color: #0284c7; }
        .meta { text-align: right; font-size: 11.5px; color: #334155; }
        .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 18px; }
        .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; }
        .card span { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .card strong { display: block; font-size: 14px; margin-top: 4px; color: #0f172a; }
        h2 { font-size: 13px; text-transform: uppercase; color: #0f172a; margin: 16px 0 8px; border-left: 4px solid #16a34a; padding-left: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #e2e8f0; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .signature { margin-top: 28px; display: flex; justify-content: flex-end; }
        .sig-box { text-align: center; width: 200px; }
        .sig-space { height: 50px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">
            <h1>DEPOTIFY</h1>
            <div>Laporan Keuangan & Penjualan Depot</div>
        </div>
        <div class="meta">
            Periode: <strong>${periodInfo.label || 'Semua Waktu'}</strong><br/>
            Dicetak: ${formatDate(new Date().toISOString())}
        </div>
    </div>

    <div class="summary-grid">
        <div class="card">
            <span>Pemasukan</span>
            <strong style="color:#15803d;">${rupiah(summary.total_income)}</strong>
        </div>
        <div class="card">
            <span>Pengeluaran</span>
            <strong style="color:#dc2626;">${rupiah(summary.total_expense)}</strong>
        </div>
        <div class="card">
            <span>Laba Bersih</span>
            <strong style="color:#15803d;">${rupiah(summary.net_profit)}</strong>
        </div>
        <div class="card">
            <span>Rugi</span>
            <strong style="color:#dc2626;">${rupiah(summary.net_loss)}</strong>
        </div>
        <div class="card">
            <span>Saldo Bersih</span>
            <strong>${rupiah(summary.net_balance)}</strong>
        </div>
    </div>

    <div class="two-col">
        <div>
            <h2>Barang Paling Laku</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Produk</th>
                        <th>Terjual</th>
                        <th>Pendapatan</th>
                        <th>Stok</th>
                    </tr>
                </thead>
                <tbody>${bestRows}</tbody>
            </table>
        </div>
        <div>
            <h2>Barang Jarang Dibeli</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Produk</th>
                        <th>Terjual</th>
                        <th>Pendapatan</th>
                        <th>Stok</th>
                    </tr>
                </thead>
                <tbody>${leastRows}</tbody>
            </table>
        </div>
    </div>

    <h2>Pemasukan (Penjualan Customer)</h2>
    <table>
        <thead>
            <tr>
                <th>Kode</th>
                <th>Tanggal</th>
                <th>Customer</th>
                <th>Barang</th>
                <th style="text-align:right;">Nominal</th>
            </tr>
        </thead>
        <tbody>${incomeRows}</tbody>
    </table>

    <h2>Pengeluaran (Pembelian Supplier)</h2>
    <table>
        <thead>
            <tr>
                <th>Nomor PO</th>
                <th>Tanggal</th>
                <th>Supplier</th>
                <th>Barang</th>
                <th style="text-align:right;">Nominal</th>
            </tr>
        </thead>
        <tbody>${expenseRows}</tbody>
    </table>

    <div class="signature">
        <div class="sig-box">
            <div>Mengetahui,</div>
            <div class="sig-space"></div>
            <strong>${ownerName}</strong>
        </div>
    </div>

    <script>
        window.onload = function () {
            setTimeout(function () { window.print(); }, 250);
        };
    </script>
</body>
</html>`;

        const printWin = window.open('', '_blank', 'width=1024,height=800');
        if (!printWin) {
            alert('Izinkan pop-up pada browser untuk mengunduh PDF.');
            return;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
    };

    const summary = report?.summary || {};
    const bestSelling = report?.best_selling_products || [];
    const leastSelling = report?.least_selling_products || [];
    const incomeList = report?.income_list || [];
    const expenseList = report?.expense_list || [];

    const activeCashList = cashTab === 'income' ? incomeList : expenseList;
    const totalCashPages = Math.max(
        1,
        Math.ceil(activeCashList.length / ITEMS_PER_PAGE)
    );
    const currentCashPage = Math.min(cashPage, totalCashPages);
    const pagedCashList = activeCashList.slice(
        (currentCashPage - 1) * ITEMS_PER_PAGE,
        currentCashPage * ITEMS_PER_PAGE
    );

    return (
        <section className="adm-page">
            <div className="adm-header">
                <div className="adm-header-title">
                    <h1>Laporan</h1>
                </div>

                <div className="adm-header-actions">
                    <button
                        type="button"
                        className="adm-btn-secondary"
                        onClick={fetchReport}
                        disabled={loading}
                    >
                        ↻ Segarkan
                    </button>

                    <button
                        type="button"
                        className="adm-btn-primary"
                        onClick={handleExportPdf}
                        disabled={loading || !report}
                    >
                        ⬇ Convert PDF
                    </button>
                </div>
            </div>

            {/* FILTER PERIODE */}
            <div className="adm-filter-bar">
                <div className="adm-tabs">
                    {[
                        { id: 'all', label: 'Semua Waktu' },
                        { id: 'today', label: 'Hari Ini' },
                        { id: '7d', label: '7 Hari' },
                        { id: 'month', label: 'Bulan Ini' },
                        { id: 'custom', label: 'Pilih Tanggal' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`adm-tab-btn ${period === tab.id ? 'active' : ''}`}
                            onClick={() => setPeriod(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {period === 'custom' && (
                    <div
                        style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                        }}
                    >
                        <input
                            type="date"
                            className="adm-date-input"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span>-</span>
                        <input
                            type="date"
                            className="adm-date-input"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {error && (
                <div className="adm-panel" style={{ color: '#dc2626' }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div className="adm-panel">
                    <div className="adm-empty">Memuat laporan...</div>
                </div>
            ) : (
                <>
                    {/* 5 KARTU UTAMA (VERTIKAL & CLEAN) */}
                    <div className="adm-metrics-grid cols-5">
                        <div className="adm-metric-card">
                            <span className="adm-metric-label">
                                Pemasukan
                            </span>
                            <strong className="adm-metric-value green">
                                {rupiah(summary.total_income)}
                            </strong>
                        </div>

                        <div className="adm-metric-card">
                            <span className="adm-metric-label">
                                Pengeluaran
                            </span>
                            <strong className="adm-metric-value red">
                                {rupiah(summary.total_expense)}
                            </strong>
                        </div>

                        <div className="adm-metric-card">
                            <span className="adm-metric-label">
                                Laba Bersih
                            </span>
                            <strong className="adm-metric-value green">
                                {rupiah(summary.net_profit)}
                            </strong>
                        </div>

                        <div className="adm-metric-card">
                            <span className="adm-metric-label">Rugi</span>
                            <strong className="adm-metric-value red">
                                {rupiah(summary.net_loss)}
                            </strong>
                        </div>

                        <div className="adm-metric-card">
                            <span className="adm-metric-label">
                                Saldo Bersih
                            </span>
                            <strong
                                className={`adm-metric-value ${
                                    summary.net_balance >= 0 ? 'blue' : 'red'
                                }`}
                            >
                                {rupiah(summary.net_balance)}
                            </strong>
                        </div>
                    </div>

                    {/* BARANG PALING LAKU & BARANG JARANG DIBELI */}
                    <div className="adm-two-grid">
                        <div className="adm-panel" style={{ marginBottom: 0 }}>
                            <div className="adm-panel-head">
                                <h3>Barang Paling Laku</h3>
                                <span className="adm-badge green">
                                    Terlaris
                                </span>
                            </div>

                            {bestSelling.length === 0 ? (
                                <div className="adm-empty">
                                    Belum ada produk yang terjual.
                                </div>
                            ) : (
                                <div className="adm-table-wrap">
                                    <table className="adm-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Produk</th>
                                                <th>Terjual</th>
                                                <th>Pendapatan</th>
                                                <th>Stok</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bestSelling.map((prod, idx) => (
                                                <tr key={prod.id}>
                                                    <td>
                                                        <strong>
                                                            #{idx + 1}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {prod.name}
                                                            {prod.variant
                                                                ? ` · ${prod.variant}`
                                                                : ''}
                                                        </strong>
                                                        <small>
                                                            {
                                                                prod.category_name
                                                            }
                                                        </small>
                                                    </td>
                                                    <td>
                                                        <span className="adm-badge green">
                                                            {
                                                                prod.total_qty_sold
                                                            }{' '}
                                                            unit
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {rupiah(
                                                                prod.total_revenue
                                                            )}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {prod.stock_content}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="adm-panel" style={{ marginBottom: 0 }}>
                            <div className="adm-panel-head">
                                <h3>Barang Jarang Dibeli</h3>
                                <span className="adm-badge red">
                                    Jarang Laku
                                </span>
                            </div>

                            {leastSelling.length === 0 ? (
                                <div className="adm-empty">
                                    Belum ada data produk.
                                </div>
                            ) : (
                                <div className="adm-table-wrap">
                                    <table className="adm-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Produk</th>
                                                <th>Terjual</th>
                                                <th>Pendapatan</th>
                                                <th>Stok</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leastSelling.map((prod, idx) => (
                                                <tr key={prod.id}>
                                                    <td>
                                                        <strong>
                                                            #{idx + 1}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {prod.name}
                                                            {prod.variant
                                                                ? ` · ${prod.variant}`
                                                                : ''}
                                                        </strong>
                                                        <small>
                                                            {
                                                                prod.category_name
                                                            }
                                                        </small>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`adm-badge ${
                                                                prod.total_qty_sold ===
                                                                0
                                                                    ? 'red'
                                                                    : 'amber'
                                                            }`}
                                                        >
                                                            {
                                                                prod.total_qty_sold
                                                            }{' '}
                                                            unit
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong>
                                                            {rupiah(
                                                                prod.total_revenue
                                                            )}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {prod.stock_content}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SLIDE PEMASUKAN & PENGELUARAN */}
                    <div className="adm-panel">
                        <div className="adm-panel-head">
                            <div className="adm-tabs">
                                <button
                                    type="button"
                                    className={`adm-tab-btn ${
                                        cashTab === 'income' ? 'active' : ''
                                    }`}
                                    onClick={() => {
                                        setCashTab('income');
                                        setCashPage(1);
                                    }}
                                >
                                    Pemasukan ({incomeList.length})
                                </button>
                                <button
                                    type="button"
                                    className={`adm-tab-btn ${
                                        cashTab === 'expense' ? 'active' : ''
                                    }`}
                                    onClick={() => {
                                        setCashTab('expense');
                                        setCashPage(1);
                                    }}
                                >
                                    Pengeluaran ({expenseList.length})
                                </button>
                            </div>
                        </div>

                        {pagedCashList.length === 0 ? (
                            <div className="adm-empty">
                                {cashTab === 'income'
                                    ? 'Belum ada pemasukan.'
                                    : 'Belum ada pengeluaran.'}
                            </div>
                        ) : (
                            <>
                                <div className="adm-table-wrap">
                                    <table className="adm-table">
                                        <thead>
                                            <tr>
                                                <th>Kode</th>
                                                <th>Tanggal</th>
                                                <th>
                                                    {cashTab === 'income'
                                                        ? 'Customer'
                                                        : 'Supplier'}
                                                </th>
                                                <th>Barang</th>
                                                <th>Nominal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedCashList.map((item) => (
                                                <tr key={item.id}>
                                                    <td>
                                                        <strong>
                                                            {item.code}
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {formatDate(item.date)}
                                                    </td>
                                                    <td>{item.party_name}</td>
                                                    <td>
                                                        {item.items_summary ||
                                                            '-'}
                                                    </td>
                                                    <td>
                                                        <strong
                                                            style={{
                                                                color:
                                                                    cashTab ===
                                                                    'income'
                                                                        ? '#15803d'
                                                                        : '#dc2626',
                                                            }}
                                                        >
                                                            {cashTab ===
                                                            'income'
                                                                ? '+ '
                                                                : '- '}
                                                            {rupiah(
                                                                item.amount
                                                            )}
                                                        </strong>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {totalCashPages > 1 && (
                                    <div className="adm-pagination">
                                        <span className="adm-pagination-info">
                                            Halaman {currentCashPage} dari{' '}
                                            {totalCashPages}
                                        </span>
                                        <div className="adm-pagination-btns">
                                            <button
                                                type="button"
                                                className="adm-btn-secondary adm-btn-sm"
                                                disabled={currentCashPage <= 1}
                                                onClick={() =>
                                                    setCashPage((p) =>
                                                        Math.max(1, p - 1)
                                                    )
                                                }
                                            >
                                                ‹ Sebelumnya
                                            </button>
                                            <button
                                                type="button"
                                                className="adm-btn-secondary adm-btn-sm"
                                                disabled={
                                                    currentCashPage >=
                                                    totalCashPages
                                                }
                                                onClick={() =>
                                                    setCashPage((p) =>
                                                        Math.min(
                                                            totalCashPages,
                                                            p + 1
                                                        )
                                                    )
                                                }
                                            >
                                                Selanjutnya ›
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
