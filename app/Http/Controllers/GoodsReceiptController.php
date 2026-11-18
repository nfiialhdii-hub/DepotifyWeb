<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoodsReceiptController extends Controller
{
    public function index(Request $request)
    {
        return GoodsReceipt::with(['purchaseOrder.vendor', 'checker:id,name', 'items.product'])
            ->when($request->purchase_order_id, fn ($q, $v) => $q->where('purchase_order_id', $v))
            ->latest('received_date')
            ->paginate(15);
    }

    public function show($id)
    {
        $receipt = GoodsReceipt::with(['purchaseOrder.vendor', 'checker:id,name', 'items.product'])->findOrFail($id);

        return response()->json([
            'success' => true,
            'message' => 'Detail penerimaan barang berhasil diambil.',
            'data' => $receipt,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'purchase_order_id' => 'required|exists:purchase_orders,id',
            'received_date' => 'nullable|date',
            'document_type' => 'nullable|in:do,invoice,do_and_invoice',
            'document_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'items' => 'nullable|array|min:1',
            'items.*.purchase_order_item_id' => 'nullable|integer',
            'items.*.product_id' => 'nullable|integer|exists:products,id',
            'items.*.qty_diterima' => 'required_with:items|integer|min:0',
            'items.*.qty_ditolak' => 'nullable|integer|min:0',
            'items.*.catatan_qc' => 'nullable|string',
        ]);

        $receipt = DB::transaction(function () use ($data, $request) {
            $user = $request->user();
            $po = PurchaseOrder::with('items')->lockForUpdate()->findOrFail($data['purchase_order_id']);

            if (in_array($po->status, ['rejected', 'cancelled'], true)) {
                throw ValidationException::withMessages([
                    'purchase_order_id' => "PO berstatus {$po->status}, tidak bisa menerima barang.",
                ]);
            }

            // Jika PO sudah pernah diterima penuh sebelumnya, kembalikan GoodsReceipt yang sudah ada (idempoten)
            $existingReceipt = GoodsReceipt::with('items.product')
                ->where('purchase_order_id', $po->id)
                ->latest('id')
                ->first();

            $allAlreadyReceived = $po->items->isNotEmpty() && $po->items->every(function ($item) {
                return (int) GoodsReceiptItem::where('purchase_order_item_id', $item->id)->sum('qty_diterima') >= (int) $item->qty_ordered;
            });

            if ($allAlreadyReceived && $existingReceipt) {
                if ($po->status !== 'received') {
                    $po->update(['status' => 'received']);
                }
                return $existingReceipt;
            }

            $poItemsById = $po->items->keyBy('id');
            $poItemsByProduct = $po->items->keyBy('product_id');

            // Jika request tidak menyertakan items, otomatis terima seluruh sisa item PO (Direct Receive)
            $inputItems = !empty($data['items'])
                ? $data['items']
                : $po->items->map(fn ($it) => [
                    'purchase_order_item_id' => $it->id,
                    'product_id' => $it->product_id,
                    'qty_diterima' => $it->qty_ordered,
                    'qty_ditolak' => 0,
                    'catatan_qc' => 'Diterima lengkap sesuai PO',
                ])->all();

            $resolvedRows = [];
            $totalDiterima = 0;
            $totalDitolak = 0;

            foreach ($inputItems as $i => $row) {
                $poItem = null;
                if (!empty($row['purchase_order_item_id'])) {
                    $poItem = $poItemsById->get((int) $row['purchase_order_item_id']);
                }
                if (!$poItem && !empty($row['product_id'])) {
                    $poItem = $poItemsByProduct->get((int) $row['product_id']);
                }
                if (!$poItem && $po->items->count() === 1) {
                    $poItem = $po->items->first();
                }

                if (!$poItem) {
                    throw ValidationException::withMessages([
                        "items.$i.purchase_order_item_id" => 'Item bukan bagian dari PO ini.',
                    ]);
                }

                $sudahDiterima = (int) GoodsReceiptItem::where('purchase_order_item_id', $poItem->id)->sum('qty_diterima');
                $sisa = max(0, (int) $poItem->qty_ordered - $sudahDiterima);
                $qtyDiterima = min((int) $row['qty_diterima'], $sisa > 0 ? $sisa : (int) $row['qty_diterima']);
                $qtyDitolak = (int) ($row['qty_ditolak'] ?? 0);

                $totalDiterima += $qtyDiterima;
                $totalDitolak += $qtyDitolak;

                $resolvedRows[] = [
                    'po_item' => $poItem,
                    'qty_diterima' => $qtyDiterima,
                    'qty_ditolak' => $qtyDitolak,
                    'catatan_qc' => $row['catatan_qc'] ?? null,
                ];
            }

            $receipt = GoodsReceipt::create([
                'purchase_order_id' => $po->id,
                'receipt_number' => $this->newNumber(),
                'received_date' => $data['received_date'] ?? now(),
                'checked_by' => $user->id,
                'qc_status' => $totalDitolak === 0 ? 'passed' : ($totalDiterima === 0 ? 'rejected' : 'partial'),
                'document_type' => $data['document_type'] ?? 'do_and_invoice',
                'document_number' => $data['document_number'] ?? $po->po_number,
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($resolvedRows as $entry) {
                $poItem = $entry['po_item'];
                $qtyDiterima = $entry['qty_diterima'];
                $qtyDitolak = $entry['qty_ditolak'];

                $sourceProduct = Product::with('category')->lockForUpdate()->find($poItem->product_id);
                if (!$sourceProduct) {
                    continue;
                }

                $ownerProduct = $sourceProduct->vendor_id !== null
                    ? $this->resolveOwnerDepotProduct($sourceProduct, (float) $poItem->agreed_price)
                    : $sourceProduct;

                $receipt->items()->create([
                    'purchase_order_item_id' => $poItem->id,
                    'product_id' => $ownerProduct->id,
                    'qty_diterima' => $qtyDiterima,
                    'qty_ditolak' => $qtyDitolak,
                    'catatan_qc' => $entry['catatan_qc'],
                ]);

                if ($qtyDiterima > 0) {
                    $ownerProduct->stock_content = (int) $ownerProduct->stock_content + $qtyDiterima;
                    if ((float) $poItem->agreed_price > 0) {
                        $ownerProduct->purchase_price = (float) $poItem->agreed_price;
                    }
                    $ownerProduct->save();

                    StockMovement::create([
                        'product_id' => $ownerProduct->id,
                        'stock_type' => 'fill',
                        'movement_type' => 'in',
                        'qty' => $qtyDiterima,
                        'ending_balance' => (int) $ownerProduct->stock_content,
                        'reference_type' => 'purchase_order',
                        'reference_id' => $po->id,
                        'description' => "Penerimaan PO {$po->po_number} ({$receipt->receipt_number})",
                        'created_by' => $user->id,
                    ]);
                }
            }

            $lengkap = $po->items->every(fn ($item) => GoodsReceiptItem::where('purchase_order_item_id', $item->id)
                ->sum('qty_diterima') >= $item->qty_ordered);

            if ($lengkap || $totalDiterima > 0) {
                $po->update(['status' => 'received']);
            }

            ActivityLogger::log(
                $user,
                'status_change',
                'purchase_order',
                "Menerima barang PO {$po->po_number} ({$receipt->receipt_number}) dan memperbarui stok depot",
                ['po_id' => $po->id, 'receipt_id' => $receipt->id],
                $request
            );

            return $receipt->load('items.product');
        });

        return response()->json([
            'success' => true,
            'message' => 'Penerimaan barang berhasil disimpan dan stok telah diperbarui.',
            'data' => $receipt,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $receipt = GoodsReceipt::findOrFail($id);

        $receipt->update($request->validate([
            'document_type' => 'sometimes|in:do,invoice,do_and_invoice',
            'document_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Data penerimaan barang diperbarui.',
            'data' => $receipt,
        ]);
    }

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
            $ownerCategory = Category::whereNull('vendor_id')->first() ?? Category::first();
        }

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
        $prefix = 'GR-' . now()->format('Ymd') . '-';
        $seq = GoodsReceipt::where('receipt_number', 'like', $prefix . '%')->count() + 1;

        do {
            $candidate = $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);
            $seq++;
        } while (GoodsReceipt::where('receipt_number', $candidate)->exists());

        return $candidate;
    }
}
