<?php

namespace App\Services\Admin;

use Carbon\CarbonInterface;
use LogicException;

class LegalPolicyService
{
    public function availability(): array
    {
        $rules = config('legal_policy.rules', []);
        $complete = config('legal_policy.approved') === true
            && filled(config('legal_policy.policy_version'))
            && is_numeric($rules['response_hours'] ?? null)
            && is_bool($rules['sco_when_state_of_calamity'] ?? null)
            && is_numeric($rules['sco_min_confirmed_violations'] ?? null)
            && in_array($rules['normal_notice_type'] ?? null, ['LOI', 'SCO'], true)
            && in_array($rules['escalated_notice_type'] ?? null, ['LOI', 'SCO'], true)
            && in_array($rules['loi_template'] ?? null, ['notices.loi'], true)
            && in_array($rules['sco_template'] ?? null, ['notices.sco'], true);

        return $complete
            ? ['status' => 'LEGAL_POLICY_AVAILABLE', 'policy_version' => config('legal_policy.policy_version')]
            : ['status' => 'LEGAL_POLICY_UNAVAILABLE', 'policy_version' => null];
    }

    public function noticeType(bool $stateOfCalamity, int $confirmedViolations): string
    {
        $this->requireAvailable();
        $rules = config('legal_policy.rules');
        $escalated = ($stateOfCalamity && $rules['sco_when_state_of_calamity'])
            || $confirmedViolations >= (int) $rules['sco_min_confirmed_violations'];

        return $escalated ? $rules['escalated_notice_type'] : $rules['normal_notice_type'];
    }

    public function responseDeadline(CarbonInterface $from): CarbonInterface
    {
        $this->requireAvailable();
        return $from->copy()->addHours((int) config('legal_policy.rules.response_hours'));
    }

    public function templateFor(string $noticeType): string
    {
        $this->requireAvailable();
        return $noticeType === 'SCO'
            ? config('legal_policy.rules.sco_template')
            : config('legal_policy.rules.loi_template');
    }

    private function requireAvailable(): void
    {
        if ($this->availability()['status'] !== 'LEGAL_POLICY_AVAILABLE') {
            throw new LogicException('DTI-approved legal policy is unavailable.');
        }
    }
}
