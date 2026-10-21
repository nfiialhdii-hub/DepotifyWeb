<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\PurchaseOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseOrderController extends Controller
{
    private const TRANSITIONS = [
        'draft' => ['ordered', 'cancelled'],
        'ordered' => ['confirmed', 'rejected', 'cancelled'],
        'confirmed' => ['shipped', 'cancelled'],
    ];

    public function index(Request $request)
    {
        return PurchaseOrder::with(['vendor', 'items'])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->vendor_id, fn ($q, $v) => $q->where('vendor_id', $v))
            ->latest('po_date')
            ->latest('id')
            ->paginate(15);
    }

    public function show($id)
    {
        return PurchaseOrder::with(['vendor', 'creator:id,name', 'items', 'goodsReceipts'])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());

        $po = DB::transaction(function () use ($data, $request) {
            $po = PurchaseOrder::create([
                ...Arr::except($data, ['items']),
                'po_date' => now()->toDateString(),
                'po_number' => $this->newNumber(),
                'created_by' => $request->user()->id,
                'status' => 'draft',
            ]);

            $this->saveItems($po, $data['items']);

            return $po;
        });

        return response()->json($po->load('items'), 201);
    }

    public function update(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        $data = $request->validate($this->rules(true) + [
            'status' => 'sometimes|in:ordered,confirmed,shipped,rejected,cancelled',
        ]);

        if (isset($data['items']) && $po->status !== 'draft') {
            return response()->json(['message' => 'Item hanya bisa diubah saat PO berstatus draft.'], 409);
        }

        if (isset($data['status']) && ! in_array($data['status'], self::TRANSITIONS[$po->status] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => "Status tidak bisa berubah dari {$po->status} ke {$data['status']}.",
            ]);
        }

        DB::transaction(function () use ($po, $data) {
            $po->update(Arr::except($data, ['items']));

            if (isset($data['items'])) {
                $po->items()->delete();
                $this->saveItems($po, $data['items']);
            } else {
                $po->update(['total_price' => $po->subtotal_price]);
            }
        });

        return $po->load('items');
    }

    public function destroy($id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json(['message' => 'Hanya PO berstatus draft yang bisa dihapus. Gunakan status cancelled.'], 409);
        }

        DB::transaction(function () use ($po) {
            $po->items()->delete();
            $po->delete();
        });

        return response()->json(['message' => 'PO dihapus.']);
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
            // Harga diambil dari data produk, bukan dari input form.
            $price = (float) $product->purchase_price;
            $total = round($item['qty_ordered'] * $price, 2);

            $po->items()->create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_description' => $item['product_description'] ?? null,
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

    private function newNumber(): string
    {
        $prefix = 'PO-' . now()->format('Ymd') . '-';
        $count = PurchaseOrder::where('po_number', 'like', $prefix . '%')->count();

        return $prefix . str_pad($count + 1, 4, '0', STR_PAD_LEFT);
    }
}
