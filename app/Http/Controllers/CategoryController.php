<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
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
        $user = $request->user();
        $vendor = ($user && $user->isVendor()) ? $this->resolveVendor($user) : null;

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                'unique:categories,code',
            ],
            'name' => [
                'required',
                'string',
                'max:100',
            ],
            'description' => [
                'nullable',
                'string',
            ],
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
        $category = Category::findOrFail($id);
        $user = $request->user();

        if ($user && $user->isVendor()) {
            $vendor = $this->resolveVendor($user);
            if ((int) $category->vendor_id !== (int) $vendor->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah kategori ini.',
                ], 403);
            }
        }

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                Rule::unique('categories', 'code')->ignore($category->id),
            ],
            'name' => [
                'required',
                'string',
                'max:100',
            ],
            'description' => [
                'nullable',
                'string',
            ],
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
}
