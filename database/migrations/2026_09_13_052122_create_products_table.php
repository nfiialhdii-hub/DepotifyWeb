<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('categories')->restrictOnDelete();
            $table->string('sku', 50)->unique()->nullable();
            $table->string('name', 150);
            $table->string('variant', 50)->nullable();
            $table->enum('unit', ['canister', 'gallon', 'pcs', 'other']);
            $table->boolean('uses_container')->default(false);
            $table->decimal('refill_price', 12, 2)->default(0);
            $table->decimal('deposit_price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->default(0);
            $table->integer('stock_content')->default(0);
            $table->integer('empty_stock')->default(0);
            $table->integer('minimum_stock')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
