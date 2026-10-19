import { useEffect, useMemo, useState } from "react";
import "../css/stock.css"

const Stock = () => {
    const [stocks, setStocks] = useState([]);
    const [summary, setSummary] = useState({
        total_products: 0,
        total_stock_content: 0,
        total_empty_stock: 0,
        low_stock_products: 0,
    });

    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const token = localStorage.getItem("depotify_token");

    const fetchStocks = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                "/api/v1/stock",
                {
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Gagal mengambil data stok."
                );
            }

            setStocks(result.data.products || []);
            setSummary(
                result.data.summary || {
                    total_products: 0,
                    total_stock_content: 0,
                    total_empty_stock: 0,
                    low_stock_products: 0,
                }
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStocks();
    }, []);

    const categories = useMemo(() => {
        return [
            ...new Set(
                stocks
                    .map((stock) => stock.category)
                    .filter(Boolean)
            ),
        ];
    }, [stocks]);

    const filteredStocks = useMemo(() => {
        return stocks.filter((stock) => {
            const keyword = search.toLowerCase();

            const matchesSearch =
                stock.name?.toLowerCase().includes(keyword) ||
                stock.sku?.toLowerCase().includes(keyword);

            const matchesCategory =
                !categoryFilter ||
                stock.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });
    }, [stocks, search, categoryFilter]);

    const getStatusLabel = (status) => {
        switch (status) {
            case "aman":
                return "Aman";

            case "menipis":
                return "Menipis";

            case "habis":
                return "Habis";

            default:
                return "-";
        }
    };

    if (loading) {
        return (
            <div className="stock-page">
                <div className="stock-loading">
                    Memuat data stok...
                </div>
            </div>
        );
    }

    return (
        <div className="stock-page">

            <div className="stock-header">
                <div>
                    <h1>Stok</h1>
                    <p>
                        Pantau stok produk dan ketersediaan
                        barang depot.
                    </p>
                </div>
            </div>

            {error && (
                <div className="stock-error">
                    {error}
                </div>
            )}

            <div className="stock-summary">

                <div className="stock-summary-card">
                    <span>Total Produk</span>
                    <strong>
                        {summary.total_products}
                    </strong>
                </div>

                <div className="stock-summary-card">
                    <span>Total Stok Isi</span>
                    <strong>
                        {summary.total_stock_content}
                    </strong>
                </div>

                <div className="stock-summary-card">
                    <span>Stok Kosong</span>
                    <strong>
                        {summary.total_empty_stock}
                    </strong>
                </div>

                <div className="stock-summary-card">
                    <span>Stok Perlu Perhatian</span>
                    <strong>
                        {summary.low_stock_products}
                    </strong>
                </div>

            </div>

            <div className="stock-content">

                <div className="stock-toolbar">

                    <input
                        type="text"
                        placeholder="Cari produk atau SKU..."
                        value={search}
                        onChange={(e) =>
                            setSearch(e.target.value)
                        }
                    />

                    <select
                        value={categoryFilter}
                        onChange={(e) =>
                            setCategoryFilter(e.target.value)
                        }
                    >
                        <option value="">
                            Semua Kategori
                        </option>

                        {categories.map((category) => (
                            <option
                                key={category}
                                value={category}
                            >
                                {category}
                            </option>
                        ))}
                    </select>

                </div>

                <div className="stock-table-wrapper">

                    <table className="stock-table">

                        <thead>
                            <tr>
                                <th>Produk</th>
                                <th>SKU</th>
                                <th>Kategori</th>
                                <th>Varian</th>
                                <th>Stok Isi</th>
                                <th>Stok Kosong</th>
                                <th>Minimum</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredStocks.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="8"
                                        className="stock-empty"
                                    >
                                        Tidak ada data stok.
                                    </td>
                                </tr>
                            ) : (
                                filteredStocks.map((stock) => (
                                    <tr key={stock.id}>

                                        <td>
                                            {stock.name}
                                        </td>

                                        <td>
                                            {stock.sku || "-"}
                                        </td>

                                        <td>
                                            {stock.category || "-"}
                                        </td>

                                        <td>
                                            {stock.variant || "-"}
                                        </td>

                                        <td>
                                            {stock.stock_content}
                                        </td>

                                        <td>
                                            {stock.empty_stock}
                                        </td>

                                        <td>
                                            {stock.minimum_stock}
                                        </td>

                                        <td>
                                            <span
                                                className={`stock-status stock-status-${stock.status}`}
                                            >
                                                {getStatusLabel(
                                                    stock.status
                                                )}
                                            </span>
                                        </td>

                                    </tr>
                                ))
                            )}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>
    );
};

export default Stock;
