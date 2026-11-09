<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesTransaction;
use App\Models\SalesTransactionItem;
use App\Models\StockMovement;
use App\Services\ActivityLogger;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesTransactionController extends Controller
{
    /**
     * Menampilkan daftar transaksi penjualan (ke Customer) beserta ringkasannya.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $baseQuery = SalesTransaction::query();

        // Jika diakses oleh Customer, hanya tampilkan transaksi milik Customer tersebut
        if ($user && $user->isCustomer()) {
            $customer = Customer::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => $user->name,
                    'phone' => $user->phone,
                    'address' => null,
                ]
            );
            $baseQuery->where('customer_id', $customer->id);
        }

        $summary = [
            'total' => (clone $baseQuery)->count(),
            'completed' => (clone $baseQuery)->where('status', 'completed')->count(),
            'processing' => (clone $baseQuery)->whereIn('status', ['pending', 'processing'])->count(),
            'cancelled' => (clone $baseQuery)->where('status', 'cancelled')->count(),
            'total_revenue' => (float) (clone $baseQuery)
                ->where('status', 'completed')
                ->sum('total_amount'),
        ];

        $query = (clone $baseQuery)->with([
            'customer:id,user_id,name,phone,address',
            'creator:id,name,email,role',
            'processor:id,name,email',
            'items.product:id,name,sku,variant,unit,selling_price,deposit_price',
        ]);

        if ($request->filled('status')) {
            $status = $request->status;
            if ($status === 'processing') {
                $query->whereIn('status', ['pending', 'processing']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('channel')) {
            $query->where('channel', $request->channel);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($sub) use ($search) {
                $sub->where('transaction_code', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($customerQuery) use ($search) {
                        $customerQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    })
                    ->orWhereHas('creator', function ($creatorQuery) use ($search) {
                        $creatorQuery->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('items', function ($itemQuery) use ($search) {
                        $itemQuery->where('product_name', 'like', "%{$search}%");
                    });
            });
        }

        $perPage = (int) $request->input('per_page', 50);
        $perPage = max(1, min($perPage, 100));

        $sales = $query
            ->latest('transaction_date')
            ->latest('id')
            ->paginate($perPage);

        $customers = [];
        if ($user && $user->isOwner()) {
            $customers = Customer::select(['id', 'user_id', 'name', 'phone', 'address'])
                ->orderBy('name')
                ->get();
        }

        return response()->json([
            'success' => true,
            'message' => 'Data transaksi penjualan berhasil diambil.',
            'summary' => $summary,
            'customers' => $customers,
            'data' => $sales,
        ]);
    }

    /**
     * Menampilkan detail transaksi.
     */
    public function show(Request $request, $id)
    {
        $sale = SalesTransaction::with([
            'customer:id,user_id,name,phone,address',
            'creator:id,name,email,role',
            'processor:id,name,email',
            'items.product:id,name,sku,variant,unit,selling_price,deposit_price',
        ])->findOrFail($id);

        $user = $request->user();
        if ($user && $user->isCustomer()) {
            $customer = Customer::where('user_id', $user->id)->first();
            if (!$customer || (int) $sale->customer_id !== (int) $customer->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke transaksi ini.',
                ], 403);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Detail penjualan berhasil diambil.',
            'data' => $sale,
        ]);
    }

    /**
     * Membuat transaksi penjualan (oleh Customer maupun oleh Admin/Owner).
     */
    public function store(Request $request, StockService $stockService)
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_phone' => ['nullable', 'string', 'max:30'],
            'customer_address' => ['nullable', 'string', 'max:500'],
            'channel' => ['nullable', 'in:app,whatsapp,walk_in'],
            'transaction_date' => ['nullable', 'date'],
            'payment_method' => ['required', 'in:cash,transfer,other'],
            'status' => ['nullable', 'in:pending,processing,completed'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.transaction_type' => ['nullable', 'in:top_up,new_deposit,buy_disconnect'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.empty_container_accepted' => ['nullable', 'integer', 'min:0'],
        ]);

        $user = $request->user();

        $sale = DB::transaction(function () use ($data, $user, $stockService, $request) {
            $customerId = $data['customer_id'] ?? null;

            if ($user && $user->isCustomer()) {
                $customer = Customer::firstOrCreate(
                    ['user_id' => $user->id],
                    [
                        'name' => $user->name,
                        'phone' => $user->phone,
                        'address' => null,
                    ]
                );

                // Perbarui nomor telepon / alamat customer jika dikirim saat checkout
                $customerUpdates = [];
                if (!empty($data['customer_phone'])) {
                    $customerUpdates['phone'] = trim($data['customer_phone']);
                }
                if (!empty($data['customer_address'])) {
                    $customerUpdates['address'] = trim($data['customer_address']);
                }
                if (!empty($customerUpdates)) {
                    $customer->update($customerUpdates);
                }

                $customerId = $customer->id;
            } elseif (!$customerId && !empty($data['customer_name'])) {
                $customer = Customer::create([
                    'user_id' => null,
                    'name' => trim($data['customer_name']),
                    'phone' => !empty($data['customer_phone']) ? trim($data['customer_phone']) : null,
                    'address' => !empty($data['customer_address']) ? trim($data['customer_address']) : null,
                ]);
                $customerId = $customer->id;
            }

            $targetStatus = $data['status'] ?? ($user && $user->isCustomer() ? 'processing' : 'completed');

            $sale = SalesTransaction::create([
                'transaction_code' => $this->newTransactionCode(),
                'customer_id' => $customerId,
                'created_by' => $user->id,
                'processed_by' => $user->id,
                'channel' => $data['channel'] ?? ($user && $user->isCustomer() ? 'app' : 'walk_in'),
                'transaction_date' => $data['transaction_date'] ?? now(),
                'total_amount' => 0,
                'payment_method' => $data['payment_method'],
                'status' => 'processing',
            ]);

            $totalAmount = 0;

            foreach ($data['items'] as $item) {
                $product = Product::whereKey($item['product_id'])
                    ->lockForUpdate()
                    ->first();

                if (!$product || $product->vendor_id !== null) {
                    throw ValidationException::withMessages([
                        'items' => ['Produk depot tidak ditemukan atau tidak valid.'],
                    ]);
                }

                if (!$product->is_active) {
                    throw ValidationException::withMessages([
                        'items' => ["Produk {$product->name} sedang tidak aktif."],
                    ]);
                }

                $qty = (int) $item['qty'];
                $usesContainer = (bool) $product->uses_container;
                $transactionType = $item['transaction_type'] ?? ($usesContainer ? 'top_up' : 'buy_disconnect');

                if (!$usesContainer) {
                    $transactionType = 'buy_disconnect';
                }

                if ((int) $product->stock_content < $qty) {
                    throw ValidationException::withMessages([
                        'items' => [
                            "Stok {$product->name} tidak mencukupi (Tersedia: {$product->stock_content}, Diminta: {$qty}).",
                        ],
                    ]);
                }

                $unitPrice = (float) $product->selling_price;
                $depositPrice = 0;

                if ($transactionType === 'new_deposit' && $usesContainer) {
                    $depositPrice = (float) ($product->deposit_price ?? 0);
                }

                $emptyContainerAccepted = (int) ($item['empty_container_accepted'] ?? 0);
                if ($transactionType === 'top_up' && $usesContainer && !isset($item['empty_container_accepted'])) {
                    $emptyContainerAccepted = $qty;
                }

                if (!$usesContainer || in_array($transactionType, ['new_deposit', 'buy_disconnect'], true)) {
                    $emptyContainerAccepted = 0;
                }

                if ($transactionType === 'top_up' && $emptyContainerAccepted > $qty) {
                    $emptyContainerAccepted = $qty;
                }

                $productSubtotal = $qty * $unitPrice;
                $depositSubtotal = $qty * $depositPrice;
                $subtotal = $productSubtotal + $depositSubtotal;

                // Kurangi stok isi di depot
                $stockService->keluar(
                    product: $product,
                    jenisStok: 'isi',
                    qty: $qty,
                    referensiTipe: 'sales_transaction',
                    referensiId: $sale->id,
                    user: $user,
                    keterangan: "Pembelian customer ({$transactionType}) - {$sale->transaction_code}"
                );

                // Jika top up dan ada wadah kosong diterima, tambahkan ke stok kosong
                if ($transactionType === 'top_up' && $emptyContainerAccepted > 0) {
                    $stockService->masuk(
                        product: $product,
                        jenisStok: 'kosong',
                        qty: $emptyContainerAccepted,
                        referensiTipe: 'sales_transaction',
                        referensiId: $sale->id,
                        user: $user,
                        keterangan: "Wadah kosong diterima dari customer - {$sale->transaction_code}"
                    );
                }

                SalesTransactionItem::create([
                    'sales_transaction_id' => $sale->id,
                    'product_id' => $product->id,
                    'product_name' => $product->name . ($product->variant ? " ({$product->variant})" : ''),
                    'transaction_type' => $transactionType,
                    'qty' => $qty,
                    'unit_price' => $unitPrice + $depositPrice,
                    'subtotal' => $subtotal,
                    'empty_container_accepted' => $emptyContainerAccepted,
                ]);

                $totalAmount += $subtotal;
            }

            $sale->update([
                'total_amount' => $totalAmount,
                'status' => $targetStatus,
            ]);

            ActivityLogger::log(
                $user,
                'create',
                'sales_transaction',
                "Pembelian produk {$sale->transaction_code} senilai Rp " . number_format($totalAmount, 0, ',', '.'),
                [
                    'transaction_id' => $sale->id,
                    'transaction_code' => $sale->transaction_code,
                    'total_amount' => $totalAmount,
                    'status' => $targetStatus,
                ],
                $request
            );

            return $sale->load([
                'customer:id,user_id,name,phone,address',
                'creator:id,name,email,role',
                'processor:id,name,email',
                'items.product:id,name,sku,variant,unit,selling_price,deposit_price',
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Pesanan berhasil dibuat.',
            'data' => $sale,
        ], 201);
    }

    /**
     * Ubah status transaksi penjualan (Selesaikan `completed` atau Batalkan `cancelled` dengan pengembalian stok otomatis).
     */
    public function update(Request $request, $id, StockService $stockService)
    {
        $sale = SalesTransaction::with('items.product')->findOrFail($id);
        $user = $request->user();

        if ($user && $user->isCustomer()) {
            $customer = Customer::where('user_id', $user->id)->first();
            if (!$customer || (int) $sale->customer_id !== (int) $customer->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah pesanan ini.',
                ], 403);
            }

            // Customer hanya boleh membatalkan pesanannya sendiri selama masih diproses
            $data = $request->validate([
                'status' => ['required', 'in:cancelled'],
            ]);

            if (!in_array($sale->status, ['pending', 'processing'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Pesanan yang sudah selesai tidak dapat dibatalkan.',
                ], 409);
            }
        } else {
            $data = $request->validate([
                'status' => ['required', 'in:processing,completed,cancelled'],
            ]);
        }

        $newStatus = $data['status'];
        $oldStatus = $sale->status;

        if ($newStatus === $oldStatus) {
            return response()->json([
                'success' => true,
                'message' => 'Status transaksi tidak berubah.',
                'data' => $sale,
            ]);
        }

        if ($oldStatus === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Transaksi yang sudah selesai tidak dapat dibatalkan atau diubah kembali.',
            ], 409);
        }

        if ($oldStatus === 'cancelled') {
            return response()->json([
                'success' => false,
                'message' => 'Transaksi yang sudah dibatalkan tidak dapat diubah kembali.',
            ], 409);
        }

        DB::transaction(function () use ($sale, $newStatus, $user, $stockService, $request) {
            // Jika dibatalkan dari status processing/completed, kembalikan stok yang sudah terpotong saat store()
            if ($newStatus === 'cancelled') {
                $alreadyRestored = StockMovement::where('reference_type', 'sales_transaction_cancel')
                    ->where('reference_id', $sale->id)
                    ->exists();

                if (!$alreadyRestored) {
                    foreach ($sale->items as $item) {
                        $product = $item->product ?: Product::find($item->product_id);
                        if (!$product) {
                            continue;
                        }

                        $qty = (int) $item->qty;
                        if ($qty > 0) {
                            $stockService->masuk(
                                product: $product,
                                jenisStok: 'isi',
                                qty: $qty,
                                referensiTipe: 'sales_transaction_cancel',
                                referensiId: $sale->id,
                                user: $user,
                                keterangan: "Pengembalian stok isi karena pembatalan {$sale->transaction_code}"
                            );
                        }

                        $emptyAccepted = (int) ($item->empty_container_accepted ?? 0);
                        if ($emptyAccepted > 0 && (int) $product->empty_stock >= $emptyAccepted) {
                            $stockService->keluar(
                                product: $product,
                                jenisStok: 'kosong',
                                qty: $emptyAccepted,
                                referensiTipe: 'sales_transaction_cancel',
                                referensiId: $sale->id,
                                user: $user,
                                keterangan: "Penyesuaian wadah kosong karena pembatalan {$sale->transaction_code}"
                            );
                        }
                    }
                }
            }

            $sale->update([
                'status' => $newStatus,
                'processed_by' => $user->id,
            ]);

            $statusLabel = match ($newStatus) {
                'completed' => 'Selesai',
                'cancelled' => 'Dibatalkan',
                default => 'Diproses',
            };

            ActivityLogger::log(
                $user,
                'status_change',
                'sales_transaction',
                "Mengubah status transaksi {$sale->transaction_code} menjadi {$statusLabel}",
                [
                    'transaction_id' => $sale->id,
                    'transaction_code' => $sale->transaction_code,
                    'old_status' => $sale->getOriginal('status'),
                    'new_status' => $newStatus,
                ],
                $request
            );
        });

        return response()->json([
            'success' => true,
            'message' => $newStatus === 'cancelled'
                ? 'Pesanan berhasil dibatalkan dan stok produk telah dikembalikan.'
                : 'Status pesanan berhasil diperbarui menjadi Selesai.',
            'data' => $sale->fresh([
                'customer:id,user_id,name,phone,address',
                'creator:id,name,email,role',
                'processor:id,name,email',
                'items.product:id,name,sku,variant,unit,selling_price,deposit_price',
            ]),
        ]);
    }

    /**
     * Membatalkan transaksi lewat DELETE /api/v1/sales/{id}.
     */
    public function destroy(Request $request, $id, StockService $stockService)
    {
        $request->merge(['status' => 'cancelled']);
        return $this->update($request, $id, $stockService);
    }

    /**
     * Membuat nomor transaksi.
     */
    private function newTransactionCode(): string
    {
        $prefix = 'SALE-' . now()->format('Ymd') . '-';
        $seq = SalesTransaction::where(
            'transaction_code',
            'like',
            $prefix . '%'
        )->count() + 1;

        do {
            $candidate = $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);
            $seq++;
        } while (SalesTransaction::where('transaction_code', $candidate)->exists());

        return $candidate;
    }
}
