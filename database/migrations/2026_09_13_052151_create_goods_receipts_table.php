<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->restrictOnDelete();
            $table->string('receipt_number', 30)->unique();
            $table->dateTime('received_date');
            $table->foreignId('checked_by')->constrained('users')->restrictOnDelete();
            $table->enum('qc_status', ['passed', 'partial', 'rejected']);
            $table->enum('document_type', ['do', 'invoice', 'do_and_invoice']);
            $table->string('document_number', 50)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_receipts');
    }
};