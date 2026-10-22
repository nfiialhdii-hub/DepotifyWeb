<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserRole
{
    /**
     * Pastikan user yang login memiliki salah satu role yang diizinkan dan berstatus aktif.
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'error_code' => 'UNAUTHENTICATED',
            ], 401);
        }

        if (! $user->is_active) {
            $user->currentAccessToken()?->delete();

            return response()->json([
                'success' => false,
                'message' => 'Akun Anda tidak aktif.',
                'error_code' => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        if (! empty($roles) && ! in_array($user->role, $roles, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki hak akses untuk fitur ini.',
                'error_code' => 'FORBIDDEN_ROLE',
            ], 403);
        }

        return $next($request);
    }
}
