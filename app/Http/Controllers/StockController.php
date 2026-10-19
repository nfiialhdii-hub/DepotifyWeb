<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;

class StockController extends Controller
{
    public function index(Request $request)
    {
        $products = Product::with('category')
            ->when(
                $request->search,
                function ($query, $value) {
                    $query->where(function ($query) use ($value) {
                        $query->where('name', 'like', "%{$value}%")
                            ->orWhere('sku', 'like', "%{$value}%");
                    });
                }
            )
            ->when(
                $request->category_id,
                function ($query, $value) {
                    $query->where('category_id', $value);
                }
            )
            ->orderBy('name')
            ->get();

        $stockData = $products->map(function ($product) {
            $stockContent = (int) $product->stock_content;
            $emptyStock = (int) $product->empty_stock;
            $minimumStock = (int) $product->minimum_stock;

            if ($stockContent <= 0) {
                $status = 'habis';
            } elseif ($stockContent <= $minimumStock) {
                $status = 'menipis';
            } else {
                $status = 'aman';
            }

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'category' => $product->category
                    ? $product->category->name
                    : null,
                'category_id' => $product->category_id,
                'variant' => $product->variant,
                'unit' => $product->unit,
                'stock_content' => $stockContent,
                'empty_stock' => $emptyStock,
                'minimum_stock' => $minimumStock,
                'status' => $status,
                'is_active' => (bool) $product->is_active,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Data stok berhasil diambil.',
            'data' => [
                'summary' => [
                    'total_products' => $stockData->count(),
                    'total_stock_content' => $stockData->sum('stock_content'),
                    'total_empty_stock' => $stockData->sum('empty_stock'),
                    'low_stock_products' => $stockData
                        ->whereIn('status', ['menipis', 'habis'])
                        ->count(),
                ],
                'products' => $stockData,
            ],
        ], 200);
    }

    public function show($id)
    {
        $product = Product::with('category')->findOrFail($id);

        $stockContent = (int) $product->stock_content;
        $minimumStock = (int) $product->minimum_stock;

        if ($stockContent <= 0) {
            $status = 'habis';
        } elseif ($stockContent <= $minimumStock) {
            $status = 'menipis';
        } else {
            $status = 'aman';
        }

        return response()->json([
            'success' => true,
            'message' => 'Detail stok berhasil diambil.',
            'data' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'category' => $product->category
                    ? $product->category->name
                    : null,
                'category_id' => $product->category_id,
                'variant' => $product->variant,
                'unit' => $product->unit,
                'stock_content' => $stockContent,
                'empty_stock' => (int) $product->empty_stock,
                'minimum_stock' => $minimumStock,
                'status' => $status,
                'is_active' => (bool) $product->is_active,
            ],
        ], 200);
    }
}
