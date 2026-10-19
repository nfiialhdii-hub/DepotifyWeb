<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $fillable = [
        'category_id',
        'sku',
        'name',
        'variant',
        'unit',
        'selling_price',
        'deposit_price',
        'purchase_price',
        'minimum_stock',
        'is_active',
    ];

    protected $casts = [
        'selling_price' => 'decimal:2',
        'deposit_price' => 'decimal:2',
        'purchase_price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function stockMovements()
    {
        return $this->hasMany(StockMovement::class);
    }

    public function scopeStokMenipis($query)
    {
        return $query->whereColumn(
            'stock_content',
            '<=',
            'minimum_stock'
        );
    }
}
