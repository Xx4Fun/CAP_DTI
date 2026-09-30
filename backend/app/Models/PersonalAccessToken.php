<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    /**
     * Sanctum stamps last_used_at on every authenticated request, a database write even for reads.
     * The idle timeout (AppServiceProvider) only needs minute precision, so a touch that changes
     * nothing but last_used_at within a minute of the stored value is skipped.
     */
    public function save(array $options = []): bool
    {
        $previous = $this->getOriginal('last_used_at');

        if ($this->exists && array_keys($this->getDirty()) === ['last_used_at'] && $previous && $previous->gt(now()->subMinute())) {
            return true;
        }

        return parent::save($options);
    }
}
