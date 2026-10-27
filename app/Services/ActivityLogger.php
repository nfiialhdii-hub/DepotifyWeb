<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Throwable;

class ActivityLogger
{
    private static bool $tableChecked = false;

    /**
     * Pastikan tabel activity_logs tersedia di database.
     */
    public static function ensureTableExists(): bool
    {
        if (self::$tableChecked) {
            return true;
        }

        try {
            if (!Schema::hasTable('activity_logs')) {
                Schema::create('activity_logs', function (Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('user_id')->nullable()->index();
                    $table->string('user_name', 150)->nullable();
                    $table->string('user_email', 150)->nullable();
                    $table->string('user_role', 50)->nullable()->index();
                    $table->string('action_type', 60)->index();
                    $table->string('module', 60)->index();
                    $table->string('description', 500);
                    $table->string('ip_address', 64)->nullable();
                    $table->string('user_agent', 255)->nullable();
                    $table->json('metadata')->nullable();
                    $table->timestamp('created_at')->useCurrent()->index();
                });
            }

            self::$tableChecked = true;
            return true;
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * Catat aktivitas user ke tabel activity_logs dengan aman (tidak menggagalkan transaksi utama).
     */
    public static function log(
        ?User $user,
        string $actionType,
        string $module,
        string $description,
        array $metadata = [],
        ?Request $request = null
    ): void {
        try {
            if (!self::ensureTableExists()) {
                return;
            }

            $req = $request ?? request();

            ActivityLog::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name ?? ($metadata['user_name'] ?? 'Sistem'),
                'user_email' => $user?->email ?? ($metadata['user_email'] ?? null),
                'user_role' => $user?->role ?? ($metadata['user_role'] ?? null),
                'action_type' => $actionType,
                'module' => $module,
                'description' => mb_substr($description, 0, 500),
                'ip_address' => $req ? $req->ip() : null,
                'user_agent' => $req ? mb_substr((string) $req->userAgent(), 0, 255) : null,
                'metadata' => !empty($metadata) ? $metadata : null,
                'created_at' => now(),
            ]);
        } catch (Throwable) {
            // Jangan gagalkan request utama jika pencatatan log mengalami kendala
        }
    }
}
