<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\SalesTransaction;
use App\Models\SalesTransactionItem;
use App\Models\StockNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $today = Carbon::today();

        /*
        |--------------------------------------------------------------------------
        | Ringkasan Hari Ini
        |--------------------------------------------------------------------------
        */

        $todayTransactions = SalesTransaction::whereDate(
            'transaction_date',
            $today
        )
        ->where('status', 'completed')
        ->count();

        $todayRevenue = SalesTransaction::whereDate(
            'transaction_date',
            $today
        )
        ->where('status', 'completed')
        ->sum('total_amount');

        /*
        |--------------------------------------------------------------------------
        | Data Stok
        |--------------------------------------------------------------------------
        */

        $totalProducts = Product::where('is_active', true)->count();

        $totalStock = Product::where('is_active', true)
            ->sum('stock_content');

        $lowStockProducts = Product::where('is_active', true)
            ->whereColumn('stock_content', '<=', 'minimum_stock')
            ->count();

        /*
        |--------------------------------------------------------------------------
        | Produk Stok Minimum
        |--------------------------------------------------------------------------
        */

        $lowStockList = Product::where('is_active', true)
            ->whereColumn('stock_content', '<=', 'minimum_stock')
            ->select([
                'id',
                'sku',
                'name',
                'variant',
                'unit',
                'stock_content',
                'minimum_stock',
            ])
            ->orderBy('stock_content')
            ->limit(10)
            ->get();

        /*
        |--------------------------------------------------------------------------
        | Transaksi Terbaru
        |--------------------------------------------------------------------------
        */

        $recentTransactions = SalesTransaction::with([
            'creator:id,name',
        ])
        ->select([
            'id',
            'transaction_code',
            'created_by',
            'channel',
            'transaction_date',
            'total_amount',
            'payment_method',
            'status',
        ])
        ->latest('transaction_date')
        ->limit(10)
        ->get();

        /*
        |--------------------------------------------------------------------------
        | Grafik Penjualan 7 Hari
        |--------------------------------------------------------------------------
        */

        $salesChart = [];

        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);

            $salesChart[] = [
                'date' => $date->format('Y-m-d'),
                'label' => $date->format('d/m'),
                'total_transactions' => SalesTransaction::whereDate(
                    'transaction_date',
                    $date
                )
                ->where('status', 'completed')
                ->count(),

                'total_revenue' => SalesTransaction::whereDate(
                    'transaction_date',
                    $date
                )
                ->where('status', 'completed')
                ->sum('total_amount'),
            ];
        }

        /*
        |--------------------------------------------------------------------------
        | Produk Terlaris 7 Hari
        |--------------------------------------------------------------------------
        */

        $topProducts = SalesTransactionItem::query()
            ->selectRaw('
                product_id,
                product_name,
                SUM(qty) as total_qty,
                SUM(subtotal) as total_revenue
            ')
            ->whereHas('salesTransaction', function ($query) {
                $query->where('status', 'completed')
                    ->where(
                        'transaction_date',
                        '>=',
                        Carbon::today()->subDays(6)
                    );
            })
            ->groupBy('product_id', 'product_name')
            ->orderByDesc('total_qty')
            ->limit(5)
            ->get();

        /*
        |--------------------------------------------------------------------------
        | Response
        |--------------------------------------------------------------------------
        */

        return response()->json([
            'success' => true,
            'message' => 'Data dashboard berhasil diambil.',
            'data' => [
                'summary' => [
                    'today_transactions' => $todayTransactions,
                    'today_revenue' => $todayRevenue,
                    'total_products' => $totalProducts,
                    'total_stock' => $totalStock,
                    'low_stock_products' => $lowStockProducts,
                ],

                'low_stock' => $lowStockList,

                'recent_transactions' => $recentTransactions,

                'sales_chart' => $salesChart,

                'top_products' => $topProducts,
            ],
        ], 200);
    }
}
