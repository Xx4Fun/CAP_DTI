<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class AuditEvent extends Model
{
    protected $fillable = ['actor_id', 'action', 'subject_type', 'subject_id', 'metadata', 'ip_address', 'user_agent'];
    protected $casts = ['metadata' => 'array'];

    public function save(array $options = []): bool
    {
        if ($this->exists && $this->isDirty()) throw new LogicException('Audit events are append-only.');
        return parent::save($options);
    }

    public function delete(): ?bool
    {
        throw new LogicException('Audit events cannot be deleted.');
    }
}
