<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Product::with('category');

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            $query->where('vendor_id', $vendor->id);
        } else {
            $query->whereNull('vendor_id');
        }

        $products = $query
            ->when(
                $request->search,
                function ($query, $value) {
                    $query->where(function ($query) use ($value) {
                        $query->where('name', 'like', "%{$value}%")
                            ->orWhere('sku', 'like', "%{$value}%");
                    });
                }
            )
            ->when(
                $request->category_id,
                function ($query, $value) {
                    $query->where('category_id', $value);
                }
            )
            ->orderBy('name')
            ->get();

        $stockData = $products->map(function ($product) {
            $stockContent = (int) $product->stock_content;
            $emptyStock = (int) $product->empty_stock;
            $minimumStock = (int) $product->minimum_stock;

            if ($stockContent <= 0) {
                $status = 'habis';
            } elseif ($stockContent <= $minimumStock) {
                $status = 'menipis';
            } else {
                $status = 'aman';
            }

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'category' => $product->category
                    ? $product->category->name
                    : null,
                'category_id' => $product->category_id,
                'variant' => $product->variant,
                'unit' => $product->unit,
                'stock_content' => $stockContent,
                'empty_stock' => $emptyStock,
                'minimum_stock' => $minimumStock,
                'status' => $status,
                'is_active' => (bool) $product->is_active,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Data stok berhasil diambil.',
            'data' => [
                'summary' => [
                    'total_products' => $stockData->count(),
                    'total_stock_content' => $stockData->sum('stock_content'),
                    'total_empty_stock' => $stockData->sum('empty_stock'),
                    'low_stock_products' => $stockData
                        ->whereIn('status', ['menipis', 'habis'])
                        ->count(),
                ],
                'products' => $stockData,
            ],
        ], 200);
    }

    public function show(Request $request, $id)
    {
        $product = Product::with('category')->findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $product->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke stok produk ini.',
                ], 403);
            }
        }

        $stockContent = (int) $product->stock_content;
        $minimumStock = (int) $product->minimum_stock;

        if ($stockContent <= 0) {
            $status = 'habis';
        } elseif ($stockContent <= $minimumStock) {
            $status = 'menipis';
        } else {
            $status = 'aman';
        }

        return response()->json([
            'success' => true,
            'message' => 'Detail stok berhasil diambil.',
            'data' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'category' => $product->category
                    ? $product->category->name
                    : null,
                'category_id' => $product->category_id,
                'variant' => $product->variant,
                'unit' => $product->unit,
                'stock_content' => $stockContent,
                'empty_stock' => (int) $product->empty_stock,
                'minimum_stock' => $minimumStock,
                'status' => $status,
                'is_active' => (bool) $product->is_active,
            ],
        ], 200);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $product->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah stok produk ini.',
                ], 403);
            }
        }

        $validated = $request->validate([
            'stock_content' => ['required', 'integer', 'min:0'],
            'empty_stock' => ['nullable', 'integer', 'min:0'],
            'minimum_stock' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($product, $validated, $user) {
            $previousStock = (int) $product->stock_content;
            $newStock = (int) $validated['stock_content'];
            $diff = $newStock - $previousStock;

            $product->update([
                'stock_content' => $newStock,
                'empty_stock' => isset($validated['empty_stock'])
                    ? (int) $validated['empty_stock']
                    : (int) $product->empty_stock,
                'minimum_stock' => isset($validated['minimum_stock'])
                    ? (int) $validated['minimum_stock']
                    : (int) $product->minimum_stock,
            ]);

            if ($diff !== 0) {
                StockMovement::create([
                    'product_id' => $product->id,
                    'stock_type' => 'fill',
                    'movement_type' => $diff > 0 ? 'in' : 'adjustment',
                    'qty' => abs($diff),
                    'ending_balance' => $newStock,
                    'reference_type' => 'stock_adjustment',
                    'reference_id' => $product->id,
                    'description' => $validated['notes'] ?? 'Penyesuaian stok gudang',
                    'created_by' => $user->id,
                ]);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Stok berhasil diperbarui.',
            'data' => $product->fresh('category'),
        ]);
    }

    private function resolveVendor(User $user): Vendor
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
}
