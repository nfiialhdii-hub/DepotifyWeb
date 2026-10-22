<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            if (!Schema::hasColumn('categories', 'vendor_id')) {
                $table->foreignId('vendor_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('vendor')
                    ->nullOnDelete();
            }
        });

        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'vendor_id')) {
                $table->foreignId('vendor_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('vendor')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('products', 'source_product_id')) {
                $table->foreignId('source_product_id')
                    ->nullable()
                    ->after('vendor_id')
                    ->constrained('products')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'source_product_id')) {
                $table->dropConstrainedForeignId('source_product_id');
            }
            if (Schema::hasColumn('products', 'vendor_id')) {
                $table->dropConstrainedForeignId('vendor_id');
            }
        });

        Schema::table('categories', function (Blueprint $table) {
            if (Schema::hasColumn('categories', 'vendor_id')) {
                $table->dropConstrainedForeignId('vendor_id');
            }
        });
    }
};
