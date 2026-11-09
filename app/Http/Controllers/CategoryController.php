<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Category::query();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            $query->where('vendor_id', $vendor->id);
        } elseif (!$request->boolean('include_vendor')) {
            $query->whereNull('vendor_id');
        }

        return $query
            ->when(
                $request->search,
                function ($query, $value) {
                    $query->where(function ($query) use ($value) {
                        $query->where('code', 'like', "%{$value}%")
                            ->orWhere('name', 'like', "%{$value}%");
                    });
                }
            )
            ->orderBy('name')
            ->paginate(50);
    }

    public function show(Request $request, $id)
    {
        $category = Category::findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $category->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke kategori ini.',
                ], 403);
            }
        }

        return $category;
    }

    public function store(Request $request)
    {
        $this->ensureVendorScopedCategoryIndexes();

        $user = $request->user();
        $vendor = ($user && $user->isVendor()) ? $this->resolveVendor($user) : null;

        $codeUniqueRule = Rule::unique('categories', 'code');
        $nameUniqueRule = Rule::unique('categories', 'name');

        if ($vendor) {
            $codeUniqueRule = $codeUniqueRule->where('vendor_id', $vendor->id);
            $nameUniqueRule = $nameUniqueRule->where('vendor_id', $vendor->id);
        } else {
            $codeUniqueRule = $codeUniqueRule->whereNull('vendor_id');
            $nameUniqueRule = $nameUniqueRule->whereNull('vendor_id');
        }

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                $codeUniqueRule,
            ],
            'name' => [
                'required',
                'string',
                'max:100',
                $nameUniqueRule,
            ],
            'description' => [
                'nullable',
                'string',
            ],
        ], [
            'code.unique' => 'Kode kategori ini sudah digunakan di daftar kategori Anda.',
            'name.unique' => 'Nama kategori ini sudah ada di daftar kategori Anda.',
        ]);

        $category = Category::create([
            ...$validated,
            'vendor_id' => $vendor?->id,
        ]);

        if ($vendor) {
            $vendor->categories()->syncWithoutDetaching([$category->id]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Kategori berhasil ditambahkan.',
            'data' => $category,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $this->ensureVendorScopedCategoryIndexes();

        $category = Category::findOrFail($id);
        $user = $request->user();
        $vendor = null;

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $category->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah kategori ini.',
                ], 403);
            }
        } elseif ($category->vendor_id !== null) {
            return response()->json([
                'success' => false,
                'message' => 'Kategori milik Supplier tidak dapat diubah dari akun Owner.',
            ], 403);
        }

        $codeUniqueRule = Rule::unique('categories', 'code')->ignore($category->id);
        $nameUniqueRule = Rule::unique('categories', 'name')->ignore($category->id);

        if ($vendor) {
            $codeUniqueRule = $codeUniqueRule->where('vendor_id', $vendor->id);
            $nameUniqueRule = $nameUniqueRule->where('vendor_id', $vendor->id);
        } else {
            $codeUniqueRule = $codeUniqueRule->whereNull('vendor_id');
            $nameUniqueRule = $nameUniqueRule->whereNull('vendor_id');
        }

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                $codeUniqueRule,
            ],
            'name' => [
                'required',
                'string',
                'max:100',
                $nameUniqueRule,
            ],
            'description' => [
                'nullable',
                'string',
            ],
        ], [
            'code.unique' => 'Kode kategori ini sudah digunakan di daftar kategori Anda.',
            'name.unique' => 'Nama kategori ini sudah ada di daftar kategori Anda.',
        ]);

        $category->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Kategori berhasil diperbarui.',
            'data' => $category,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $category = Category::findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $category->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk menghapus kategori ini.',
                ], 403);
            }
        } elseif ($category->vendor_id !== null) {
            return response()->json([
                'success' => false,
                'message' => 'Kategori milik Supplier tidak dapat dihapus dari akun Owner.',
            ], 403);
        }

        if ($category->products()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Kategori tidak dapat dihapus karena masih digunakan oleh produk. Hapus atau pindahkan produk terlebih dahulu.',
            ], 409);
        }

        $category->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kategori berhasil dihapus.',
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

    /**
     * Pastikan index unique global lama pada tabel categories (misal categories_code_unique / categories_name_unique)
     * dilepas dan diganti index komposit per vendor_id agar kategori Vendor tidak bentrok dengan kategori Owner.
     */
    private function ensureVendorScopedCategoryIndexes(): void
    {
        try {
            $indexes = collect(DB::select('SHOW INDEX FROM `categories` WHERE Non_unique = 0 AND Key_name != "PRIMARY"'))
                ->groupBy('Key_name');

            foreach ($indexes as $keyName => $columns) {
                $colNames = $columns->pluck('Column_name')->all();
                if (!in_array('vendor_id', $colNames, true)) {
                    DB::statement("ALTER TABLE `categories` DROP INDEX `{$keyName}`");
                }
            }
        } catch (\Throwable $e) {
            // Abaikan jika index sudah disesuaikan
        }
    }
}
