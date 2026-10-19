<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContainerReturn extends Model
{
    protected $fillable = [
        'vendor_id',
        'purchase_order_id',
        'product_id',
        'qty_returned',
        'qty_claim_damaged',
        'claim_status',
    ];

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
