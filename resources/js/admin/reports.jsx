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
                ? '<tr><td colspan="5" class="text-center">Belum ada produk terjual pada periode ini.</td></tr>'
                : bestSelling
                      .map(
                          (p, idx) => `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td>${p.name}${p.variant ? ` (${p.variant})` : ''}</td>
                        <td class="text-center">${p.total_qty_sold}</td>
                        <td class="text-right">${rupiah(p.total_revenue)}</td>
                        <td class="text-center">${p.stock_content}</td>
                    </tr>`
                      )
                      .join('');

        const leastRows =
            leastSelling.length === 0
                ? '<tr><td colspan="5" class="text-center">Belum ada data produk.</td></tr>'
                : leastSelling
                      .map(
                          (p, idx) => `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td>${p.name}${p.variant ? ` (${p.variant})` : ''}</td>
                        <td class="text-center">${p.total_qty_sold}</td>
                        <td class="text-right">${rupiah(p.total_revenue)}</td>
                        <td class="text-center">${p.stock_content}</td>
                    </tr>`
                      )
                      .join('');

        const incomeRows =
            incomeList.length === 0
                ? '<tr><td colspan="6" class="text-center">Tidak ada data pemasukan pada periode ini.</td></tr>'
                : incomeList
                      .map(
                          (item, idx) => `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td>${item.code}</td>
                        <td>${formatDate(item.date)}</td>
                        <td>${item.party_name}</td>
                        <td>${item.items_summary || '-'}</td>
                        <td class="text-right">${rupiah(item.amount)}</td>
                    </tr>`
                      )
                      .join('');

        const expenseRows =
            expenseList.length === 0
                ? '<tr><td colspan="6" class="text-center">Tidak ada data pengeluaran pada periode ini.</td></tr>'
                : expenseList
                      .map(
                          (item, idx) => `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td>${item.code}</td>
                        <td>${formatDate(item.date)}</td>
                        <td>${item.party_name}</td>
                        <td>${item.items_summary || '-'}</td>
                        <td class="text-right">${rupiah(item.amount)}</td>
                    </tr>`
                      )
                      .join('');

        const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8" />
    <title>Laporan Keuangan Depotify - ${periodInfo.label || 'Semua Waktu'}</title>
    <style>
        @page { size: A4; margin: 16mm 15mm; }
        * { box-sizing: border-box; }
        body {
            font-family: 'Times New Roman', Times, serif;
            color: #000000;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 11pt;
            line-height: 1.4;
        }
        .doc-header {
            text-align: center;
            border-bottom: 3px double #000000;
            padding-bottom: 10px;
            margin-bottom: 16px;
        }
        .doc-header h1 {
            margin: 0;
            font-size: 16pt;
            font-weight: bold;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .doc-header h2 {
            margin: 4px 0 2px;
            font-size: 12.5pt;
            font-weight: bold;
            text-transform: uppercase;
        }
        .doc-header p {
            margin: 0;
            font-size: 10pt;
        }
        .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 10.5pt;
        }
        .meta-table td {
            border: none;
            padding: 2px 0;
        }
        .section-title {
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            margin: 16px 0 6px;
            padding-bottom: 2px;
            border-bottom: 1px solid #000000;
        }
        table.formal-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 10pt;
        }
        table.formal-table th,
        table.formal-table td {
            border: 1px solid #000000;
            padding: 5px 7px;
            text-align: left;
            vertical-align: top;
            color: #000000;
        }
        table.formal-table th {
            background-color: #efefef;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 9.5pt;
        }
        table.formal-table tfoot td {
            font-weight: bold;
            background-color: #f7f7f7;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold; }
        .two-col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }
        .signature-wrap {
            margin-top: 28px;
            display: flex;
            justify-content: flex-end;
            page-break-inside: avoid;
        }
        .sig-box {
            text-align: center;
            width: 220px;
            font-size: 10.5pt;
        }
        .sig-space {
            height: 60px;
        }
        .sig-name {
            font-weight: bold;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="doc-header">
        <h1>DEPOTIFY</h1>
        <h2>Laporan Keuangan dan Penjualan Operasional Depot</h2>
        <p>Sistem Informasi Manajemen Inventori &amp; Distribusi Air Mineral dan Gas LPG</p>
    </div>

    <table class="meta-table">
        <tr>
            <td style="width: 130px;"><strong>Periode Laporan</strong></td>
            <td style="width: 10px;">:</td>
            <td>${periodInfo.label || 'Semua Waktu'}</td>
            <td style="width: 130px;"><strong>Tanggal Cetak</strong></td>
            <td style="width: 10px;">:</td>
            <td>${formatDate(new Date().toISOString())}</td>
        </tr>
        <tr>
            <td><strong>Penanggung Jawab</strong></td>
            <td>:</td>
            <td>${ownerName}</td>
            <td><strong>Status Kas</strong></td>
            <td>:</td>
            <td>${summary.net_balance >= 0 ? 'Surplus / Laba' : 'Defisit / Rugi'}</td>
        </tr>
    </table>

    <div class="section-title">I. Ringkasan Rekapitulasi Keuangan</div>
    <table class="formal-table">
        <thead>
            <tr>
                <th class="text-center" style="width: 40px;">No</th>
                <th>Komponen Keuangan</th>
                <th>Keterangan</th>
                <th class="text-right" style="width: 170px;">Jumlah (Rp)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="text-center">1</td>
                <td class="font-bold">Total Pemasukan</td>
                <td>Akumulasi transaksi penjualan pelanggan selesai (${summary.completed_sales_count || 0} transaksi)</td>
                <td class="text-right font-bold">${rupiah(summary.total_income)}</td>
            </tr>
            <tr>
                <td class="text-center">2</td>
                <td class="font-bold">Total Pengeluaran</td>
                <td>Akumulasi pembelian stok / PO supplier diterima (${summary.completed_po_count || 0} PO)</td>
                <td class="text-right font-bold">${rupiah(summary.total_expense)}</td>
            </tr>
            <tr>
                <td class="text-center">3</td>
                <td class="font-bold">Laba Bersih</td>
                <td>Selisih positif pendapatan terhadap pengeluaran operasional</td>
                <td class="text-right font-bold">${rupiah(summary.net_profit)}</td>
            </tr>
            <tr>
                <td class="text-center">4</td>
                <td class="font-bold">Rugi</td>
                <td>Selisih beban pengadaan apabila pengeluaran melebihi pemasukan</td>
                <td class="text-right font-bold">${rupiah(summary.net_loss)}</td>
            </tr>
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" class="text-right">SALDO KAS BERSIH (PEMASUKAN - PENGELUARAN)</td>
                <td class="text-right">${rupiah(summary.net_balance)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="two-col">
        <div>
            <div class="section-title">II.A. Daftar Barang Paling Laku</div>
            <table class="formal-table">
                <thead>
                    <tr>
                        <th class="text-center" style="width: 32px;">No</th>
                        <th>Nama Produk</th>
                        <th class="text-center" style="width: 55px;">Terjual</th>
                        <th class="text-right" style="width: 105px;">Pendapatan</th>
                        <th class="text-center" style="width: 48px;">Stok</th>
                    </tr>
                </thead>
                <tbody>${bestRows}</tbody>
            </table>
        </div>
        <div>
            <div class="section-title">II.B. Daftar Barang Jarang Dibeli</div>
            <table class="formal-table">
                <thead>
                    <tr>
                        <th class="text-center" style="width: 32px;">No</th>
                        <th>Nama Produk</th>
                        <th class="text-center" style="width: 55px;">Terjual</th>
                        <th class="text-right" style="width: 105px;">Pendapatan</th>
                        <th class="text-center" style="width: 48px;">Stok</th>
                    </tr>
                </thead>
                <tbody>${leastRows}</tbody>
            </table>
        </div>
    </div>

    <div class="section-title">III. Rincian Transaksi Pemasukan (Penjualan Pelanggan)</div>
    <table class="formal-table">
        <thead>
            <tr>
                <th class="text-center" style="width: 36px;">No</th>
                <th style="width: 125px;">Kode Transaksi</th>
                <th style="width: 110px;">Tanggal</th>
                <th style="width: 130px;">Nama Pelanggan</th>
                <th>Rincian Barang</th>
                <th class="text-right" style="width: 130px;">Nominal (Rp)</th>
            </tr>
        </thead>
        <tbody>${incomeRows}</tbody>
        <tfoot>
            <tr>
                <td colspan="5" class="text-right">TOTAL PEMASUKAN</td>
                <td class="text-right">${rupiah(summary.total_income)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="section-title">IV. Rincian Transaksi Pengeluaran (Pembelian Supplier / PO)</div>
    <table class="formal-table">
        <thead>
            <tr>
                <th class="text-center" style="width: 36px;">No</th>
                <th style="width: 125px;">Nomor PO</th>
                <th style="width: 110px;">Tanggal</th>
                <th style="width: 130px;">Nama Supplier</th>
                <th>Rincian Barang</th>
                <th class="text-right" style="width: 130px;">Nominal (Rp)</th>
            </tr>
        </thead>
        <tbody>${expenseRows}</tbody>
        <tfoot>
            <tr>
                <td colspan="5" class="text-right">TOTAL PENGELUARAN</td>
                <td class="text-right">${rupiah(summary.total_expense)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="signature-wrap">
        <div class="sig-box">
            <div>Mengetahui / Menyetujui,</div>
            <div>Penanggung Jawab Depot</div>
            <div class="sig-space"></div>
            <div class="sig-name">${ownerName}</div>
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
