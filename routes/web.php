<?php

use Illuminate\Support\Facades\Route;

// Seluruh halaman web frontend (Landing page, Login, Register, Dashboard)
// dilayani sebagai Single Page Application (SPA) oleh React via view 'app'
Route::get('/', function () {
    return view('app');
});

// Fallback agar ketika user mengakses /login atau me-refresh rute frontend lainnya,
// aplikasi tetap mengarahkan ke React SPA
Route::get('/login', function () {
    return redirect('/');
})->name('login');

