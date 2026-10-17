<?php

namespace App\Http\Controllers\Vendor;

use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

trait ResolvesVendor
{
    /**
     * Vendor portal access requires an active vendor holding a vendor PWA token. The name check matters:
     * Sanctum's can() also passes legacy '*' tokens issued by /api/login.
     */
    protected function vendorUser(Request $request): User
    {
        $user = $request->user();
        if (! $user || $user->role !== 'vendor' || ! $user->is_active || $user->currentAccessToken()?->name !== VendorAuthController::TOKEN_NAME) {
            $this->vendorError(403, 'VENDOR_ACCESS_REVOKED', 'This session no longer has Vendor Portal access. Sign in again.');
        }

        return $user;
    }

    /**
     * Registration status and resubmission routes accept a vendor registration token (while pending or rejected)
     * or an active vendor portal token.
     */
    protected function vendorRegistrationUser(Request $request): User
    {
        $user = $request->user();
        $tokenName = $user?->currentAccessToken()?->name;
        if (! $user || $user->role !== 'vendor' || ! in_array($tokenName, [VendorAuthController::REGISTRATION_TOKEN_NAME, VendorAuthController::TOKEN_NAME], true)) {
            $this->vendorError(403, 'VENDOR_ACCESS_REVOKED', 'This session no longer has Vendor Portal access. Sign in again.');
        }

        return $user;
    }

    protected function vendorError(int $httpStatus, string $status, string $message): never
    {
        throw new HttpResponseException(response()->json(['status' => $status, 'message' => $message], $httpStatus));
    }
}
