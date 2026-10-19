<?php

namespace App\Http\Controllers;

use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GoodsReceiptController extends Controller
{
    public function index(Request $request)
    {
        return GoodsReceipt::with(['purchaseOrder.vendor', 'checker:id,name'])
            ->when($request->purchase_order_id, fn ($q, $v) => $q->where('purchase_order_id', $v))
            ->latest('received_date')
            ->paginate(15);
    }

    public function show($id)
    {
        return GoodsReceipt::with(['purchaseOrder.vendor', 'checker:id,name', 'items.product'])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'purchase_order_id' => 'required|exists:purchase_orders,id',
            'received_date' => 'required|date',
            'document_type' => 'required|in:do,invoice,do_and_invoice',
            'document_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.purchase_order_item_id' => 'required|integer|distinct',
            'items.*.qty_diterima' => 'required|integer|min:0',
            'items.*.qty_ditolak' => 'nullable|integer|min:0',
            'items.*.catatan_qc' => 'nullable|string',
        ]);

        $receipt = DB::transaction(function () use ($data, $request) {
            $po = PurchaseOrder::with('items')->lockForUpdate()->findOrFail($data['purchase_order_id']);

            if (! in_array($po->status, ['ordered', 'confirmed', 'shipped'], true)) {
                throw ValidationException::withMessages([
                    'purchase_order_id' => "PO berstatus {$po->status}, tidak bisa menerima barang.",
                ]);
            }

            $poItems = $po->items->keyBy('id');
            $totalDiterima = 0;
            $totalDitolak = 0;

            foreach ($data['items'] as $i => $row) {
                $poItem = $poItems[$row['purchase_order_item_id']] ?? null;

                if (! $poItem) {
                    throw ValidationException::withMessages(["items.$i.purchase_order_item_id" => 'Item bukan bagian dari PO ini.']);
                }

                $sudahDiterima = (int) GoodsReceiptItem::where('purchase_order_item_id', $poItem->id)->sum('qty_diterima');

                if ($sudahDiterima + $row['qty_diterima'] > $poItem->qty_ordered) {
                    $sisa = $poItem->qty_ordered - $sudahDiterima;
                    throw ValidationException::withMessages(["items.$i.qty_diterima" => "Melebihi jumlah pesanan (sisa $sisa)."]);
                }

                $totalDiterima += $row['qty_diterima'];
                $totalDitolak += $row['qty_ditolak'] ?? 0;
            }

            $receipt = GoodsReceipt::create([
                'purchase_order_id' => $po->id,
                'receipt_number' => $this->newNumber(),
                'received_date' => $data['received_date'],
                'checked_by' => $request->user()->id,
                'qc_status' => $totalDitolak == 0 ? 'passed' : ($totalDiterima == 0 ? 'rejected' : 'partial'),
                'document_type' => $data['document_type'],
                'document_number' => $data['document_number'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($data['items'] as $row) {
                $poItem = $poItems[$row['purchase_order_item_id']];

                $receipt->items()->create([
                    'purchase_order_item_id' => $poItem->id,
                    'product_id' => $poItem->product_id,
                    'qty_diterima' => $row['qty_diterima'],
                    'qty_ditolak' => $row['qty_ditolak'] ?? 0,
                    'catatan_qc' => $row['catatan_qc'] ?? null,
                ]);

                if ($row['qty_diterima'] > 0) {
                    $product = Product::lockForUpdate()->find($poItem->product_id);
                    $product->stock_content += $row['qty_diterima'];
                    $product->save();

                    StockMovement::create([
                        'product_id' => $product->id,
                        'stock_type' => 'fill',
                        'movement_type' => 'in',
                        'qty' => $row['qty_diterima'],
                        'ending_balance' => $product->stock_content,
                        'reference_type' => 'goods_receipt',
                        'reference_id' => $receipt->id,
                        'description' => "Penerimaan {$receipt->receipt_number}",
                        'created_by' => $request->user()->id,
                    ]);
                }
            }

            $lengkap = $po->items->every(fn ($item) => GoodsReceiptItem::where('purchase_order_item_id', $item->id)
                ->sum('qty_diterima') >= $item->qty_ordered);

            if ($lengkap) {
                $po->update(['status' => 'received']);
            }

            return $receipt;
        });

        return response()->json($receipt->load('items'), 201);
    }

    public function update(Request $request, $id)
    {
        $receipt = GoodsReceipt::findOrFail($id);

        $receipt->update($request->validate([
            'document_type' => 'sometimes|in:do,invoice,do_and_invoice',
            'document_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
        ]));

        return $receipt;
    }

    private function newNumber(): string
    {
        $prefix = 'GR-' . now()->format('Ymd') . '-';
        $count = GoodsReceipt::where('receipt_number', 'like', $prefix . '%')->count();

        return $prefix . str_pad($count + 1, 4, '0', STR_PAD_LEFT);
    }
}
