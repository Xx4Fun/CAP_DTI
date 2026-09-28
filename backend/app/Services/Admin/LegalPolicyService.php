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
            $rule = $this->rule($type);
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
                    && filled($from) && filled($until) && Carbon::parse($from, config('legal_policy.timezone'))->startOfDay()->lte($today)
                    && Carbon::parse($until, config('legal_policy.timezone'))->endOfDay()->gte($today->copy()->addDays($period['value'] * 3));
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
        return $this->deadlineFrom($from, $this->deadlineRules($noticeType));
    }

    /** The response-period rules in force now, frozen onto a notice when it is issued. */
    public function deadlineRules(string $noticeType): array
    {
        $rules = $this->rulesFor($noticeType);
        return [
            'policy_version' => config('legal_policy.policy_version'), 'response_period' => $rules['response_period'],
            'deadline_anchor' => $rules['deadline_anchor'], 'timezone' => config('legal_policy.timezone'),
            'working_weekdays' => config('legal_policy.working_weekdays'), 'non_working_dates' => config('legal_policy.non_working_dates'),
            'calendar_valid_until' => config('legal_policy.calendar_valid_until'),
        ];
    }

    /**
     * Computes a deadline from the notice's frozen rules, independent of whether issuing is allowed today.
     * Holidays are facts, not policy: dates proclaimed after issue (and a calendar extended since) are added, never removed.
     * Throws CalendarNotCoveredException when a working-day period runs past every known calendar.
     */
    public function deadlineFrom(CarbonInterface $from, array $rules): CarbonInterface
    {
        $period = $rules['response_period'];
        $holidays = array_values(array_unique([...$rules['non_working_dates'], ...(config('legal_policy.non_working_dates') ?? [])]));
        $known = array_filter([$rules['calendar_valid_until'] ?? null, config('legal_policy.calendar_valid_until')]);
        $coveredUntil = $known ? max($known) : null;
        $deadline = Carbon::instance($from)->setTimezone($rules['timezone']);
        if ($period['unit'] === 'hours') {
            $deadline->addHours($period['value']);
        } else {
            $remaining = $period['value'];
            while ($remaining > 0) {
                $deadline->addDay();
                // Rules frozen before coverage was recorded carry no limit (only fixtures and legacy data).
                if (array_key_exists('calendar_valid_until', $rules) && (! $coveredUntil || $deadline->toDateString() > $coveredUntil)) {
                    throw new CalendarNotCoveredException('The holiday calendar does not cover this response period.');
                }
                if (in_array($deadline->dayOfWeekIso, $rules['working_weekdays'], true)
                    && ! in_array($deadline->toDateString(), $holidays, true)) $remaining--;
            }
        }
        // Back to the app timezone: Eloquent stores a datetime's wall-clock time without converting it.
        return $deadline->setTimezone(config('app.timezone'));
    }

    public function templateFor(string $noticeType): string
    {
        return $this->rulesFor($noticeType)['template'];
    }

    public function rulesFor(string $noticeType): array
    {
        $noticeType = strtoupper($noticeType);
        if ($this->availability($noticeType)['status'] !== 'LEGAL_POLICY_AVAILABLE') throw new LogicException('DTI-approved legal policy is unavailable.');
        return $this->rule($noticeType);
    }

    /** The configured rule for a type, with the signatory a Super Admin set in Settings taking precedence. */
    private function rule(string $type): array
    {
        $rule = config("legal_policy.rules.$type", []);
        $signatory = app(LegalSignatoryService::class)->forType($type);
        $rule['signatory'] = ['name' => $signatory['name'], 'office' => $signatory['office']];
        return $rule;
    }

    public function controlNumber(int $id, string $noticeType, int $year): string
    {
        return strtr($this->rulesFor($noticeType)['control_number_pattern'], [
            '{id}' => str_pad((string) $id, 6, '0', STR_PAD_LEFT), '{type}' => strtoupper($noticeType), '{year}' => (string) $year,
        ]);
    }
}
