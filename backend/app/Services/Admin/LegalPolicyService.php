<?php

namespace App\Services\Admin;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use LogicException;

class LegalPolicyService
{
    public function availability(?string $noticeType = null): array
    {
        $types = $noticeType ? [strtoupper($noticeType)] : ['LOI', 'SCO'];
        $complete = config('legal_policy.approved') === true
            && filled(config('legal_policy.policy_version'))
            && filled(config('legal_policy.timezone'));
        foreach ($types as $type) {
            $rule = config("legal_policy.rules.$type", []);
            $period = $rule['response_period'] ?? [];
            $complete = $complete
                && in_array($rule['template'] ?? null, ['notices.official-loi', 'notices.official-sco'], true)
                && ! empty($rule['reasons']) && ! empty($rule['legal_bases']) && ! empty($rule['required_fields'])
                && filled($rule['signatory']['name'] ?? null) && filled($rule['signatory']['office'] ?? null)
                && in_array($period['unit'] ?? null, ['hours', 'working_days'], true)
                && is_int($period['value'] ?? null) && $period['value'] > 0
                && in_array($rule['deadline_anchor'] ?? null, ['received', 'refused'], true)
                && str_contains((string) ($rule['control_number_pattern'] ?? ''), '{id}')
                && str_contains((string) ($rule['control_number_pattern'] ?? ''), '{type}')
                && str_contains((string) ($rule['control_number_pattern'] ?? ''), '{year}');
            if (($period['unit'] ?? null) === 'working_days') {
                $from = config('legal_policy.calendar_valid_from'); $until = config('legal_policy.calendar_valid_until');
                $today = now(config('legal_policy.timezone'))->startOfDay();
                $complete = $complete && ! empty(config('legal_policy.working_weekdays')) && is_array(config('legal_policy.non_working_dates'))
                    && filled($from) && filled($until) && Carbon::parse($from)->startOfDay()->lte($today)
                    && Carbon::parse($until)->endOfDay()->gte($today->copy()->addDays($period['value'] * 3));
            }
        }

        return $complete
            ? ['status' => 'LEGAL_POLICY_AVAILABLE', 'policy_version' => config('legal_policy.policy_version')]
            : ['status' => 'LEGAL_POLICY_UNAVAILABLE', 'policy_version' => null];
    }

    public function noticeType(bool $stateOfCalamity, int $confirmedViolations): string
    {
        throw new LogicException('Automatic legal notice selection is disabled.');
    }

    public function responseDeadline(CarbonInterface $from, string $noticeType): CarbonInterface
    {
        $period = $this->rulesFor($noticeType)['response_period'];
        $deadline = Carbon::instance($from)->setTimezone(config('legal_policy.timezone'));
        if ($period['unit'] === 'hours') return $deadline->addHours($period['value']);
        $remaining = $period['value'];
        while ($remaining > 0) {
            $deadline->addDay();
            if (in_array($deadline->dayOfWeekIso, config('legal_policy.working_weekdays'), true)
                && ! in_array($deadline->toDateString(), config('legal_policy.non_working_dates'), true)) $remaining--;
        }
        return $deadline;
    }

    public function templateFor(string $noticeType): string
    {
        return $this->rulesFor($noticeType)['template'];
    }

    public function rulesFor(string $noticeType): array
    {
        $noticeType = strtoupper($noticeType);
        if ($this->availability($noticeType)['status'] !== 'LEGAL_POLICY_AVAILABLE') throw new LogicException('DTI-approved legal policy is unavailable.');
        return config("legal_policy.rules.$noticeType");
    }

    public function controlNumber(int $id, string $noticeType, int $year): string
    {
        return strtr($this->rulesFor($noticeType)['control_number_pattern'], [
            '{id}' => str_pad((string) $id, 6, '0', STR_PAD_LEFT), '{type}' => strtoupper($noticeType), '{year}' => (string) $year,
        ]);
    }
}
