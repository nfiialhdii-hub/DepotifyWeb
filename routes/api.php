<?php

use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\GoodsReceiptController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseOrderController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SalesTransactionController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\StockNotificationController;
use App\Http\Controllers\VendorController;
use Illuminate\Support\Facades\Route;

// Pemeriksaan status koneksi server Laravel (tanpa autentikasi)
$healthHandler = function () {
    return response()->json([
        'success' => true,
        'status' => 'ok',
        'service' => 'depotify-api',
        'timestamp' => now()->toIso8601String(),
    ], 200)->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
};

Route::get('/health', $healthHandler);

Route::prefix('v1')->group(function () use ($healthHandler) {

    // Endpoint health-check juga tersedia di /api/v1/health (tanpa auth:sanctum)
    Route::get('/health', $healthHandler);

    // Auth publik (Satu pintu login untuk semua role & registrasi khusus User/Customer)
    // Dilindungi rate-limiter untuk mencegah brute-force login & spam registrasi
    Route::middleware('throttle:15,1')->group(function () {
        Route::post('/auth/login', [AuthController::class, 'login']);
        Route::post('/auth/register', [AuthController::class, 'register']);
    });

    Route::middleware('auth:sanctum')->group(function () {

        // Auth terautentikasi (semua role aktif)
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        // Endpoint khusus User / Pelanggan (role: customer)
        Route::middleware('role:customer')->group(function () {
            Route::get('/customer/dashboard', [DashboardController::class, 'customerDashboard']);
            Route::put('/customer/profile', [AuthController::class, 'updateCustomerProfile']);
            Route::get('/customer/orders', [SalesTransactionController::class, 'index']);
            Route::get('/customer/orders/{id}', [SalesTransactionController::class, 'show']);
            Route::post('/customer/orders', [SalesTransactionController::class, 'store']);
            Route::put('/customer/orders/{id}', [SalesTransactionController::class, 'update']);
        });

        // Endpoint khusus Supplier (role: vendor)
        Route::middleware('role:vendor')->group(function () {
            Route::get('/supplier/dashboard', [DashboardController::class, 'supplierDashboard']);
            Route::get('/dashboard_V', [DashboardController::class, 'supplierDashboard']);
            Route::get('/supplier/profile', [VendorController::class, 'profile']);
            Route::put('/supplier/profile', [VendorController::class, 'updateProfile']);
        });

        // Endpoint yang dapat diakses Owner & Supplier (terisolasi berdasarkan role & vendor_id di masing-masing controller)
        Route::middleware('role:owner,vendor')->group(function () {
            Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
            Route::get('/purchase-orders/{id}', [PurchaseOrderController::class, 'show']);
            Route::put('/purchase-orders/{id}', [PurchaseOrderController::class, 'update']);

            // Kategori (Owner mengelola kategori depot, Supplier mengelola kategori pasokan mereka)
            Route::get('/categories', [CategoryController::class, 'index']);
            Route::get('/categories/{id}', [CategoryController::class, 'show']);
            Route::post('/categories', [CategoryController::class, 'store']);
            Route::put('/categories/{id}', [CategoryController::class, 'update']);
            Route::delete('/categories/{id}', [CategoryController::class, 'destroy']);

            // Produk (Owner mengelola produk depot, Supplier mengelola produk yang mereka jual)
            Route::get('/products', [ProductController::class, 'index']);
            Route::get('/products/{id}', [ProductController::class, 'show']);
            Route::post('/products', [ProductController::class, 'store']);
            Route::put('/products/{id}', [ProductController::class, 'update']);
            Route::delete('/products/{id}', [ProductController::class, 'destroy']);

            // Stok (Owner memantau stok depot, Supplier memantau & mengatur stok gudang supplier)
            Route::get('/stock', [StockController::class, 'index']);
            Route::get('/stock/{id}', [StockController::class, 'show']);
            Route::put('/stock/{id}', [StockController::class, 'update']);

            // Transaksi & Riwayat Pergerakan Stok (digunakan juga oleh aplikasi Android saat Direct Receive & Opname)
            Route::post('/stock-transactions/masuk', [StockMovementController::class, 'masuk']);
            Route::post('/stock-transactions/keluar', [StockMovementController::class, 'keluar']);
            Route::post('/stock-transactions/penyesuaian', [StockMovementController::class, 'penyesuaian']);
            Route::get('/stock-movements', [StockMovementController::class, 'index']);
            Route::get('/stock-movements/{id}', [StockMovementController::class, 'show']);
            Route::post('/stock-movements', [StockMovementController::class, 'store']);

            // Penerimaan Barang PO (Goods Receipts)
            Route::get('/goods-receipts', [GoodsReceiptController::class, 'index']);
            Route::post('/goods-receipts', [GoodsReceiptController::class, 'store']);
            Route::get('/goods-receipts/{id}', [GoodsReceiptController::class, 'show']);
            Route::put('/goods-receipts/{id}', [GoodsReceiptController::class, 'update']);

            // Notifikasi Stok Menipis
            Route::get('/stock-notifications', [StockNotificationController::class, 'index']);
            Route::patch('/stock-notifications/{id}/read', [StockNotificationController::class, 'markAsRead']);
            Route::delete('/stock-notifications/{id}', [StockNotificationController::class, 'destroy']);
        });

        // Endpoint khusus Admin / Owner (role: owner)
        Route::middleware('role:owner')->group(function () {
            Route::get('/dashboard', [DashboardController::class, 'index']);

            // Pembuatan & penghapusan Purchase Order hanya untuk Owner
            Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
            Route::delete('/purchase-orders/{id}', [PurchaseOrderController::class, 'destroy']);

            // Sales / Riwayat Transaksi Customer
            Route::get('/sales', [SalesTransactionController::class, 'index']);
            Route::get('/sales/{id}', [SalesTransactionController::class, 'show']);
            Route::post('/sales', [SalesTransactionController::class, 'store']);
            Route::put('/sales/{id}', [SalesTransactionController::class, 'update']);
            Route::delete('/sales/{id}', [SalesTransactionController::class, 'destroy']);

            // Laporan Keuangan & Penjualan + Riwayat Aktivitas Akun
            Route::get('/reports', [ReportController::class, 'index']);
            Route::get('/activity-logs', [ActivityLogController::class, 'index']);

            // Vendor
            Route::get('/vendors', [VendorController::class, 'index']);
            Route::get('/vendors/{id}', [VendorController::class, 'show']);
            Route::post('/vendors', [VendorController::class, 'store']);
            Route::put('/vendors/{id}', [VendorController::class, 'update']);
            Route::delete('/vendors/{id}', [VendorController::class, 'destroy']);
        });
    });

});
