<?php

// Values come from the DTI forms (FM-PSM-03 LOI; FTEB Show Cause Order) and were approved for use on 2026-09-28.
// Signatory names are deployment settings, one per notice type: an LOI can be issued once the LOI name is set, an
// SCO once the SCO name is set. While a type's name is blank, that type reports the policy as unavailable.
$reasons = ['Prices above SRP', 'Prices above price ceiling'];
$legalBases = ['RA 7581 (Price Act)', 'RA 7394 (Consumer Act)', 'DAO No. 6, s. 2007', 'DO No. 18-122'];

return [
    'approved' => (bool) env('LEGAL_POLICY_APPROVED', true),
    'policy_version' => '2026-09-28',
    'timezone' => 'Asia/Manila',
    'working_weekdays' => [1, 2, 3, 4, 5],
    // Proclaimed national regular holidays and special non-working days only. Dates declared separately (the 2027
    // Eid'l Fitr and Eid'l Adha) are added once proclaimed. Extend before December 2027: a 3-working-day LOI needs
    // coverage through today + 9 days.
    'non_working_dates' => [
        '2026-01-01', '2026-02-17', '2026-03-20', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-09', '2026-05-01',
        '2026-05-27', '2026-06-12', '2026-08-21', '2026-08-31', '2026-11-01', '2026-11-02', '2026-11-30', '2026-12-08',
        '2026-12-24', '2026-12-25', '2026-12-30', '2026-12-31',
        '2027-01-01', '2027-02-06', '2027-03-25', '2027-03-26', '2027-03-27', '2027-04-09', '2027-05-01',
        '2027-06-12', '2027-08-21', '2027-08-30', '2027-11-01', '2027-11-02', '2027-11-30', '2027-12-08',
        '2027-12-24', '2027-12-25', '2027-12-30', '2027-12-31',
    ],
    'calendar_valid_from' => '2026-01-01',
    'calendar_valid_until' => '2027-12-31',
    'rules' => [
        'LOI' => [
            'template' => 'notices.official-loi', 'reasons' => $reasons, 'legal_bases' => $legalBases,
            'required_fields' => ['recipient_name', 'address', 'reason'],
            'signatory' => ['name' => env('LEGAL_LOI_SIGNATORY_NAME'), 'office' => 'Provincial Director, DTI Antique'],
            'response_period' => ['unit' => 'working_days', 'value' => 3],
            'deadline_anchor' => 'received', 'control_number_pattern' => '{type}-{year}-{id}',
        ],
        'SCO' => [
            'template' => 'notices.official-sco', 'reasons' => $reasons, 'legal_bases' => $legalBases,
            'required_fields' => ['recipient_name', 'address', 'reason', 'legal_bases'],
            'signatory' => ['name' => env('LEGAL_SCO_SIGNATORY_NAME'), 'office' => 'Director, Fair Trade Enforcement Bureau'],
            'response_period' => ['unit' => 'hours', 'value' => 48],
            'deadline_anchor' => 'received', 'control_number_pattern' => '{type}-{year}-{id}',
        ],
    ],
];
