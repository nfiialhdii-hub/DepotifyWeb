<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('po_number', 30)->unique();
            $table->date('po_date');
            $table->foreignId('vendor_id')->constrained('vendor')->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->date('expected_delivery_date')->nullable();
            $table->string('shipping_address')->nullable();
            $table->string('shipping_method', 50)->nullable();
            $table->decimal('subtotal_price', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total_price', 14, 2)->default(0);
            $table->enum('status', [
                'draft', 'ordered', 'confirmed', 'shipped', 'received', 'rejected', 'cancelled',
            ])->default('draft');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_orders');
    }
};
