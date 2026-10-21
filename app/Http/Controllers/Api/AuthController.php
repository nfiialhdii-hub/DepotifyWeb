<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Login API
     */
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
            'portal' => ['sometimes', 'in:owner,vendor'],
        ]);

        // Form login yang ada saat ini adalah portal Owner. Portal Supplier
        // dapat menggunakan endpoint yang sama dengan mengirim portal=vendor.
        $portal = $credentials['portal'] ?? 'owner';
        $user = User::where('email', $credentials['email'])->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Email atau password salah.',
                'error_code' => 'UNAUTHORIZED',
                'errors' => [],
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Akun tidak aktif.',
                'error_code' => 'FORBIDDEN_ROLE',
                'errors' => [],
            ], 403);
        }

        if ($user->role !== $portal) {
            return response()->json([
                'success' => false,
                'message' => $portal === 'owner'
                    ? 'Akun ini bukan akun Owner. Supplier menggunakan halaman login Supplier.'
                    : 'Akun ini bukan akun Supplier.',
                'error_code' => 'FORBIDDEN_ROLE',
                'errors' => [],
            ], 403);
        }

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
     * Logout API
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

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
        return response()->json([
            'success' => true,
            'message' => 'Data user berhasil diambil.',
            'data' => $request->user(),
        ], 200);
    }
}
