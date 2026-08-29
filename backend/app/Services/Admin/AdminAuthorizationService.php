<?php

namespace App\Services\Admin;

use App\Models\User;

class AdminAuthorizationService
{
    public function canManage(User $user): bool
    {
        return in_array($user->role, ['dti_evaluator', 'super_admin'], true);
    }

    public function canViewAnalytics(User $user): bool
    {
        return in_array($user->role, ['dti_evaluator', 'super_admin'], true);
    }

    public function requireManager(User $user): void
    {
        abort_unless($this->canManage($user), 403, 'Forbidden');
    }
}
