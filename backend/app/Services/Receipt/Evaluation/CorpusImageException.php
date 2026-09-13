<?php

namespace App\Services\Receipt\Evaluation;

use RuntimeException;

/**
 * A corpus section image that cannot be decoded locally. Distinct from any other RuntimeException so the harness never
 * reports a programming error, or a stray-request guard, as an unreadable image.
 */
class CorpusImageException extends RuntimeException {}
