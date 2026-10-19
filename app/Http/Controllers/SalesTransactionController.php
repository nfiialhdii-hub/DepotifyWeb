<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesTransaction;
use App\Models\SalesTransactionItem;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesTransactionController extends Controller
{
    /**
     * Menampilkan daftar transaksi penjualan.
     */
    public function index(Request $request)
    {
        $sales = SalesTransaction::with([
            'creator:id,name',
            'processor:id,name',
            'items.product:id,name,sku',
        ])
            ->when(
                $request->status,
                fn ($query, $value) =>
                    $query->where('status', $value)
            )
            ->when(
                $request->payment_method,
                fn ($query, $value) =>
                    $query->where(
                        'payment_method',
                        $value
                    )
            )
            ->when(
                $request->channel,
                fn ($query, $value) =>
                    $query->where(
                        'channel',
                        $value
                    )
            )
            ->when(
                $request->search,
                function ($query, $value) {
                    $query->where(
                        'transaction_code',
                        'like',
                        "%{$value}%"
                    );
                }
            )
            ->latest('transaction_date')
            ->latest('id')
            ->paginate(15);

        return response()->json([
            'success' => true,
            'message' => 'Data penjualan berhasil diambil.',
            'data' => $sales,
        ]);
    }

    /**
     * Menampilkan detail transaksi.
     */
    public function show($id)
    {
        $sale = SalesTransaction::with([
            'creator:id,name',
            'processor:id,name',
            'items.product:id,name,sku,unit,uses_container',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'message' => 'Detail penjualan berhasil diambil.',
            'data' => $sale,
        ]);
    }

    /**
     * Membuat transaksi penjualan.
     */
    public function store(
        Request $request,
        StockService $stockService
    ) {
        $data = $request->validate([
            'customer_id' => [
                'nullable',
                'exists:customers,id',
            ],

            'channel' => [
                'nullable',
                'in:app,whatsapp,walk_in',
            ],

            'transaction_date' => [
                'nullable',
                'date',
            ],

            'payment_method' => [
                'required',
                'in:cash,transfer,other',
            ],

            'items' => [
                'required',
                'array',
                'min:1',
            ],

            'items.*.product_id' => [
                'required',
                'exists:products,id',
            ],

            'items.*.transaction_type' => [
                'required',
                'in:top_up,new_deposit,buy_disconnect',
            ],

            'items.*.qty' => [
                'required',
                'integer',
                'min:1',
            ],

            'items.*.empty_container_accepted' => [
                'nullable',
                'integer',
                'min:0',
            ],
        ]);

        $user = $request->user();

        $sale = DB::transaction(function () use (
            $data,
            $user,
            $stockService
        ) {

            /*
             * Buat transaksi terlebih dahulu
             * agar kita mendapatkan ID transaksi.
             */
            $sale = SalesTransaction::create([
                'transaction_code' => $this->newTransactionCode(),
                'customer_id' => $data['customer_id'] ?? null,
                'created_by' => $user->id,
                'processed_by' => $user->id,
                'channel' => $data['channel'] ?? 'walk_in',
                'transaction_date' => $data['transaction_date']
                    ?? now(),
                'total_amount' => 0,
                'payment_method' => $data['payment_method'],
                'status' => 'processing',
            ]);

            $totalAmount = 0;

            /*
             * Ambil semua product sekaligus.
             */
            $productIds = collect($data['items'])
                ->pluck('product_id')
                ->unique();

            $products = Product::whereIn(
                'id',
                $productIds
            )
                ->get()
                ->keyBy('id');

            foreach ($data['items'] as $item) {

                $product = $products->get(
                    $item['product_id']
                );

                /*
                 * Produk seharusnya selalu ditemukan
                 * karena sudah divalidasi exists.
                 */
                if (! $product) {
                    throw ValidationException::withMessages([
                        'items' => [
                            'Produk tidak ditemukan.',
                        ],
                    ]);
                }

                /*
                 * Produk harus aktif.
                 */
                if (! $product->is_active) {
                    throw ValidationException::withMessages([
                        'items' => [
                            "Produk {$product->name} tidak aktif.",
                        ],
                    ]);
                }

                $qty = (int) $item['qty'];

                $transactionType =
                    $item['transaction_type'];

                /*
                 * Harga jual dari database.
                 */
                $unitPrice = (float) $product->selling_price;

                /*
                 * Deposit.
                 *
                 * Deposit hanya ditambahkan pada
                 * transaksi new_deposit.
                 */
                $depositPrice = 0;

                if (
                    $transactionType === 'new_deposit'
                    && $product->uses_container
                ) {
                    $depositPrice =
                        (float) ($product->deposit_price ?? 0);
                }

                /*
                 * Validasi container kosong.
                 */
                $emptyContainerAccepted =
                    (int) (
                        $item['empty_container_accepted']
                        ?? 0
                    );

                if (
                    $transactionType === 'top_up'
                    && ! $product->uses_container
                    && $emptyContainerAccepted > 0
                ) {
                    throw ValidationException::withMessages([
                        'items' => [
                            "Produk {$product->name} tidak menggunakan container.",
                        ],
                    ]);
                }

                /*
                 * Untuk top up, jumlah container kosong
                 * yang diterima tidak boleh lebih dari
                 * jumlah produk yang dijual.
                 */
                if (
                    $transactionType === 'top_up'
                    && $emptyContainerAccepted > $qty
                ) {
                    throw ValidationException::withMessages([
                        'items' => [
                            'Jumlah container kosong yang diterima tidak boleh melebihi jumlah produk.',
                        ],
                    ]);
                }

                /*
                 * Untuk new_deposit dan buy_disconnect,
                 * container kosong dari pelanggan tidak
                 * digunakan dalam transaksi.
                 */
                if (
                    in_array(
                        $transactionType,
                        [
                            'new_deposit',
                            'buy_disconnect',
                        ],
                        true
                    )
                    && $emptyContainerAccepted > 0
                ) {
                    throw ValidationException::withMessages([
                        'items' => [
                            "Container kosong hanya dapat diterima pada transaksi top up.",
                        ],
                    ]);
                }

                /*
                 * Harga produk.
                 */
                $productSubtotal =
                    $qty * $unitPrice;

                /*
                 * Total deposit.
                 */
                $depositSubtotal =
                    $qty * $depositPrice;

                /*
                 * Subtotal item.
                 */
                $subtotal =
                    $productSubtotal
                    + $depositSubtotal;

                /*
                 * Kurangi stok isi.
                 *
                 * Semua jenis transaksi penjualan
                 * mengeluarkan produk isi dari stok.
                 */
                $stockService->keluar(
                    product: $product,
                    jenisStok: 'isi',
                    qty: $qty,
                    referensiTipe: 'sales_transaction',
                    referensiId: $sale->id,
                    user: $user,
                    keterangan:
                        "Penjualan {$transactionType} - {$sale->transaction_code}"
                );

                /*
                 * Jika top up dan pelanggan menyerahkan
                 * container kosong, container tersebut
                 * masuk ke stok kosong depot.
                 */
                if (
                    $transactionType === 'top_up'
                    && $emptyContainerAccepted > 0
                ) {
                    $stockService->masuk(
                        product: $product,
                        jenisStok: 'kosong',
                        qty: $emptyContainerAccepted,
                        referensiTipe: 'sales_transaction',
                        referensiId: $sale->id,
                        user: $user,
                        keterangan:
                            "Container kosong diterima dari pelanggan - {$sale->transaction_code}"
                    );
                }

                /*
                 * Simpan item transaksi.
                 */
                SalesTransactionItem::create([
                    'sales_transaction_id' =>
                        $sale->id,

                    'product_id' =>
                        $product->id,

                    'product_name' =>
                        $product->name,

                    'transaction_type' =>
                        $transactionType,

                    'qty' =>
                        $qty,

                    'unit_price' =>
                        $unitPrice + $depositPrice,

                    'subtotal' =>
                        $subtotal,

                    'empty_container_accepted' =>
                        $emptyContainerAccepted,
                ]);

                $totalAmount += $subtotal;
            }

            /*
             * Update total transaksi.
             */
            $sale->update([
                'total_amount' => $totalAmount,
                'status' => 'completed',
            ]);

            return $sale->load([
                'creator:id,name',
                'processor:id,name',
                'items.product:id,name,sku,unit,uses_container',
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Transaksi penjualan berhasil dibuat.',
            'data' => $sale,
        ], 201);
    }

    /**
     * Membatalkan transaksi.
     *
     * Catatan:
     * Pembatalan hanya diperbolehkan jika transaksi
     * belum completed.
     */
    public function destroy($id)
    {
        $sale = SalesTransaction::findOrFail($id);

        if ($sale->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' =>
                    'Transaksi yang sudah selesai tidak dapat dihapus. Gunakan mekanisme pembatalan/retur.',
            ], 409);
        }

        if ($sale->status === 'cancelled') {
            return response()->json([
                'success' => false,
                'message' =>
                    'Transaksi sudah dibatalkan.',
            ], 409);
        }

        $sale->update([
            'status' => 'cancelled',
        ]);

        return response()->json([
            'success' => true,
            'message' =>
                'Transaksi berhasil dibatalkan.',
            'data' => $sale,
        ]);
    }

    /**
     * Membuat nomor transaksi.
     *
     * Contoh:
     * SALE-20261008-0001
     */
    private function newTransactionCode(): string
    {
        $prefix =
            'SALE-' . now()->format('Ymd') . '-';

        $count = SalesTransaction::where(
            'transaction_code',
            'like',
            $prefix . '%'
        )->count();

        return $prefix
            . str_pad(
                $count + 1,
                4,
                '0',
                STR_PAD_LEFT
            );
    }
}
