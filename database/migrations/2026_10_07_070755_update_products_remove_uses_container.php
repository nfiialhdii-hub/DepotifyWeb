<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->renameColumn(
                'refill_price',
                'selling_price'
            );

            $table->dropColumn(
                'uses_container'
            );
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->renameColumn(
                'selling_price',
                'refill_price'
            );

            $table->boolean('uses_container')
                ->default(false)
                ->after('unit');
        });
    }
};
