<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('activity_logs')) {
            Schema::create('activity_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('user_name', 150)->nullable();
                $table->string('user_email', 150)->nullable();
                $table->string('user_role', 50)->nullable()->index();
                $table->string('action_type', 60)->index(); // login, logout, register, create, update, delete, status_change
                $table->string('module', 60)->index(); // auth, product, category, stock, purchase_order, sales_transaction, vendor, profile
                $table->string('description', 500);
                $table->string('ip_address', 64)->nullable();
                $table->string('user_agent', 255)->nullable();
                $table->json('metadata')->nullable();
                $table->timestamp('created_at')->useCurrent()->index();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
