<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\SalesTransaction;
use App\Models\SalesTransactionItem;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReportController extends Controller
{
    /**
     * Laporan Keuangan & Penjualan Depotify (Pemasukan, Pengeluaran, Laba/Rugi Bersih,
     * Barang Paling Laku, Barang Jarang Dibeli, serta Rincian Transaksi untuk PDF).
     */
    public function index(Request $request)
    {
        $period = strtolower((string) $request->input('period', 'all'));
        $startDate = null;
        $endDate = null;
        $periodLabel = 'Semua Waktu';

        $today = Carbon::today();

        if ($period === 'today') {
            $startDate = $today->copy()->startOfDay();
            $endDate = $today->copy()->endOfDay();
            $periodLabel = 'Hari Ini (' . $today->translatedFormat('d M Y') . ')';
        } elseif ($period === '7d') {
            $startDate = $today->copy()->subDays(6)->startOfDay();
            $endDate = $today->copy()->endOfDay();
            $periodLabel = '7 Hari Terakhir (' . $startDate->format('d/m/Y') . ' - ' . $endDate->format('d/m/Y') . ')';
        } elseif ($period === 'month') {
            $startDate = $today->copy()->startOfMonth();
            $endDate = $today->copy()->endOfMonth();
            $periodLabel = 'Bulan Ini (' . $today->translatedFormat('F Y') . ')';
        } elseif ($period === 'custom' && $request->filled('start_date') && $request->filled('end_date')) {
            $startDate = Carbon::parse($request->input('start_date'))->startOfDay();
            $endDate = Carbon::parse($request->input('end_date'))->endOfDay();
            $periodLabel = $startDate->format('d/m/Y') . ' s/d ' . $endDate->format('d/m/Y');
        }

        // 1. Query Transaksi Penjualan (Pemasukan / Pendapatan dari Customer)
        $salesQuery = SalesTransaction::query();
        if ($startDate && $endDate) {
            $salesQuery->whereBetween('transaction_date', [$startDate, $endDate]);
        }

        $completedSalesQuery = (clone $salesQuery)->where('status', 'completed');
        $cancelledSalesCount = (clone $salesQuery)->where('status', 'cancelled')->count();
        $processingSalesCount = (clone $salesQuery)->where('status', 'processing')->count();
        $completedSalesCount = (clone $completedSalesQuery)->count();

        $totalIncome = (float) (clone $completedSalesQuery)->sum('total_amount');

        // 2. Query Purchase Order (Pengeluaran Belanja Stok ke Supplier)
        $poQuery = PurchaseOrder::query();
        if ($startDate && $endDate) {
            $poQuery->whereBetween('po_date', [$startDate->toDateString(), $endDate->toDateString()]);
        }

        // Pengeluaran riil dari PO yang sudah selesai/diterima (atau sudah dikirim/dikonfirmasi)
        $receivedPoQuery = (clone $poQuery)->where('status', 'received');
        $inProgressPoQuery = (clone $poQuery)->whereIn('status', ['confirmed', 'shipped']);

        $completedPoCount = (clone $receivedPoQuery)->count();
        $inProgressPoCount = (clone $inProgressPoQuery)->count();

        $receivedExpense = (float) (clone $receivedPoQuery)->sum('total_price');
        $inProgressExpense = (float) (clone $inProgressPoQuery)->sum('total_price');
        $totalExpense = $receivedExpense;

        // 3. Perhitungan HPP (Modal Barang Terjual), Laba Kotor, Laba Bersih, dan Rugi
        $soldItemsQuery = SalesTransactionItem::query()
            ->with('product:id,name,purchase_price,selling_price')
            ->whereHas('salesTransaction', function ($q) use ($startDate, $endDate) {
                $q->where('status', 'completed');
                if ($startDate && $endDate) {
                    $q->whereBetween('transaction_date', [$startDate, $endDate]);
                }
            });

        $soldItems = $soldItemsQuery->get();

        $totalCogs = 0.0; // Harga Pokok Penjualan (modal beli dari unit yang terjual)
        $totalUnitsSold = 0;

        foreach ($soldItems as $item) {
            $qty = (int) $item->qty;
            $purchasePrice = (float) ($item->product?->purchase_price ?? 0);
            $totalCogs += ($qty * $purchasePrice);
            $totalUnitsSold += $qty;
        }

        $grossProfit = $totalIncome - $totalCogs; // Selisih harga jual vs harga beli barang yang laku
        $netBalance = $totalIncome - $totalExpense; // Arus kas bersih (Pemasukan - Pengeluaran PO)
        $netProfit = $netBalance > 0 ? $netBalance : 0.0;
        $netLoss = $netBalance < 0 ? abs($netBalance) : 0.0;

        // 4. Analisis Produk Depot: Barang Paling Laku & Barang Jarang Dibeli
        $depotProducts = Product::with('category:id,name')
            ->whereNull('vendor_id')
            ->get();

        $salesByProduct = SalesTransactionItem::query()
            ->selectRaw('
                product_id,
                SUM(qty) as total_qty_sold,
                SUM(subtotal) as total_revenue,
                COUNT(DISTINCT sales_transaction_id) as transaction_count
            ')
            ->whereHas('salesTransaction', function ($q) use ($startDate, $endDate) {
                $q->where('status', 'completed');
                if ($startDate && $endDate) {
                    $q->whereBetween('transaction_date', [$startDate, $endDate]);
                }
            })
            ->groupBy('product_id')
            ->get()
            ->keyBy('product_id');

        $productPerformance = $depotProducts->map(function (Product $product) use ($salesByProduct) {
            $stat = $salesByProduct->get($product->id);
            $qtySold = (int) ($stat->total_qty_sold ?? 0);
            $revenue = (float) ($stat->total_revenue ?? 0);
            $txCount = (int) ($stat->transaction_count ?? 0);
            $unitCost = (float) ($product->purchase_price ?? 0);
            $estimatedProfit = $revenue - ($qtySold * $unitCost);

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'variant' => $product->variant,
                'category_name' => $product->category?->name ?? 'Tanpa Kategori',
                'selling_price' => (float) $product->selling_price,
                'purchase_price' => $unitCost,
                'stock_content' => (int) $product->stock_content,
                'total_qty_sold' => $qtySold,
                'total_revenue' => $revenue,
                'estimated_profit' => $estimatedProfit,
                'transaction_count' => $txCount,
            ];
        })->values();

        // Barang Paling Laku: hanya yang sudah pernah terjual (total_qty_sold > 0), urutkan DESC
        $bestSellingProducts = $productPerformance
            ->filter(fn ($item) => $item['total_qty_sold'] > 0)
            ->sortByDesc(fn ($item) => [$item['total_qty_sold'], $item['total_revenue']])
            ->values()
            ->take(8);

        // Barang Jarang Dibeli: urutkan dari total_qty_sold terendah (ASC)
        $leastSellingProducts = $productPerformance
            ->sortBy(fn ($item) => [$item['total_qty_sold'], $item['total_revenue']])
            ->values()
            ->take(8);

        // 5. Rincian Daftar Pemasukan (Penjualan ke Customer) & Pengeluaran (Pembelian ke Supplier)
        $incomeTransactions = (clone $completedSalesQuery)
            ->with(['customer:id,name', 'creator:id,name', 'items'])
            ->latest('transaction_date')
            ->limit(25)
            ->get()
            ->map(fn (SalesTransaction $sale) => [
                'id' => $sale->id,
                'code' => $sale->transaction_code,
                'date' => $sale->transaction_date?->toIso8601String(),
                'party_name' => $sale->customer?->name ?? 'Pelanggan Walk-In',
                'payment_method' => $sale->payment_method,
                'items_summary' => $sale->items
                    ->map(fn ($i) => "{$i->product_name} (x{$i->qty})")
                    ->implode(', '),
                'amount' => (float) $sale->total_amount,
                'status' => $sale->status,
            ]);

        $expenseTransactions = (clone $receivedPoQuery)
            ->with(['vendor:id,name', 'items'])
            ->latest('po_date')
            ->latest('id')
            ->limit(25)
            ->get()
            ->map(fn (PurchaseOrder $po) => [
                'id' => $po->id,
                'code' => $po->po_number,
                'date' => $po->po_date?->format('Y-m-d') ?? $po->created_at?->toDateString(),
                'party_name' => $po->vendor?->name ?? 'Supplier',
                'payment_method' => $po->payment_method,
                'items_summary' => $po->items
                    ->map(fn ($i) => "{$i->product_name} (x{$i->qty_ordered})")
                    ->implode(', '),
                'amount' => (float) $po->total_price,
                'status' => $po->status,
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Data laporan berhasil dimuat.',
            'data' => [
                'period' => [
                    'type' => $period,
                    'label' => $periodLabel,
                    'start_date' => $startDate?->toDateString(),
                    'end_date' => $endDate?->toDateString(),
                    'generated_at' => now()->toIso8601String(),
                ],
                'summary' => [
                    'total_income' => $totalIncome,
                    'total_expense' => $totalExpense,
                    'in_progress_expense' => $inProgressExpense,
                    'total_cogs' => $totalCogs,
                    'gross_profit' => $grossProfit,
                    'net_balance' => $netBalance,
                    'net_profit' => $netProfit,
                    'net_loss' => $netLoss,
                    'financial_status' => $netBalance > 0 ? 'surplus' : ($netBalance < 0 ? 'deficit' : 'breakeven'),
                    'completed_sales_count' => $completedSalesCount,
                    'processing_sales_count' => $processingSalesCount,
                    'cancelled_sales_count' => $cancelledSalesCount,
                    'completed_po_count' => $completedPoCount,
                    'in_progress_po_count' => $inProgressPoCount,
                    'total_units_sold' => $totalUnitsSold,
                ],
                'best_selling_products' => $bestSellingProducts,
                'least_selling_products' => $leastSellingProducts,
                'all_products_ranking' => $productPerformance,
                'income_list' => $incomeTransactions,
                'expense_list' => $expenseTransactions,
            ],
        ]);
    }
}
