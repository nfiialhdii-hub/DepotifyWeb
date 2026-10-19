<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_container_loans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('sales_transaction_item_id')->nullable()
                ->constrained('sales_transaction_items')->nullOnDelete();
            $table->integer('qty_borrowed');
            $table->integer('qty_returned')->default(0);
            $table->enum('status', ['outstanding', 'returned', 'lost'])->default('outstanding');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_container_loans');
    }
};