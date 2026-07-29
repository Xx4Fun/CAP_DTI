<?php

return [
    'idle_timeout_minutes' => (int) env('ADMIN_IDLE_TIMEOUT_MINUTES', 15),
    'absolute_timeout_hours' => (int) env('ADMIN_ABSOLUTE_TIMEOUT_HOURS', 8),
    'reauthentication_minutes' => (int) env('ADMIN_REAUTHENTICATION_MINUTES', 5),
];
