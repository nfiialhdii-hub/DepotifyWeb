<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\PurchaseOrderItem;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Product::with(['category', 'vendor']);

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            $query->where('vendor_id', $vendor->id);
        } else {
            // Untuk Owner/Admin:
            // Jika meminta katalog milik Supplier (saat buat PO), filter berdasarkan vendor_id / scope=supplier
            if ($request->filled('vendor_id')) {
                $query->where('vendor_id', $request->vendor_id);
            } elseif ($request->input('scope') === 'supplier') {
                $query->whereNotNull('vendor_id');
            } else {
                // Default menu Produk Admin: hanya tampilkan produk milik Depot Owner
                $query->whereNull('vendor_id');
            }
        }

        return $query
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
            ->paginate(50);
    }

    public function show(Request $request, $id)
    {
        $product = Product::with(['category', 'vendor'])->findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $product->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke produk ini.',
                ], 403);
            }
        }

        return $product;
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $vendor = ($user && $user->isVendor()) ? $this->resolveVendor($user) : null;

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
                $vendor ? 'nullable' : 'required',
                'numeric',
                'min:0',
            ],
            'stock_content' => [
                'nullable',
                'integer',
                'min:0',
            ],
            'empty_stock' => [
                'nullable',
                'integer',
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

        // Untuk Supplier, harga pasokan ke Depot disimpan pada selling_price dan disinkronkan ke purchase_price
        if ($vendor && (!isset($validated['purchase_price']) || $validated['purchase_price'] === null)) {
            $validated['purchase_price'] = $validated['selling_price'];
        }

        $product = Product::create([
            ...$validated,
            'vendor_id' => $vendor?->id,
            'stock_content' => (int) ($validated['stock_content'] ?? 0),
            'empty_stock' => (int) ($validated['empty_stock'] ?? 0),
            'minimum_stock' => (int) ($validated['minimum_stock'] ?? 0),
        ]);

        if ($vendor) {
            $vendor->categories()->syncWithoutDetaching([$product->category_id]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil ditambahkan.',
            'data' => $product->load(['category', 'vendor']),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $user = $request->user();
        $vendor = ($user && $user->isVendor()) ? $this->resolveVendor($user) : null;

        if ($vendor && (int) $product->vendor_id !== (int) $vendor->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah produk ini.',
            ], 403);
        }

        $validated = $request->validate([
            'category_id' => [
                'required',
                'exists:categories,id',
            ],
            'sku' => [
                'nullable',
                'string',
                'max:50',
                Rule::unique('products', 'sku')->ignore($product->id),
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
                $vendor ? 'nullable' : 'required',
                'numeric',
                'min:0',
            ],
            'stock_content' => [
                'nullable',
                'integer',
                'min:0',
            ],
            'empty_stock' => [
                'nullable',
                'integer',
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

        if ($vendor && (!isset($validated['purchase_price']) || $validated['purchase_price'] === null)) {
            $validated['purchase_price'] = $validated['selling_price'];
        }

        $product->update($validated);

        if ($vendor) {
            $vendor->categories()->syncWithoutDetaching([$product->category_id]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil diperbarui.',
            'data' => $product->load(['category', 'vendor']),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $product->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk menghapus produk ini.',
                ], 403);
            }
        }

        if (
            $product->stockMovements()->exists()
            || PurchaseOrderItem::where('product_id', $product->id)->exists()
        ) {
            return response()->json([
                'success' => false,
                'message' => 'Produk sudah memiliki riwayat transaksi. Nonaktifkan produk saja.',
            ], 409);
        }

        $product->delete();

        return response()->json([
            'success' => true,
            'message' => 'Produk berhasil dihapus.',
            'data' => null,
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
