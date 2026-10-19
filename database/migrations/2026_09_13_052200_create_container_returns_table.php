<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('container_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained('vendor')->restrictOnDelete();
            $table->foreignId('purchase_order_id')->nullable()
                ->constrained('purchase_orders')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->integer('qty_returned');
            $table->integer('qty_claim_damaged')->default(0);
            $table->enum('claim_status', ['not_existing', 'submitted', 'approved', 'rejected'])->default('not_existing');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('container_returns');
    }
};