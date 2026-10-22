<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    /**
     * Login API Terpadu (untuk Admin/Owner, Supplier, maupun User/Customer)
     */
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Email atau kata sandi salah.',
                'error_code' => 'UNAUTHORIZED',
                'errors' => [],
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Akun Anda sedang tidak aktif.',
                'error_code' => 'FORBIDDEN_ROLE',
                'errors' => [],
            ], 403);
        }

        $user = $this->hydrateUserRelations($user);
        $token = $user->createToken('depotify-api')->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Login berhasil.',
            'data' => [
                'user' => $user,
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ], 200);
    }

    /**
     * Registrasi Akun Baru (Khusus untuk User / Customer)
     * Setiap pendaftar otomatis mendapatkan role 'customer'.
     */
    public function register(Request $request)
    {
        $data = $request->validate(
            [
                'name' => ['required', 'string', 'max:150'],
                'email' => ['required', 'email', 'max:150', 'unique:users,email'],
                'phone' => ['nullable', 'string', 'max:20'],
                'address' => ['nullable', 'string', 'max:500'],
                'password' => ['required', 'string', 'min:8', 'confirmed'],
            ],
            [
                'name.required' => 'Nama lengkap wajib diisi.',
                'email.required' => 'Email wajib diisi.',
                'email.email' => 'Format email tidak valid.',
                'email.unique' => 'Email ini sudah terdaftar. Silakan gunakan email lain atau langsung masuk.',
                'password.required' => 'Kata sandi wajib diisi.',
                'password.min' => 'Kata sandi minimal 8 karakter.',
                'password.confirmed' => 'Konfirmasi kata sandi tidak cocok.',
            ]
        );

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'],
                'role' => User::ROLE_CUSTOMER,
                'is_active' => true,
            ]);

            Customer::create([
                'user_id' => $user->id,
                'name' => $data['name'],
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
            ]);

            return $user;
        });

        $user = $this->hydrateUserRelations($user);

        return response()->json([
            'success' => true,
            'message' => 'Registrasi akun berhasil! Silakan masuk menggunakan email dan kata sandi Anda.',
            'data' => [
                'user' => $user,
            ],
        ], 201);
    }

    /**
     * Logout API
     */
    public function logout(Request $request)
    {
        $accessToken = $request->user()?->currentAccessToken();

        if ($accessToken) {
            $accessToken->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil.',
            'data' => null,
        ], 200);
    }

    /**
     * Data user yang sedang login
     */
    public function me(Request $request)
    {
        $user = $request->user();

        if (!$user || !$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi tidak valid atau akun tidak aktif.',
                'error_code' => 'UNAUTHENTICATED',
            ], 401);
        }

        $user = $this->hydrateUserRelations($user);

        return response()->json([
            'success' => true,
            'message' => 'Data user berhasil diambil.',
            'data' => $user,
        ], 200);
    }

    /**
     * Perbarui profil User (role: customer)
     */
    public function updateCustomerProfile(Request $request)
    {
        $user = $request->user();

        abort_unless(
            $user && $user->isCustomer(),
            403,
            'Hanya akun User/Pelanggan yang dapat memperbarui profil ini.'
        );

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'email' => [
                'required',
                'email',
                'max:150',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:500'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
        ]);

        DB::transaction(function () use ($user, $data) {
            $userPayload = [
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
            ];

            if (!empty($data['password'])) {
                $userPayload['password'] = $data['password'];
            }

            $user->update($userPayload);

            Customer::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => $data['name'],
                    'phone' => $data['phone'] ?? null,
                    'address' => $data['address'] ?? null,
                ]
            );
        });

        $updatedUser = $this->hydrateUserRelations($user->fresh());

        return response()->json([
            'success' => true,
            'message' => 'Profil berhasil diperbarui.',
            'data' => $updatedUser,
        ]);
    }

    /**
     * Pastikan akun vendor/customer selalu memiliki entitas profil yang terhubung.
     */
    private function hydrateUserRelations(User $user): User
    {
        if ($user->isVendor()) {
            Vendor::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => $user->name,
                    'phone' => $user->phone,
                    'address' => null,
                ]
            );

            $user->load(['vendor.categories']);
        } elseif ($user->isCustomer()) {
            Customer::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'name' => $user->name,
                    'phone' => $user->phone,
                    'address' => null,
                ]
            );

            $user->load(['customer']);
        }

        return $user;
    }
}
