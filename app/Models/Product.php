<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $fillable = [
        'vendor_id',
        'source_product_id',
        'category_id',
        'sku',
        'name',
        'variant',
        'unit',
        'selling_price',
        'deposit_price',
        'purchase_price',
        'stock_content',
        'empty_stock',
        'minimum_stock',
        'is_active',
    ];

    protected $casts = [
        'selling_price' => 'decimal:2',
        'deposit_price' => 'decimal:2',
        'purchase_price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function sourceProduct()
    {
        return $this->belongsTo(self::class, 'source_product_id');
    }

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
