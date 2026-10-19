<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\PurchaseOrderItem;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        return Product::with('category')
            ->when(
                $request->category_id,
                fn ($q, $v) => $q->where('category_id', $v)
            )
            ->when(
                $request->search,
                fn ($q, $v) => $q->where(function ($q) use ($v) {
                    $q->where('name', 'like', "%{$v}%")
                        ->orWhere('sku', 'like', "%{$v}%");
                })
            )
            ->when(
                $request->boolean('low_stock'),
                fn ($q) => $q->stokMenipis()
            )
            ->orderBy('name')
            ->paginate(15);
    }

    public function show($id)
    {
        return Product::with('category')->findOrFail($id);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'category_id' => [
                'required',
                'exists:categories,id',
            ],

            'sku' => [
                'nullable',
                'string',
                'max:50',
                'unique:products,sku',
            ],

            'name' => [
                'required',
                'string',
                'max:150',
            ],

            'variant' => [
                'nullable',
                'string',
                'max:50',
            ],

            'unit' => [
                'required',
                'in:canister,gallon,pcs,other',
            ],

            'selling_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'deposit_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'purchase_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'minimum_stock' => [
                'nullable',
                'integer',
                'min:0',
            ],

            'is_active' => [
                'boolean',
            ],
        ]);

        $product = Product::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil ditambahkan.',
            'data' => $product->load('category'),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);

        $validated = $request->validate([
            'category_id' => [
                'required',
                'exists:categories,id',
            ],

            'sku' => [
                'nullable',
                'string',
                'max:50',
                Rule::unique('products', 'sku')
                    ->ignore($product->id),
            ],

            'name' => [
                'required',
                'string',
                'max:150',
            ],

            'variant' => [
                'nullable',
                'string',
                'max:50',
            ],

            'unit' => [
                'required',
                'in:canister,gallon,pcs,other',
            ],

            'selling_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'deposit_price' => [
                'nullable',
                'numeric',
                'min:0',
            ],

            'purchase_price' => [
                'required',
                'numeric',
                'min:0',
            ],

            'minimum_stock' => [
                'nullable',
                'integer',
                'min:0',
            ],

            'is_active' => [
                'boolean',
            ],
        ]);

        $product->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil diperbarui.',
            'data' => $product->load('category'),
        ]);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);

        if (
            $product->stockMovements()->exists()
            || PurchaseOrderItem::where(
                'product_id',
                $product->id
            )->exists()
        ) {
            return response()->json([
                'success' => false,
                'message' =>
                    'Produk sudah memiliki riwayat transaksi. ' .
                    'Nonaktifkan produk saja.',
            ], 409);
        }

        $product->delete();

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil dihapus.',
            'data' => null,
        ]);
    }
}
