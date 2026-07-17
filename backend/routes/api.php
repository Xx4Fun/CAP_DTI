<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/sync/down', [SyncController::class, 'down']);
    Route::post('/sync/up', [SyncController::class, 'up']);
});

