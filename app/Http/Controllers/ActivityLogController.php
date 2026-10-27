<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\PurchaseOrder;
use App\Models\SalesTransaction;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class ActivityLogController extends Controller
{
    /**
     * Tampilkan riwayat login & aktivitas seluruh akun di sistem Depotify.
     */
    public function index(Request $request)
    {
        ActivityLogger::ensureTableExists();
        $this->seedInitialHistoryIfNeeded();

        $query = ActivityLog::query();

        if ($request->filled('role')) {
            $query->where('user_role', $request->input('role'));
        }

        if ($request->filled('action_type')) {
            $actionType = $request->input('action_type');
            if ($actionType === 'auth') {
                $query->whereIn('action_type', ['login', 'logout', 'register']);
            } else {
                $query->where('action_type', $actionType);
            }
        }

        if ($request->filled('module')) {
            $query->where('module', $request->input('module'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($sub) use ($search) {
                $sub->where('user_name', 'like', "%{$search}%")
                    ->orWhere('user_email', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('module', 'like', "%{$search}%");
            });
        }

        $logs = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(150)
            ->get();

        // Daftar sesi token login yang tercatat di personal_access_tokens
        $recentSessions = [];
        try {
            $tokens = DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)
                ->orderByDesc('created_at')
                ->limit(25)
                ->get();

            $userIds = $tokens->pluck('tokenable_id')->unique()->all();
            $usersById = User::whereIn('id', $userIds)->get()->keyBy('id');

            foreach ($tokens as $tokenRow) {
                $u = $usersById->get($tokenRow->tokenable_id);
                if (!$u) {
                    continue;
                }

                $isExpired = $tokenRow->expires_at && now()->greaterThan($tokenRow->expires_at);

                $recentSessions[] = [
                    'id' => $tokenRow->id,
                    'user_id' => $u->id,
                    'user_name' => $u->name,
                    'user_email' => $u->email,
                    'user_role' => $u->role,
                    'login_at' => $tokenRow->created_at,
                    'last_used_at' => $tokenRow->last_used_at ?? $tokenRow->created_at,
                    'expires_at' => $tokenRow->expires_at,
                    'is_active_session' => !$isExpired,
                ];
            }
        } catch (Throwable) {
            // Abaikan jika tabel personal_access_tokens tidak dapat diakses
        }

        $summary = [
            'total_logs' => ActivityLog::count(),
            'login_count' => ActivityLog::whereIn('action_type', ['login', 'logout', 'register'])->count(),
            'transaction_actions' => ActivityLog::whereIn('module', ['purchase_order', 'sales_transaction', 'stock'])->count(),
            'active_sessions_count' => collect($recentSessions)->where('is_active_session', true)->count(),
        ];

        return response()->json([
            'success' => true,
            'message' => 'Riwayat aktivitas berhasil diambil.',
            'data' => [
                'summary' => $summary,
                'recent_sessions' => $recentSessions,
                'logs' => $logs,
            ],
        ]);
    }

    /**
     * Jika tabel activity_logs baru pertama kali dibuat dan masih kosong,
     * sinkronkan riwayat historis dari tabel token login, PO, penjualan, dan pergerakan stok.
     */
    private function seedInitialHistoryIfNeeded(): void
    {
        try {
            if (ActivityLog::count() > 0) {
                return;
            }

            $users = User::all()->keyBy('id');

            // 1. Riwayat sesi login dari personal_access_tokens
            $tokens = DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)
                ->orderBy('created_at')
                ->limit(40)
                ->get();

            foreach ($tokens as $tokenRow) {
                $user = $users->get($tokenRow->tokenable_id);
                if (!$user) {
                    continue;
                }

                $roleLabel = match ($user->role) {
                    'owner' => 'Owner / Admin',
                    'vendor' => 'Supplier',
                    'customer' => 'Customer / User',
                    default => $user->role,
                };

                ActivityLog::create([
                    'user_id' => $user->id,
                    'user_name' => $user->name,
                    'user_email' => $user->email,
                    'user_role' => $user->role,
                    'action_type' => 'login',
                    'module' => 'auth',
                    'description' => "Login ke sistem sebagai {$roleLabel} ({$user->email})",
                    'ip_address' => '127.0.0.1',
                    'created_at' => $tokenRow->created_at ?? now(),
                ]);
            }

            // 2. Riwayat Purchase Order
            $pos = PurchaseOrder::with(['vendor', 'creator'])->orderBy('created_at')->limit(30)->get();
            foreach ($pos as $po) {
                $creator = $po->creator ?: $users->firstWhere('role', 'owner');
                $vendorName = $po->vendor?->name ?? 'Supplier';

                ActivityLog::create([
                    'user_id' => $creator?->id,
                    'user_name' => $creator?->name ?? 'Owner Depotify',
                    'user_email' => $creator?->email,
                    'user_role' => $creator?->role ?? 'owner',
                    'action_type' => 'create',
                    'module' => 'purchase_order',
                    'description' => "Membuat Purchase Order {$po->po_number} ke {$vendorName} (Status: {$po->status})",
                    'ip_address' => '127.0.0.1',
                    'created_at' => $po->created_at ?? now(),
                ]);
            }

            // 3. Riwayat Sales Transaction
            $sales = SalesTransaction::with(['creator', 'customer'])->orderBy('created_at')->limit(30)->get();
            foreach ($sales as $sale) {
                $creator = $sale->creator ?: $users->firstWhere('role', 'owner');
                $custName = $sale->customer?->name ?? 'Pelanggan Walk-In';

                ActivityLog::create([
                    'user_id' => $creator?->id,
                    'user_name' => $creator?->name ?? 'Owner Depotify',
                    'user_email' => $creator?->email,
                    'user_role' => $creator?->role ?? 'owner',
                    'action_type' => 'create',
                    'module' => 'sales_transaction',
                    'description' => "Mencatat transaksi penjualan {$sale->transaction_code} ({$custName}) senilai Rp " . number_format((float) $sale->total_amount, 0, ',', '.'),
                    'ip_address' => '127.0.0.1',
                    'created_at' => $sale->created_at ?? $sale->transaction_date ?? now(),
                ]);
            }

            // 4. Riwayat Pergerakan Stok
            $movements = StockMovement::with(['creator', 'product'])->orderBy('created_at')->limit(30)->get();
            foreach ($movements as $mov) {
                $creator = $mov->creator ?: $users->firstWhere('role', 'owner');
                $prodName = $mov->product?->name ?? 'Produk';

                ActivityLog::create([
                    'user_id' => $creator?->id,
                    'user_name' => $creator?->name ?? 'Sistem',
                    'user_email' => $creator?->email,
                    'user_role' => $creator?->role ?? 'owner',
                    'action_type' => 'update',
                    'module' => 'stock',
                    'description' => ($mov->description ?: "Perubahan stok {$prodName} ({$mov->movement_type}: {$mov->qty})"),
                    'ip_address' => '127.0.0.1',
                    'created_at' => $mov->created_at ?? now(),
                ]);
            }
        } catch (Throwable) {
            // Abaikan jika sinkronisasi awal gagal
        }
    }
}
