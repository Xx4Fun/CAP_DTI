<?php

namespace App\Services\Admin;

use RuntimeException;

/** A working-day response period would run past the last date the holiday calendar covers. */
class CalendarNotCoveredException extends RuntimeException
{
}
