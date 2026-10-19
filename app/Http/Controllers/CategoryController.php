<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    /*
    |--------------------------------------------------------------------------
    | GET /categories
    |--------------------------------------------------------------------------
    */

    public function index(Request $request)
    {
        return Category::query()
            ->when(
                $request->search,
                function ($query, $value) {
                    $query->where(function ($query) use ($value) {
                        $query->where(
                            'code',
                            'like',
                            "%{$value}%"
                        )
                        ->orWhere(
                            'name',
                            'like',
                            "%{$value}%"
                        );
                    });
                }
            )
            ->orderBy('name')
            ->paginate(15);
    }


    /*
    |--------------------------------------------------------------------------
    | GET /categories/{id}
    |--------------------------------------------------------------------------
    */

    public function show($id)
    {
        return Category::findOrFail($id);
    }


    /*
    |--------------------------------------------------------------------------
    | POST /categories
    |--------------------------------------------------------------------------
    */

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                'unique:categories,code',
            ],

            'name' => [
                'required',
                'string',
                'max:100',
            ],

            'description' => [
                'nullable',
                'string',
            ],
        ]);


        $category = Category::create(
            $validated
        );


        return response()->json([
            'success' => true,

            'message' =>
                'Kategori berhasil ditambahkan.',

            'data' => $category,

        ], 201);
    }


    /*
    |--------------------------------------------------------------------------
    | PUT /categories/{id}
    |--------------------------------------------------------------------------
    */

    public function update(
        Request $request,
        $id
    ) {
        $category =
            Category::findOrFail($id);


        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',

                Rule::unique(
                    'categories',
                    'code'
                )->ignore(
                    $category->id
                ),
            ],

            'name' => [
                'required',
                'string',
                'max:100',
            ],

            'description' => [
                'nullable',
                'string',
            ],
        ]);


        $category->update(
            $validated
        );


        return response()->json([
            'success' => true,

            'message' =>
                'Kategori berhasil diperbarui.',

            'data' => $category,

        ]);
    }


    /*
    |--------------------------------------------------------------------------
    | DELETE /categories/{id}
    |--------------------------------------------------------------------------
    */

    public function destroy($id)
    {
        $category =
            Category::findOrFail($id);


        /*
        | Jangan hapus kategori kalau
        | masih digunakan oleh produk.
        */

        if ($category->products()->exists()) {

            return response()->json([
                'success' => false,

                'message' =>
                    'Kategori tidak dapat dihapus karena masih digunakan oleh produk. Hapus atau pindahkan produk terlebih dahulu.',

            ], 409);
        }


        $category->delete();


        return response()->json([
            'success' => true,

            'message' =>
                'Kategori berhasil dihapus.',

            'data' => null,

        ]);
    }
}
