<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\StockNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockMovementController extends Controller
{
    public function index(Request $request)
    {
        $stockType = $request->input('stock_type', $request->input('jenis_stok'));
        if ($stockType === 'isi') {
            $stockType = 'fill';
        } elseif ($stockType === 'kosong') {
            $stockType = 'empty';
        }

        $movementType = $request->input('movement_type', $request->input('tipe'));
        if ($movementType === 'masuk') {
            $movementType = 'in';
        } elseif ($movementType === 'keluar') {
            $movementType = 'out';
        } elseif ($movementType === 'penyesuaian') {
            $movementType = 'adjustment';
        }

        $paginator = StockMovement::with(['product:id,name,variant,sku,unit,stock_content,empty_stock', 'creator:id,name'])
            ->when($request->product_id, fn ($q, $v) => $q->where('product_id', $v))
            ->when($stockType, fn ($q, $v) => $q->where('stock_type', $v))
            ->when($movementType, fn ($q, $v) => $q->where('movement_type', $v))
            ->when($request->from, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($request->to, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->latest('created_at')
            ->latest('id')
            ->paginate(25);

        return response()->json([
            'success' => true,
            'message' => 'Riwayat pergerakan stok berhasil diambil.',
            'data' => $paginator->items(),
            'current_page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    public function show($id)
    {
        $movement = StockMovement::with(['product', 'creator:id,name'])->findOrFail($id);

        return response()->json([
            'success' => true,
            'message' => 'Detail pergerakan stok berhasil diambil.',
            'data' => $movement,
        ]);
    }

    public function masuk(Request $request)
    {
        $request->merge(['movement_type' => 'in']);
        return $this->store($request);
    }

    public function keluar(Request $request)
    {
        $request->merge(['movement_type' => 'out']);
        return $this->store($request);
    }

    public function penyesuaian(Request $request)
    {
        $request->merge(['movement_type' => 'adjustment']);
        return $this->store($request);
    }

    public function store(Request $request)
    {
        $rawStockType = strtolower((string) $request->input('stock_type', 'fill'));
        if ($rawStockType === 'isi') {
            $request->merge(['stock_type' => 'fill']);
        } elseif ($rawStockType === 'kosong') {
            $request->merge(['stock_type' => 'empty']);
        }

        $rawMovementType = strtolower((string) $request->input('movement_type', 'in'));
        if ($rawMovementType === 'masuk') {
            $request->merge(['movement_type' => 'in']);
        } elseif ($rawMovementType === 'keluar') {
            $request->merge(['movement_type' => 'out']);
        } elseif ($rawMovementType === 'penyesuaian') {
            $request->merge(['movement_type' => 'adjustment']);
        }

        $data = $request->validate([
            'product_id' => 'required|exists:products,id',
            'stock_type' => 'required|in:fill,empty',
            'movement_type' => 'required|in:in,out,adjustment',
            'qty' => 'required|integer|not_in:0',
            'description' => 'nullable|string',
        ]);

        if ($data['movement_type'] !== 'adjustment' && $data['qty'] < 0) {
            throw ValidationException::withMessages(['qty' => 'Qty harus lebih dari 0 untuk in/out.']);
        }

        $movement = DB::transaction(function () use ($data, $request) {
            $sourceProduct = Product::lockForUpdate()->findOrFail($data['product_id']);

            // Jika yang login adalah Owner dan produk yang dikirim adalah produk katalog Supplier (vendor_id != null),
            // arahkan ke produk padanannya di gudang Depot Owner (vendor_id = null).
            $product = $sourceProduct;
            if ($request->user()?->isOwner() && $sourceProduct->vendor_id !== null) {
                $ownerProd = Product::whereNull('vendor_id')
                    ->where(function ($q) use ($sourceProduct) {
                        $q->where('source_product_id', $sourceProduct->id)
                            ->orWhere('name', $sourceProduct->name);
                    })
                    ->lockForUpdate()
                    ->first();

                if ($ownerProd) {
                    $product = $ownerProd;
                }
            }

            // Cegah double-increment jika panggilan ini berasal dari Direct Receive PO di Android
            // yang sebelumnya sudah ditambahkan stoknya secara otomatis oleh PurchaseOrderController@update
            $description = (string) ($data['description'] ?? '');
            if (
                $data['movement_type'] === 'in'
                && preg_match('/PO\s*#?(\d+)/i', $description, $matches)
            ) {
                $poId = (int) $matches[1];
                $existingPoMovement = StockMovement::where('product_id', $product->id)
                    ->where('movement_type', 'in')
                    ->where(function ($q) use ($poId) {
                        $q->where(function ($sub) use ($poId) {
                            $sub->whereIn('reference_type', ['purchase_order', 'goods_receipt'])
                                ->where('reference_id', $poId);
                        })->orWhere('description', 'like', "%PO-{$poId}%")
                          ->orWhere('description', 'like', "%PO #{$poId}%");
                    })
                    ->latest('id')
                    ->first();

                if ($existingPoMovement) {
                    return $existingPoMovement->load('product');
                }
            }

            $column = $data['stock_type'] === 'fill' ? 'stock_content' : 'empty_stock';

            if ($data['movement_type'] === 'adjustment') {
                // Untuk penyesuaian stok opname, jika qty >= 0 maka dapat berupa saldo baru atau delta
                $balance = max(0, (int) $data['qty']);
                $qtyMoved = abs($balance - (int) $product->{$column});
            } else {
                $delta = $data['movement_type'] === 'out' ? -abs((int) $data['qty']) : abs((int) $data['qty']);
                $balance = (int) $product->{$column} + $delta;
                $qtyMoved = abs((int) $data['qty']);
            }

            if ($balance < 0) {
                throw ValidationException::withMessages([
                    'qty' => "Stok tidak cukup (tersisa {$product->{$column}}).",
                ]);
            }

            $product->{$column} = $balance;
            $product->save();

            $refType = 'manual';
            $refId = null;
            if (preg_match('/PO\s*#?(\d+)/i', $description, $poMatch)) {
                $refType = 'purchase_order';
                $refId = (int) $poMatch[1];
            }

            $movement = StockMovement::create([
                'product_id' => $product->id,
                'stock_type' => $data['stock_type'],
                'movement_type' => $data['movement_type'],
                'qty' => $qtyMoved > 0 ? $qtyMoved : abs((int) $data['qty']),
                'ending_balance' => $balance,
                'reference_type' => $refType,
                'reference_id' => $refId,
                'description' => $data['description'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            if ($data['stock_type'] === 'fill'
                && $data['movement_type'] !== 'in'
                && $product->is_active
                && $product->stock_content <= $product->minimum_stock
                && ! StockNotification::where('product_id', $product->id)
                    ->where('type', 'stock_depleting')
                    ->where('is_read', false)
                    ->exists()) {
                StockNotification::create([
                    'product_id' => $product->id,
                    'type' => 'stock_depleting',
                    'message' => "Stok {$product->name} menipis: sisa {$product->stock_content} (minimum {$product->minimum_stock}).",
                ]);
            }

            return $movement->load('product');
        });

        return response()->json([
            'success' => true,
            'message' => 'Transaksi pergerakan stok berhasil disimpan.',
            'data' => $movement,
        ], 201);
    }
}
