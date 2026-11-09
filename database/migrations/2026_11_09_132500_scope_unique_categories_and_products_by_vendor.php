<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        try {
            $categoryIndexes = collect(DB::select('SHOW INDEX FROM `categories` WHERE Non_unique = 0 AND Key_name != "PRIMARY"'))
                ->groupBy('Key_name');

            foreach ($categoryIndexes as $keyName => $columns) {
                $colNames = $columns->pluck('Column_name')->all();
                if (!in_array('vendor_id', $colNames, true)) {
                    DB::statement("ALTER TABLE `categories` DROP INDEX `{$keyName}`");
                }
            }
        } catch (\Throwable $e) {
            // Ignore if already dropped
        }

        try {
            $productIndexes = collect(DB::select('SHOW INDEX FROM `products` WHERE Non_unique = 0 AND Key_name != "PRIMARY"'))
                ->groupBy('Key_name');

            foreach ($productIndexes as $keyName => $columns) {
                $colNames = $columns->pluck('Column_name')->all();
                if (!in_array('vendor_id', $colNames, true)) {
                    DB::statement("ALTER TABLE `products` DROP INDEX `{$keyName}`");
                }
            }
        } catch (\Throwable $e) {
            // Ignore if already dropped
        }
    }

    public function down(): void
    {
        // No-op
    }
};
