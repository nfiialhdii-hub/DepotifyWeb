<?php

namespace App\Http\Controllers;

use App\Models\StockNotification;
use Illuminate\Http\Request;

class StockNotificationController extends Controller
{
    public function index(Request $request)
    {
        return StockNotification::with('product:id,name,variant,stock_content,minimum_stock')
            ->when($request->has('is_read'), fn ($q) => $q->where('is_read', $request->boolean('is_read')))
            ->latest()
            ->latest('id')
            ->paginate(20);
    }

    public function show($id)
    {
        return StockNotification::with('product')->findOrFail($id);
    }

    public function update(Request $request, $id)
    {
        $notification = StockNotification::findOrFail($id);

        $data = $request->validate(['is_read' => 'boolean']);

        $notification->update(['is_read' => $data['is_read'] ?? true]);

        return $notification;
    }

    public function destroy($id)
    {
        StockNotification::findOrFail($id)->delete();

        return response()->json(['message' => 'Notifikasi dihapus.']);
    }
}
