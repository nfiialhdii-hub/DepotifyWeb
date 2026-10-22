<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\SalesTransaction;
use App\Models\SalesTransactionItem;
use App\Models\Vendor;
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

        $totalProducts = Product::whereNull('vendor_id')
            ->where('is_active', true)
            ->count();

        $totalStock = Product::whereNull('vendor_id')
            ->where('is_active', true)
            ->sum('stock_content');

        $lowStockProducts = Product::whereNull('vendor_id')
            ->where('is_active', true)
            ->whereColumn('stock_content', '<=', 'minimum_stock')
            ->count();

        /*
        |--------------------------------------------------------------------------
        | Produk Stok Minimum
        |--------------------------------------------------------------------------
        */

        $lowStockList = Product::whereNull('vendor_id')
            ->where('is_active', true)
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

    /**
     * Ringkasan Dashboard khusus Supplier (role: vendor)
     */
    public function supplierDashboard(Request $request)
    {
        $user = $request->user();

        if (!$user || !$user->isVendor()) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya akun Supplier yang dapat mengakses dashboard ini.',
                'error_code' => 'FORBIDDEN_ROLE',
            ], 403);
        }

        $vendor = Vendor::firstOrCreate(
            ['user_id' => $user->id],
            [
                'name' => $user->name,
                'phone' => $user->phone,
                'address' => null,
            ]
        )->load('categories');

        $baseQuery = PurchaseOrder::where('vendor_id', $vendor->id);

        $statusCounts = (clone $baseQuery)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $draftCount = (int) ($statusCounts['draft'] ?? 0);
        $orderedCount = (int) ($statusCounts['ordered'] ?? 0);
        $confirmedCount = (int) ($statusCounts['confirmed'] ?? 0);
        $shippedCount = (int) ($statusCounts['shipped'] ?? 0);
        $receivedCount = (int) ($statusCounts['received'] ?? 0);
        $rejectedCount = (int) ($statusCounts['rejected'] ?? 0);
        $cancelledCount = (int) ($statusCounts['cancelled'] ?? 0);

        $totalOrders = $draftCount
            + $orderedCount
            + $confirmedCount
            + $shippedCount
            + $receivedCount
            + $rejectedCount
            + $cancelledCount;

        // Pesanan menunggu konfirmasi supplier: draft (baru dibuat depot) atau ordered
        $pendingOrders = $draftCount + $orderedCount;

        // Pesanan sedang diproses: confirmed (dikonfirmasi supplier) atau shipped (dikirim)
        $processingOrders = $confirmedCount + $shippedCount;

        // Pesanan selesai: received (diterima oleh depot)
        $completedOrders = $receivedCount;

        // Pesanan ditolak / dibatalkan
        $cancelledOrders = $rejectedCount + $cancelledCount;

        $totalActiveValue = (float) (clone $baseQuery)
            ->whereNotIn('status', ['rejected', 'cancelled'])
            ->sum('total_price');

        $recentOrders = (clone $baseQuery)
            ->with([
                'vendor:id,name,phone,address',
                'creator:id,name,email,phone',
                'items',
            ])
            ->latest('po_date')
            ->latest('id')
            ->limit(8)
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Data dashboard supplier berhasil diambil.',
            'data' => [
                'vendor' => $vendor,
                'summary' => [
                    'total_orders' => $totalOrders,
                    'pending_orders' => $pendingOrders,
                    'processing_orders' => $processingOrders,
                    'completed_orders' => $completedOrders,
                    'cancelled_orders' => $cancelledOrders,
                    'total_order_value' => $totalActiveValue,
                    'status_breakdown' => [
                        'draft' => $draftCount,
                        'ordered' => $orderedCount,
                        'confirmed' => $confirmedCount,
                        'shipped' => $shippedCount,
                        'received' => $receivedCount,
                        'rejected' => $rejectedCount,
                        'cancelled' => $cancelledCount,
                    ],
                ],
                'recent_orders' => $recentOrders,
            ],
        ], 200);
    }

    /**
     * Data Dashboard untuk User / Pelanggan (role: customer)
     */
    public function customerDashboard(Request $request)
    {
        $user = $request->user();

        if (!$user || !$user->isCustomer()) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya akun User/Pelanggan yang dapat mengakses halaman ini.',
                'error_code' => 'FORBIDDEN_ROLE',
            ], 403);
        }

        $products = Product::with('category:id,code,name')
            ->whereNull('vendor_id')
            ->where('is_active', true)
            ->orderBy('name')
            ->get([
                'id',
                'category_id',
                'sku',
                'name',
                'variant',
                'unit',
                'selling_price',
                'deposit_price',
                'stock_content',
                'is_active',
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Data katalog produk depot berhasil diambil.',
            'data' => [
                'user' => $user->load('customer'),
                'summary' => [
                    'available_products' => $products->where('stock_content', '>', 0)->count(),
                    'total_catalog' => $products->count(),
                ],
                'products' => $products,
            ],
        ], 200);
    }
}
