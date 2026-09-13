<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptLineFilter;
use PHPUnit\Framework\TestCase;

class ReceiptLineFilterTest extends TestCase
{
    public function test_drops_background_noise_but_keeps_text_and_short_money_lines(): void
    {
        $filter = new ReceiptLineFilter;
        $lines = ['Wy', 'yy', '| ae =', '— & g', 'COBRA BERRY BLAST', '49.75', '004663895 1 27.00', '= | :'];

        $this->assertSame(['COBRA BERRY BLAST', '49.75', '004663895 1 27.00'], $filter->filter($lines));
        $this->assertSame(3 / 8, $filter->readableRatio($lines));
        $this->assertSame(0.0, $filter->readableRatio([]));
    }
}
