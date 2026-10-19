<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockService
{
    /**
     * Kode error ketika stok tidak mencukupi.
     */
    public const ERROR_STOK_TIDAK_CUKUP = 'STOK_TIDAK_CUKUP';

    /**
     * Tambah stok.
     *
     * $jenisStok:
     * - isi
     * - kosong
     *
     * Akan dipetakan ke database:
     * - isi    -> fill
     * - kosong -> empty
     */
    public function masuk(
        Product $product,
        string $jenisStok,
        int $qty,
        string $referensiTipe,
        ?int $referensiId,
        User $user,
        ?string $keterangan = null
    ): StockMovement {

        if ($qty <= 0) {
            throw new \InvalidArgumentException(
                'Jumlah stok harus lebih dari 0.'
            );
        }

        if (! in_array($jenisStok, ['isi', 'kosong'], true)) {
            throw new \InvalidArgumentException(
                'Jenis stok tidak valid.'
            );
        }

        return DB::transaction(function () use (
            $product,
            $jenisStok,
            $qty,
            $referensiTipe,
            $referensiId,
            $user,
            $keterangan
        ) {

            /*
             * Lock product agar aman jika ada dua transaksi
             * yang mengubah stok secara bersamaan.
             */
            $locked = Product::whereKey($product->id)
                ->lockForUpdate()
                ->firstOrFail();

            /*
             * Tentukan kolom stok.
             */
            $kolom = $jenisStok === 'kosong'
                ? 'empty_stock'
                : 'stock_content';

            /*
             * Hitung saldo baru.
             */
            $saldoLama = (int) $locked->{$kolom};

            $saldoBaru = $saldoLama + $qty;

            /*
             * Update stok produk.
             */
            $locked->update([
                $kolom => $saldoBaru,
            ]);

            /*
             * Database menggunakan:
             * fill / empty
             */
            $stockType = $jenisStok === 'kosong'
                ? 'empty'
                : 'fill';

            /*
             * Catat pergerakan stok.
             *
             * Database menggunakan:
             * in / out / adjustment
             */
            return StockMovement::create([
                'product_id' => $locked->id,
                'stock_type' => $stockType,
                'movement_type' => 'in',
                'qty' => $qty,
                'ending_balance' => $saldoBaru,
                'reference_type' => $referensiTipe,
                'reference_id' => $referensiId,
                'description' => $keterangan,
                'created_by' => $user->id,
            ]);
        });
    }

    /**
     * Kurangi stok.
     *
     * Stok tidak boleh menjadi minus.
     */
    public function keluar(
        Product $product,
        string $jenisStok,
        int $qty,
        string $referensiTipe,
        ?int $referensiId,
        User $user,
        ?string $keterangan = null
    ): StockMovement {

        if ($qty <= 0) {
            throw new \InvalidArgumentException(
                'Jumlah stok harus lebih dari 0.'
            );
        }

        if (! in_array($jenisStok, ['isi', 'kosong'], true)) {
            throw new \InvalidArgumentException(
                'Jenis stok tidak valid.'
            );
        }

        return DB::transaction(function () use (
            $product,
            $jenisStok,
            $qty,
            $referensiTipe,
            $referensiId,
            $user,
            $keterangan
        ) {

            /*
             * Lock product.
             */
            $locked = Product::whereKey($product->id)
                ->lockForUpdate()
                ->firstOrFail();

            /*
             * Tentukan kolom stok.
             */
            $kolom = $jenisStok === 'kosong'
                ? 'empty_stock'
                : 'stock_content';

            $saldoLama = (int) $locked->{$kolom};

            /*
             * Jangan izinkan stok minus.
             */
            if ($saldoLama < $qty) {
                throw new \RuntimeException(
                    self::ERROR_STOK_TIDAK_CUKUP
                );
            }

            /*
             * Hitung saldo baru.
             */
            $saldoBaru = $saldoLama - $qty;

            /*
             * Update produk.
             */
            $locked->update([
                $kolom => $saldoBaru,
            ]);

            /*
             * Database menggunakan:
             * fill / empty
             */
            $stockType = $jenisStok === 'kosong'
                ? 'empty'
                : 'fill';

            /*
             * Catat stock movement.
             */
            return StockMovement::create([
                'product_id' => $locked->id,
                'stock_type' => $stockType,
                'movement_type' => 'out',
                'qty' => $qty,
                'ending_balance' => $saldoBaru,
                'reference_type' => $referensiTipe,
                'reference_id' => $referensiId,
                'description' => $keterangan,
                'created_by' => $user->id,
            ]);
        });
    }

    /**
     * Penyesuaian stok berdasarkan stok fisik.
     *
     * Contoh:
     *
     * Stok sistem = 20
     * Stok fisik  = 18
     *
     * Maka sistem menjadi 18.
     */
    public function penyesuaian(
        Product $product,
        string $jenisStok,
        int $saldoFisik,
        User $user,
        ?string $keterangan = null
    ): StockMovement {

        if ($saldoFisik < 0) {
            throw new \InvalidArgumentException(
                'Saldo fisik tidak boleh kurang dari 0.'
            );
        }

        if (! in_array($jenisStok, ['isi', 'kosong'], true)) {
            throw new \InvalidArgumentException(
                'Jenis stok tidak valid.'
            );
        }

        return DB::transaction(function () use (
            $product,
            $jenisStok,
            $saldoFisik,
            $user,
            $keterangan
        ) {

            /*
             * Lock product.
             */
            $locked = Product::whereKey($product->id)
                ->lockForUpdate()
                ->firstOrFail();

            /*
             * Tentukan kolom stok.
             */
            $kolom = $jenisStok === 'kosong'
                ? 'empty_stock'
                : 'stock_content';

            /*
             * Saldo lama.
             */
            $saldoSistem = (int) $locked->{$kolom};

            /*
             * Selisih.
             */
            $selisih = $saldoFisik - $saldoSistem;

            /*
             * Update saldo sesuai hasil opname.
             */
            $locked->update([
                $kolom => $saldoFisik,
            ]);

            /*
             * Database:
             * fill / empty
             */
            $stockType = $jenisStok === 'kosong'
                ? 'empty'
                : 'fill';

            return StockMovement::create([
                'product_id' => $locked->id,
                'stock_type' => $stockType,
                'movement_type' => 'adjustment',
                'qty' => abs($selisih),
                'ending_balance' => $saldoFisik,
                'reference_type' => 'adjustment',
                'reference_id' => null,
                'description' => $keterangan
                    ?? "Penyesuaian stok dari {$saldoSistem} menjadi {$saldoFisik}.",
                'created_by' => $user->id,
            ]);
        });
    }
}
