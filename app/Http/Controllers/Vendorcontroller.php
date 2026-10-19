<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\Request;

class VendorController extends Controller
{
    public function index(Request $request)
    {
        return Vendor::with('categories')
            ->when($request->search, fn ($q, $v) => $q->where('name', 'like', "%{$v}%"))
            ->orderBy('name')
            ->paginate(15);
    }

    public function show($id)
    {
        return Vendor::with('categories')->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());

        $vendor = Vendor::create(collect($data)->except('category_ids')->all());

        if (isset($data['category_ids'])) {
            $vendor->categories()->sync($data['category_ids']);
        }

        return response()->json($vendor->load('categories'), 201);
    }

    public function update(Request $request, $id)
    {
        $vendor = Vendor::findOrFail($id);

        $data = $request->validate($this->rules(true));

        $vendor->update(collect($data)->except('category_ids')->all());

        if (isset($data['category_ids'])) {
            $vendor->categories()->sync($data['category_ids']);
        }

        return $vendor->load('categories');
    }

    public function destroy($id)
    {
        $vendor = Vendor::findOrFail($id);

        if ($vendor->purchaseOrders()->exists()) {
            return response()->json(['message' => 'Vendor sudah punya Purchase Order, tidak bisa dihapus.'], 409);
        }

        $vendor->categories()->detach();
        $vendor->delete();

        return response()->json(['message' => 'Vendor dihapus.']);
    }

    private function rules(bool $partial = false): array
    {
        return [
            'name' => ($partial ? 'sometimes|required' : 'required') . '|string|max:150',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'user_id' => 'nullable|exists:users,id',
            'category_ids' => 'sometimes|array',
            'category_ids.*' => 'exists:categories,id',
        ];
    }
}
