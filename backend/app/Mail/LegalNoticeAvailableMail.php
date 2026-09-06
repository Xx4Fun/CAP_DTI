<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class LegalNoticeAvailableMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly int $noticeId, public readonly string $noticeType, public readonly string $storeName) {}

    public function build(): self
    {
        return $this->subject('PRICE-Watch: official notice available in Vendor Portal')->view('mail.legal-notice-available');
    }
}
