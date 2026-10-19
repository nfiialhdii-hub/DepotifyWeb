<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    protected $table = 'daily_reports';

    protected $fillable = [
        'date',
        'category_id',
        'input_method',
        'total_turnover',
        'transaction_total',
        'note',
        'created_by',
    ];

    protected $casts = [
        'date' => 'date',
        'total_turnover' => 'decimal:2',
    ];

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
