<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'po_number',
        'po_date',
        'vendor_id',
        'created_by',
        'payment_method',
        'expected_delivery_date',
        'shipping_address',
        'shipping_method',
        'subtotal_price',
        'tax',
        'total_price',
        'status',
        'notes',
    ];

    protected $casts = [
        'po_date' => 'date',
        'expected_delivery_date' => 'date',
        'subtotal_price' => 'decimal:2',
        'tax' => 'decimal:2',
        'total_price' => 'decimal:2',
    ];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items()
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function goodsReceipts()
    {
        return $this->hasMany(GoodsReceipt::class);
    }
}
