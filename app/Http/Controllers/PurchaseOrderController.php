<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PurchaseOrderController extends Controller
{
    /**
     * Transisi status yang diizinkan untuk Owner / Admin Depot.
     * - Saat masih Pending (draft / ordered), Owner hanya dapat membatalkan pesanan (cancelled).
     * - Konfirmasi (confirmed), penolakan (rejected), dan pengiriman (shipped) dilakukan oleh Supplier.
     * - Saat barang sudah dikirim oleh Supplier (shipped), Owner menandai Terima Barang (received).
     */
    private const OWNER_TRANSITIONS = [
        'draft' => ['cancelled'],
        'ordered' => ['cancelled'],
        'shipped' => ['received'],
    ];

    /**
     * Transisi status yang diizinkan untuk Supplier (vendor).
     * PO yang dibuat oleh Owner memiliki status awal 'draft' (atau 'ordered').
     * Supplier dapat mengonfirmasi ('confirmed'), menolak ('rejected'),
     * dan menandai pesanan yang sudah dikonfirmasi menjadi dikirim ('shipped').
     */
    private const VENDOR_TRANSITIONS = [
        'draft' => ['confirmed', 'rejected'],
        'ordered' => ['confirmed', 'rejected'],
        'confirmed' => ['shipped'],
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $query = PurchaseOrder::with([
            'vendor',
            'creator:id,name,email,phone',
            'items',
        ]);

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendorForUser($user);
            $query->where('vendor_id', $vendor->id);
        } elseif ($request->filled('vendor_id')) {
            $query->where('vendor_id', $request->vendor_id);
        }

        if ($request->filled('status')) {
            $status = strtolower(trim((string) $request->status));

            if (in_array($status, ['pending', 'menunggu'], true)) {
                $query->whereIn('status', ['draft', 'ordered']);
            } elseif (in_array($status, ['processing', 'diproses'], true)) {
                $query->whereIn('status', ['confirmed', 'shipped']);
            } elseif (in_array($status, ['completed', 'selesai'], true)) {
                $query->where('status', 'received');
            } elseif (in_array($status, ['cancelled_group', 'dibatalkan'], true)) {
                $query->whereIn('status', ['rejected', 'cancelled']);
            } elseif (in_array($status, ['history', 'riwayat'], true)) {
                $query->whereIn('status', ['shipped', 'received', 'rejected', 'cancelled']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($subQuery) use ($search) {
                $subQuery->where('po_number', 'like', "%{$search}%")
                    ->orWhere('notes', 'like', "%{$search}%")
                    ->orWhere('shipping_address', 'like', "%{$search}%")
                    ->orWhereHas('creator', function ($creatorQuery) use ($search) {
                        $creatorQuery->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('items', function ($itemQuery) use ($search) {
                        $itemQuery->where('product_name', 'like', "%{$search}%");
                    });
            });
        }

        $perPage = (int) $request->input('per_page', 15);
        $perPage = max(1, min($perPage, 50));

        return $query
            ->latest('po_date')
            ->latest('id')
            ->paginate($perPage);
    }

    public function show(Request $request, $id)
    {
        $po = PurchaseOrder::with([
            'vendor',
            'creator:id,name,email,phone',
            'items',
            'goodsReceipts',
        ])->findOrFail($id);

        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendorForUser($user);

            if ((int) $po->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk melihat pesanan milik supplier lain.',
                    'error_code' => 'FORBIDDEN_PO_ACCESS',
                ], 403);
            }
        }

        return $po;
    }

    public function store(Request $request)
    {
        $user = $request->user();

        if (!$user || !$user->isOwner()) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya Owner yang dapat membuat pesanan pembelian baru.',
                'error_code' => 'FORBIDDEN_ROLE',
            ], 403);
        }

        $data = $request->validate($this->rules());

        $po = DB::transaction(function () use ($data, $user) {
            $po = PurchaseOrder::create([
                ...Arr::except($data, ['items']),
                'po_date' => now()->toDateString(),
                'po_number' => $this->newNumber(),
                'created_by' => $user->id,
                'status' => 'draft',
            ]);

            $this->saveItems($po, $data['items']);

            return $po;
        });

        return response()->json(
            $po->load(['vendor', 'creator:id,name,email,phone', 'items']),
            201
        );
    }

    public function update(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);
        $user = $request->user();

        // Cabang otorisasi khusus Supplier (role: vendor)
        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendorForUser($user);

            if ((int) $po->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah pesanan milik supplier lain.',
                    'error_code' => 'FORBIDDEN_PO_ACCESS',
                ], 403);
            }

            $data = $request->validate([
                'status' => ['required', 'in:confirmed,rejected,shipped'],
                'notes' => ['sometimes', 'nullable', 'string'],
            ]);

            $allowedNextStatuses = self::VENDOR_TRANSITIONS[$po->status] ?? [];

            if (!in_array($data['status'], $allowedNextStatuses, true)) {
                throw ValidationException::withMessages([
                    'status' => "Supplier tidak dapat mengubah status pesanan dari '{$po->status}' ke '{$data['status']}'.",
                ]);
            }

            $updatePayload = ['status' => $data['status']];
            if (array_key_exists('notes', $data)) {
                $updatePayload['notes'] = $data['notes'];
            }

            DB::transaction(function () use ($po, $updatePayload, $data, $user) {
                $po->update($updatePayload);

                // Jika Supplier menandai pesanan sebagai 'shipped' (Dikirim),
                // otomatis kurangi stok produk di gudang Supplier.
                if ($data['status'] === 'shipped') {
                    $this->deductSupplierStockOnShip($po, $user);
                }
            });

            return $po->load([
                'vendor',
                'creator:id,name,email,phone',
                'items',
                'goodsReceipts',
            ]);
        }

        // Cabang otorisasi Owner / Admin
        $data = $request->validate($this->rules(true) + [
            'status' => 'sometimes|in:ordered,confirmed,shipped,received,rejected,cancelled',
        ]);

        if (isset($data['items']) && $po->status !== 'draft') {
            return response()->json([
                'message' => 'Item hanya bisa diubah saat PO berstatus draft.',
            ], 409);
        }

        if (
            isset($data['status'])
            && !in_array($data['status'], self::OWNER_TRANSITIONS[$po->status] ?? [], true)
        ) {
            throw ValidationException::withMessages([
                'status' => "Status tidak bisa berubah dari {$po->status} ke {$data['status']}.",
            ]);
        }

        $previousStatus = $po->status;

        DB::transaction(function () use ($po, $data, $previousStatus, $user) {
            $po->update(Arr::except($data, ['items']));

            if (isset($data['items'])) {
                $po->items()->delete();
                $this->saveItems($po, $data['items']);
            } else {
                $po->update(['total_price' => $po->subtotal_price]);
            }

            // Pastikan stok gudang Supplier berkurang saat status berubah ke 'shipped' atau 'received'
            if (
                isset($data['status'])
                && in_array($data['status'], ['shipped', 'received'], true)
            ) {
                $this->deductSupplierStockOnShip($po, $user);
            }

            // Jika Owner mengubah status PO menjadi 'received' (Barang Diterima),
            // otomatis tambahkan stok produk ke gudang Depot Owner dan catat GoodsReceipt + StockMovement.
            if (
                isset($data['status'])
                && $data['status'] === 'received'
                && $previousStatus !== 'received'
            ) {
                $this->receiveOrderItemsIntoStock($po, $user);
            }
        });

        return $po->load([
            'vendor',
            'creator:id,name,email,phone',
            'items',
            'goodsReceipts',
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();

        if (!$user || !$user->isOwner()) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya Owner yang dapat menghapus pesanan pembelian.',
                'error_code' => 'FORBIDDEN_ROLE',
            ], 403);
        }

        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json([
                'message' => 'Hanya PO berstatus draft yang bisa dihapus. Gunakan status cancelled.',
            ], 409);
        }

        DB::transaction(function () use ($po) {
            $po->items()->delete();
            $po->delete();
        });

        return response()->json(['message' => 'PO dihapus.']);
    }

    private function resolveVendorForUser(User $user): Vendor
    {
        return Vendor::firstOrCreate(
            ['user_id' => $user->id],
            [
                'name' => $user->name,
                'phone' => $user->phone,
                'address' => null,
            ]
        );
    }

    private function rules(bool $partial = false): array
    {
        $required = $partial ? 'sometimes|required' : 'required';

        return [
            'vendor_id' => $required . '|exists:vendor,id',
            'payment_method' => $required . '|in:cash,transfer,qris,credit',
            'shipping_address' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'items' => ($partial ? 'sometimes' : 'required') . '|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.product_description' => 'nullable|string',
            'items.*.qty_ordered' => 'required|integer|min:1',
        ];
    }

    private function saveItems(PurchaseOrder $po, array $items): void
    {
        $products = Product::whereIn('id', collect($items)->pluck('product_id'))->get()->keyBy('id');
        $subtotal = 0;

        foreach ($items as $item) {
            $product = $products[$item['product_id']];
            // Untuk produk milik Supplier, gunakan harga jual supplier (selling_price);
            // fallback ke purchase_price jika produk lama milik depot.
            $price = $product->vendor_id !== null && (float) $product->selling_price > 0
                ? (float) $product->selling_price
                : (float) ($product->purchase_price > 0 ? $product->purchase_price : $product->selling_price);

            $total = round($item['qty_ordered'] * $price, 2);

            $po->items()->create([
                'product_id' => $product->id,
                'product_name' => $product->name . ($product->variant ? ' (' . $product->variant . ')' : ''),
                'product_description' => $item['product_description'] ?? $product->variant,
                'qty_ordered' => $item['qty_ordered'],
                'agreed_price' => $price,
                'total_price' => $total,
            ]);

            $subtotal += $total;
        }

        $po->update([
            'subtotal_price' => $subtotal,
            'total_price' => $subtotal,
        ]);
    }

    /**
     * Kurangi stok gudang milik Supplier ketika pesanan PO dikirim ('shipped').
     * Dijamin idempoten (hanya dipotong 1x per PO).
     */
    private function deductSupplierStockOnShip(PurchaseOrder $po, User $user): void
    {
        $alreadyDeducted = StockMovement::where('reference_type', 'po_supplier_out')
            ->where('reference_id', $po->id)
            ->exists();

        if ($alreadyDeducted) {
            return;
        }

        $po->loadMissing('items');

        foreach ($po->items as $poItem) {
            $supplierProduct = Product::lockForUpdate()->find($poItem->product_id);
            if (!$supplierProduct || $supplierProduct->vendor_id === null) {
                continue;
            }

            $qty = max(0, (int) $poItem->qty_ordered);
            if ($qty <= 0) {
                continue;
            }

            $supplierProduct->stock_content = max(0, (int) $supplierProduct->stock_content - $qty);
            $supplierProduct->save();

            StockMovement::create([
                'product_id' => $supplierProduct->id,
                'stock_type' => 'fill',
                'movement_type' => 'out',
                'qty' => $qty,
                'ending_balance' => (int) $supplierProduct->stock_content,
                'reference_type' => 'po_supplier_out',
                'reference_id' => $po->id,
                'description' => "Pengiriman PO {$po->po_number} ke Depot Owner",
                'created_by' => $user->id,
            ]);
        }
    }

    /**
     * Tambahkan kuantitas item PO ke stok produk Depot Owner (vendor_id = null) secara otomatis
     * ketika Owner menandai PO sebagai 'received' (Selesai / Barang Diterima).
     */
    private function receiveOrderItemsIntoStock(PurchaseOrder $po, User $user): void
    {
        $po->loadMissing('items');

        $pendingRows = [];

        foreach ($po->items as $poItem) {
            $alreadyReceived = (int) GoodsReceiptItem::where('purchase_order_item_id', $poItem->id)
                ->sum('qty_diterima');

            $qtyToReceive = max(0, (int) $poItem->qty_ordered - $alreadyReceived);

            if ($qtyToReceive > 0) {
                $pendingRows[] = [
                    'po_item' => $poItem,
                    'qty' => $qtyToReceive,
                ];
            }
        }

        if (empty($pendingRows)) {
            return;
        }

        $receipt = GoodsReceipt::create([
            'purchase_order_id' => $po->id,
            'receipt_number' => $this->newReceiptNumber(),
            'received_date' => now(),
            'checked_by' => $user->id,
            'qc_status' => 'passed',
            'document_type' => 'do_and_invoice',
            'document_number' => $po->po_number,
            'notes' => 'Penerimaan barang otomatis saat PO ditandai selesai oleh Owner.',
        ]);

        foreach ($pendingRows as $entry) {
            $poItem = $entry['po_item'];
            $qty = $entry['qty'];

            $sourceProduct = Product::with('category')->lockForUpdate()->find($poItem->product_id);
            if (!$sourceProduct) {
                continue;
            }

            // Jika item berasal dari katalog Supplier (vendor_id != null),
            // sinkronkan/temukan produk padanannya di gudang Depot Owner (vendor_id = null).
            $ownerProduct = $sourceProduct->vendor_id !== null
                ? $this->resolveOwnerDepotProduct($sourceProduct, (float) $poItem->agreed_price)
                : $sourceProduct;

            $receipt->items()->create([
                'purchase_order_item_id' => $poItem->id,
                'product_id' => $ownerProduct->id,
                'qty_diterima' => $qty,
                'qty_ditolak' => 0,
                'catatan_qc' => 'Diterima lengkap sesuai PO',
            ]);

            $ownerProduct->stock_content = (int) $ownerProduct->stock_content + $qty;
            $ownerProduct->purchase_price = (float) $poItem->agreed_price;
            $ownerProduct->save();

            StockMovement::create([
                'product_id' => $ownerProduct->id,
                'stock_type' => 'fill',
                'movement_type' => 'in',
                'qty' => $qty,
                'ending_balance' => (int) $ownerProduct->stock_content,
                'reference_type' => 'goods_receipt',
                'reference_id' => $receipt->id,
                'description' => "Penerimaan PO {$po->po_number} ({$receipt->receipt_number})",
                'created_by' => $user->id,
            ]);
        }
    }

    /**
     * Cari atau buat produk di gudang Depot Owner (vendor_id = null)
     * yang berpadanan dengan produk milik Supplier.
     */
    private function resolveOwnerDepotProduct(Product $supplierProduct, float $agreedPrice): Product
    {
        $ownerProduct = Product::whereNull('vendor_id')
            ->where('source_product_id', $supplierProduct->id)
            ->lockForUpdate()
            ->first();

        if (!$ownerProduct) {
            $ownerProduct = Product::whereNull('vendor_id')
                ->where('name', $supplierProduct->name)
                ->where(function ($query) use ($supplierProduct) {
                    if ($supplierProduct->variant) {
                        $query->where('variant', $supplierProduct->variant);
                    } else {
                        $query->whereNull('variant')->orWhere('variant', '');
                    }
                })
                ->lockForUpdate()
                ->first();
        }

        if ($ownerProduct) {
            if (!$ownerProduct->source_product_id) {
                $ownerProduct->source_product_id = $supplierProduct->id;
                $ownerProduct->save();
            }

            return $ownerProduct;
        }

        // Pastikan kategori untuk Depot Owner tersedia
        $supplierCategory = $supplierProduct->category;
        $ownerCategory = null;

        if ($supplierCategory) {
            if ($supplierCategory->vendor_id === null) {
                $ownerCategory = $supplierCategory;
            } else {
                $ownerCategory = Category::whereNull('vendor_id')
                    ->where('name', $supplierCategory->name)
                    ->first();

                if (!$ownerCategory) {
                    $baseCode = Str::upper(Str::slug(Str::limit($supplierCategory->name, 10, ''), ''));
                    if ($baseCode === '') {
                        $baseCode = 'KAT';
                    }
                    $candidateCode = $baseCode;
                    $counter = 1;
                    while (Category::where('code', $candidateCode)->exists()) {
                        $candidateCode = $baseCode . '-' . $counter;
                        $counter++;
                    }

                    $ownerCategory = Category::create([
                        'vendor_id' => null,
                        'code' => $candidateCode,
                        'name' => $supplierCategory->name,
                        'description' => $supplierCategory->description,
                    ]);
                }
            }
        }

        if (!$ownerCategory) {
            $ownerCategory = Category::whereNull('vendor_id')->first()
                ?? Category::first();
        }

        // Buat SKU unik untuk produk Depot Owner
        $baseSku = $supplierProduct->sku
            ? 'DPT-' . $supplierProduct->sku
            : 'DPT-' . strtoupper(Str::random(5));
        $candidateSku = Str::limit($baseSku, 45, '');
        $suffix = 1;
        while (Product::where('sku', $candidateSku)->exists()) {
            $candidateSku = Str::limit($baseSku, 40, '') . '-' . $suffix;
            $suffix++;
        }

        return Product::create([
            'vendor_id' => null,
            'source_product_id' => $supplierProduct->id,
            'category_id' => $ownerCategory->id,
            'sku' => $candidateSku,
            'name' => $supplierProduct->name,
            'variant' => $supplierProduct->variant,
            'unit' => $supplierProduct->unit,
            'purchase_price' => $agreedPrice,
            'selling_price' => (float) $supplierProduct->selling_price,
            'deposit_price' => $supplierProduct->deposit_price,
            'stock_content' => 0,
            'empty_stock' => 0,
            'minimum_stock' => (int) $supplierProduct->minimum_stock,
            'is_active' => true,
        ]);
    }

    private function newNumber(): string
    {
        $prefix = 'PO-' . now()->format('Ymd') . '-';
        $count = PurchaseOrder::where('po_number', 'like', $prefix . '%')->count();

        return $prefix . str_pad($count + 1, 4, '0', STR_PAD_LEFT);
    }

    private function newReceiptNumber(): string
    {
        $prefix = 'GR-' . now()->format('Ymd') . '-';
        $count = GoodsReceipt::where('receipt_number', 'like', $prefix . '%')->count();

        return $prefix . str_pad($count + 1, 4, '0', STR_PAD_LEFT);
    }
}
