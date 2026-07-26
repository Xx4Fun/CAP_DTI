<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class VendorInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $invitationUrl, public readonly string $storeName) {}

    public function build(): self
    {
        return $this->subject('PRICE-Watch Vendor Portal invitation')
            ->view('mail.vendor-invitation');
    }
}
