<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VendorController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureOwner($request);

        return Vendor::with([
            'categories',
            'user:id,name,email,role,is_active',
        ])
            ->when($request->search, fn ($query, $value) => $query->where('name', 'like', "%{$value}%"))
            ->orderBy('name')
            ->paginate(15);
    }

    public function show(Request $request, $id)
    {
        $this->ensureOwner($request);

        return Vendor::with([
            'categories',
            'user:id,name,email,role,is_active',
        ])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $this->ensureOwner($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string'],
            'account_email' => ['required', 'email', 'max:150', 'unique:users,email'],
            'account_password' => ['required', 'string', 'min:8', 'confirmed'],
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
        ]);

        $vendor = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['account_email'],
                'phone' => $data['phone'] ?? null,
                'password' => $data['account_password'],
                'role' => User::ROLE_VENDOR,
                'is_active' => true,
            ]);

            $vendor = Vendor::create([
                'user_id' => $user->id,
                'name' => $data['name'],
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
            ]);

            if (isset($data['category_ids'])) {
                $vendor->categories()->sync($data['category_ids']);
            }

            return $vendor;
        });

        return response()->json(
            $vendor->load(['categories', 'user:id,name,email,role,is_active']),
            201
        );
    }

    public function update(Request $request, $id)
    {
        $this->ensureOwner($request);
        $vendor = Vendor::with('user')->findOrFail($id);
        $passwordRule = $vendor->user_id
            ? ['nullable', 'string', 'min:8', 'confirmed']
            : ['required', 'string', 'min:8', 'confirmed'];

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string'],
            'account_email' => [
                'required', 'email', 'max:150',
                Rule::unique('users', 'email')->ignore($vendor->user_id),
            ],
            'account_password' => $passwordRule,
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
        ]);

        $vendor = DB::transaction(function () use ($vendor, $data) {
            $userData = [
                'name' => $data['name'],
                'email' => $data['account_email'],
                'phone' => $data['phone'] ?? null,
                'role' => User::ROLE_VENDOR,
                'is_active' => true,
            ];

            if (!empty($data['account_password'])) {
                $userData['password'] = $data['account_password'];
            }

            if ($vendor->user) {
                $vendor->user->update($userData);
            } else {
                $vendor->user()->associate(User::create($userData));
            }

            $vendor->fill([
                'name' => $data['name'],
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
            ]);
            $vendor->save();

            if (isset($data['category_ids'])) {
                $vendor->categories()->sync($data['category_ids']);
            }

            return $vendor;
        });

        return $vendor->load(['categories', 'user:id,name,email,role,is_active']);
    }

    public function destroy(Request $request, $id)
    {
        $this->ensureOwner($request);
        $vendor = Vendor::with('user')->findOrFail($id);

        if ($vendor->purchaseOrders()->exists()) {
            return response()->json([
                'message' => 'Supplier sudah memiliki pesanan pembelian, sehingga tidak bisa dihapus.',
            ], 409);
        }

        DB::transaction(function () use ($vendor) {
            $user = $vendor->user;
            $vendor->categories()->detach();
            $vendor->delete();

            // Akun yang dibuat khusus untuk supplier ikut dihapus agar tidak menjadi akun yatim.
            if ($user && $user->role === User::ROLE_VENDOR) {
                $user->tokens()->delete();
                $user->delete();
            }
        });

        return response()->json(['message' => 'Data supplier dan akun loginnya berhasil dihapus.']);
    }

    private function ensureOwner(Request $request): void
    {
        abort_unless(
            $request->user() && $request->user()->isOwner(),
            403,
            'Hanya owner yang boleh mengelola data dan akun supplier.'
        );
    }
}
