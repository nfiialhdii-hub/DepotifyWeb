import { useEffect, useState } from 'react';

import '../css/dashboard.css';

import Sidebar from './components/sidebar';
import Products from './product';


function Dashboard({ onLogout }) {

    const [activePage, setActivePage] = useState('dashboard');

    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');


    // =========================
    // FETCH DASHBOARD
    // =========================

    const fetchDashboard = async () => {

        try {

            setLoading(true);
            setError('');

            const token =
                localStorage.getItem('depotify_token');

            if (!token) {
                throw new Error(
                    'Token login tidak ditemukan.'
                );
            }


            const response = await fetch(
                'http://127.0.0.1:8000/api/v1/dashboard',
                {
                    method: 'GET',

                    headers: {
                        Accept: 'application/json',

                        Authorization:
                            `Bearer ${token}`,
                    },
                }
            );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result.message ||
                    'Gagal mengambil data dashboard.'
                );

            }


            setDashboard(result.data);

        } catch (error) {

            console.error(
                'DASHBOARD ERROR:',
                error
            );

            setError(error.message);

        } finally {

            setLoading(false);

        }

    };


    // =========================
    // LOAD DASHBOARD
    // =========================

    useEffect(() => {

        if (activePage === 'dashboard') {
            fetchDashboard();
        }

    }, [activePage]);


    // =========================
    // LOGOUT
    // =========================

    const handleLogout = async () => {

        try {

            const token =
                localStorage.getItem(
                    'depotify_token'
                );


            if (token) {

                await fetch(
                    'http://127.0.0.1:8000/api/v1/auth/logout',
                    {
                        method: 'POST',

                        headers: {
                            Accept:
                                'application/json',

                            Authorization:
                                `Bearer ${token}`,
                        },
                    }
                );

            }

        } catch (error) {

            console.error(
                'LOGOUT ERROR:',
                error
            );

        } finally {

            localStorage.removeItem(
                'depotify_token'
            );

            localStorage.removeItem(
                'depotify_user'
            );

            onLogout();

        }

    };


    // =========================
    // FORMAT RUPIAH
    // =========================

    const formatRupiah = (value) => {

        return `Rp ${Number(
            value || 0
        ).toLocaleString('id-ID')}`;

    };


    // =========================
    // DASHBOARD CONTENT
    // =========================

    const renderDashboard = () => {

        if (loading) {

            return (
                <div className="dashboard-loading">
                    Memuat dashboard...
                </div>
            );

        }


        if (error) {

            return (
                <div className="dashboard-error">

                    <h3>
                        Gagal memuat dashboard
                    </h3>

                    <p>
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={fetchDashboard}
                    >
                        Coba Lagi
                    </button>

                </div>
            );

        }


        if (!dashboard) {
            return null;
        }


        const summary =
            dashboard.summary;


        return (
            <>

                {/* =========================
                    HEADER
                ========================= */}

                <div className="dashboard-header">

                    <div>

                        <p className="dashboard-label">
                            OVERVIEW
                        </p>

                        <h1>
                            Dashboard
                        </h1>

                        <p>
                            Ringkasan aktivitas depot hari ini.
                        </p>

                    </div>


                    <div className="dashboard-user">

                        <div className="user-avatar">
                            O
                        </div>

                        <div>

                            <strong>
                                Owner
                            </strong>

                            <span>
                                Administrator
                            </span>

                        </div>

                    </div>

                </div>


                {/* =========================
                    SUMMARY CARDS
                ========================= */}

                <div className="summary-grid">

                    {/* TRANSAKSI */}

                    <div className="summary-card">

                        <div className="summary-card-top">

                            <span>
                                Transaksi Hari Ini
                            </span>

                            <span className="summary-icon">
                                ↗
                            </span>

                        </div>

                        <h2>
                            {summary.today_transactions}
                        </h2>

                        <p>
                            transaksi selesai
                        </p>

                    </div>


                    {/* PENDAPATAN */}

                    <div className="summary-card">

                        <div className="summary-card-top">

                            <span>
                                Pendapatan Hari Ini
                            </span>

                            <span className="summary-icon">
                                Rp
                            </span>

                        </div>

                        <h2>
                            {formatRupiah(
                                summary.today_revenue
                            )}
                        </h2>

                        <p>
                            total penjualan
                        </p>

                    </div>


                    {/* PRODUK */}

                    <div className="summary-card">

                        <div className="summary-card-top">

                            <span>
                                Produk Aktif
                            </span>

                            <span className="summary-icon">
                                □
                            </span>

                        </div>

                        <h2>
                            {summary.total_products}
                        </h2>

                        <p>
                            produk tersedia
                        </p>

                    </div>


                    {/* STOK */}

                    <div className="summary-card warning">

                        <div className="summary-card-top">

                            <span>
                                Stok Menipis
                            </span>

                            <span className="summary-icon">
                                !
                            </span>

                        </div>

                        <h2>
                            {summary.low_stock_products}
                        </h2>

                        <p>
                            perlu diperhatikan
                        </p>

                    </div>

                </div>


                {/* =========================
                    SALES CHART
                ========================= */}

                <div className="dashboard-section">

                    <div className="section-header">

                        <div>

                            <p className="section-label">
                                PERFORMA
                            </p>

                            <h2>
                                Penjualan 7 Hari Terakhir
                            </h2>

                        </div>

                    </div>


                    <div className="sales-chart">

                        {dashboard.sales_chart.map(
                            (item) => {

                                const maxRevenue =
                                    Math.max(
                                        ...dashboard.sales_chart.map(
                                            (data) =>
                                                Number(
                                                    data.total_revenue
                                                )
                                        ),
                                        1
                                    );


                                const height =
                                    (
                                        Number(
                                            item.total_revenue
                                        ) /
                                        maxRevenue
                                    ) * 100;


                                return (
                                    <div
                                        className="chart-column"
                                        key={item.date}
                                    >

                                        <div className="chart-value">
                                            {formatRupiah(
                                                item.total_revenue
                                            )}
                                        </div>


                                        <div className="chart-bar-wrapper">

                                            <div
                                                className="chart-bar"
                                                style={{
                                                    height:
                                                        `${Math.max(
                                                            height,
                                                            item.total_revenue > 0
                                                                ? 8
                                                                : 2
                                                        )}%`,
                                                }}
                                            />

                                        </div>


                                        <span>
                                            {item.label}
                                        </span>

                                    </div>
                                );

                            }
                        )}

                    </div>

                </div>


                {/* =========================
                    LOW STOCK + TOP PRODUCTS
                ========================= */}

                <div className="dashboard-bottom-grid">

                    {/* LOW STOCK */}

                    <div className="dashboard-section">

                        <div className="section-header">

                            <div>

                                <p className="section-label">
                                    PERSEDIAAN
                                </p>

                                <h2>
                                    Stok Menipis
                                </h2>

                            </div>

                        </div>


                        {dashboard.low_stock.length === 0 ? (

                            <div className="empty-dashboard">
                                Tidak ada stok menipis.
                            </div>

                        ) : (

                            <div className="stock-list">

                                {dashboard.low_stock.map(
                                    (product) => (

                                        <div
                                            className="stock-item"
                                            key={product.id}
                                        >

                                            <div>

                                                <strong>
                                                    {product.name}
                                                </strong>

                                                <span>
                                                    {product.variant}
                                                </span>

                                            </div>


                                            <div className="stock-info">

                                                <strong>
                                                    {product.stock_content}
                                                </strong>

                                                <span>
                                                    Min.{' '}
                                                    {product.minimum_stock}
                                                </span>

                                            </div>

                                        </div>

                                    )
                                )}

                            </div>

                        )}

                    </div>


                    {/* TOP PRODUCTS */}

                    <div className="dashboard-section">

                        <div className="section-header">

                            <div>

                                <p className="section-label">
                                    PENJUALAN
                                </p>

                                <h2>
                                    Produk Terlaris
                                </h2>

                            </div>

                        </div>


                        {dashboard.top_products.length === 0 ? (

                            <div className="empty-dashboard">
                                Belum ada data penjualan.
                            </div>

                        ) : (

                            <div className="stock-list">

                                {dashboard.top_products.map(
                                    (product) => (

                                        <div
                                            className="stock-item"
                                            key={product.product_id}
                                        >

                                            <div>

                                                <strong>
                                                    {product.product_name}
                                                </strong>

                                                <span>
                                                    {product.total_qty}
                                                    {' '}
                                                    unit
                                                </span>

                                            </div>


                                            <div className="stock-info">

                                                <strong>
                                                    {formatRupiah(
                                                        product.total_revenue
                                                    )}
                                                </strong>

                                            </div>

                                        </div>

                                    )
                                )}

                            </div>

                        )}

                    </div>

                </div>


                {/* =========================
                    RECENT TRANSACTIONS
                ========================= */}

                <div className="dashboard-section">

                    <div className="section-header">

                        <div>

                            <p className="section-label">
                                AKTIVITAS
                            </p>

                            <h2>
                                Transaksi Terbaru
                            </h2>

                        </div>

                    </div>


                    {dashboard.recent_transactions.length === 0 ? (

                        <div className="empty-dashboard">
                            Belum ada transaksi.
                        </div>

                    ) : (

                        <div className="transactions-list">

                            {dashboard.recent_transactions.map(
                                (transaction) => (

                                    <div
                                        className="transaction-item"
                                        key={transaction.id}
                                    >

                                        <div>

                                            <strong>
                                                {transaction.transaction_code}
                                            </strong>

                                            <span>
                                                {transaction.creator?.name ||
                                                    '-'}
                                            </span>

                                        </div>


                                        <div>

                                            <strong>
                                                {formatRupiah(
                                                    transaction.total_amount
                                                )}
                                            </strong>

                                            <span>
                                                {transaction.status}
                                            </span>

                                        </div>

                                    </div>

                                )
                            )}

                        </div>

                    )}

                </div>

            </>

        );

    };


    // =========================
    // CONTENT ROUTER
    // =========================

    const renderPage = () => {

        switch (activePage) {

            case 'products':

                return (
                    <Products />
                );

            case 'reports':

                return (
                    <div className="dashboard-placeholder">

                        <p className="dashboard-label">
                            LAPORAN
                        </p>

                        <h1>
                            Laporan
                        </h1>

                        <p>
                            Halaman laporan sedang dalam pengembangan.
                        </p>

                    </div>
                );


            case 'dashboard':

            default:

                return renderDashboard();

        }

    };


    // =========================
    // MAIN
    // =========================

    return (

        <div className="dashboard-layout">

            <Sidebar
                activePage={activePage}
                onNavigate={setActivePage}
                onLogout={handleLogout}
            />


            <main className="dashboard-main">

                {renderPage()}

            </main>

        </div>

    );

}


export default Dashboard;
