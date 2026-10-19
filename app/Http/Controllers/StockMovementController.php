<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\StockNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockMovementController extends Controller
{
    public function index(Request $request)
    {
        return StockMovement::with(['product:id,name,variant', 'creator:id,name'])
            ->when($request->product_id, fn ($q, $v) => $q->where('product_id', $v))
            ->when($request->stock_type, fn ($q, $v) => $q->where('stock_type', $v))
            ->when($request->movement_type, fn ($q, $v) => $q->where('movement_type', $v))
            ->when($request->from, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($request->to, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->latest()
            ->latest('id')
            ->paginate(20);
    }

    public function show($id)
    {
        return StockMovement::with(['product', 'creator:id,name'])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'product_id' => 'required|exists:products,id',
            'stock_type' => 'required|in:fill,empty',
            'movement_type' => 'required|in:in,out,adjustment',
            'qty' => 'required|integer|not_in:0',
            'description' => 'required_if:movement_type,adjustment|nullable|string',
        ]);

        if ($data['movement_type'] !== 'adjustment' && $data['qty'] < 0) {
            throw ValidationException::withMessages(['qty' => 'Qty harus lebih dari 0 untuk in/out.']);
        }

        $movement = DB::transaction(function () use ($data, $request) {
            $product = Product::lockForUpdate()->findOrFail($data['product_id']);

            $column = $data['stock_type'] === 'fill' ? 'stock_content' : 'empty_stock';
            $delta = $data['movement_type'] === 'out' ? -$data['qty'] : $data['qty'];
            $balance = $product->{$column} + $delta;

            if ($balance < 0) {
                throw ValidationException::withMessages([
                    'qty' => "Stok tidak cukup (tersisa {$product->{$column}}).",
                ]);
            }

            $product->{$column} = $balance;
            $product->save();

            $movement = StockMovement::create([
                'product_id' => $product->id,
                'stock_type' => $data['stock_type'],
                'movement_type' => $data['movement_type'],
                'qty' => $data['qty'],
                'ending_balance' => $balance,
                'reference_type' => 'manual',
                'description' => $data['description'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            if ($data['stock_type'] === 'fill'
                && $data['movement_type'] !== 'in'
                && $product->is_active
                && $product->stock_content <= $product->minimum_stock
                && ! StockNotification::where('product_id', $product->id)
                    ->where('type', 'stock_depleting')
                    ->where('is_read', false)
                    ->exists()) {
                StockNotification::create([
                    'product_id' => $product->id,
                    'type' => 'stock_depleting',
                    'message' => "Stok {$product->name} menipis: sisa {$product->stock_content} (minimum {$product->minimum_stock}).",
                ]);
            }

            return $movement;
        });

        return response()->json($movement, 201);
    }
}
