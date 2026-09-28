@php
  $payload = $notice->draft_payload ?? [];
  $monitored = data_get($notice->source_snapshot, 'monitoring_date');
  $monitored = $monitored ? \Illuminate\Support\Carbon::parse($monitored)->timezone('Asia/Manila')->format('M j, Y') : '';
  $ceiling = ($payload['reason'] ?? null) === 'Prices above price ceiling';
  $fit = fn (?string $text, float $width, int $lines = 1, float $max = 10.5, float $min = 6.5) => max($min, min($max, $width * $lines / max(1, mb_strlen((string) $text) * 0.5)));
  $to = trim(($payload['recipient_name'] ?? '').(filled($payload['recipient_title'] ?? null) ? ', '.$payload['recipient_title'] : ''));
  $store = data_get($notice->source_snapshot, 'store.store_name');
  $address = $payload['address'] ?? '';
  $addressSize = $fit($address, 318, 2);
@endphp
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PRICE-WATCH — Letter of Inquiry (FM-PSM-03)</title>
</head>
<body>
@if($draft ?? false)<div class="legal-draft-watermark">DRAFT — NOT AN OFFICIAL NOTICE</div>@endif
@component('notices._form-page', ['background' => 'loi-background.png'])
  {{-- Control No. / Date --}}
  <div class="w" style="left:124pt;top:96pt;width:120pt;height:13pt"></div>
  <div class="t" style="left:125pt;top:100.8pt;font-size:10.5pt">{{ $notice->control_number ?: 'DRAFT' }}</div>
  <div class="w" style="left:93pt;top:111pt;width:120pt;height:16pt"></div>
  <div class="t" style="left:95pt;top:114.5pt;font-size:10.5pt">{{ $notice->issued_at?->timezone('Asia/Manila')->format('F j, Y') }}</div>

  {{-- Recipient block --}}
  <div class="w" style="left:62pt;top:139pt;width:330pt;height:46pt"></div>
  <div class="t b" style="left:63.9pt;top:{{ 144.5 + (10.5 - $fit($to, 318)) * 0.8 }}pt;font-size:{{ $fit($to, 318) }}pt">{{ $to }}</div>
  <div class="t" style="left:63.9pt;top:{{ 157.5 + (10.5 - $fit($store, 318)) * 0.8 }}pt;font-size:{{ $fit($store, 318) }}pt">{{ $store }}</div>
  <div class="p" style="left:63.9pt;top:170pt;width:320pt;font-size:{{ $addressSize }}pt;line-height:{{ min(12, $addressSize * 1.15) }}pt;text-align:left">{{ $address }}</div>

  {{-- Monitoring date ("... - Antique on ____,") --}}
  <div class="w" style="left:429.5pt;top:238pt;width:95pt;height:15.5pt"></div>
  <div class="t" style="left:432pt;top:241.5pt;font-size:10.5pt">{{ $monitored }},</div>

  @if($ceiling)
    <div class="w" style="left:150pt;top:323pt;width:300pt;height:18pt"></div>
    <div class="t" style="left:65pt;top:325pt;width:455pt;font-size:10.5pt;text-align:center">Prices are above the price ceiling (Please see attached file)</div>
  @endif

  {{-- Signatory --}}
  <div class="w" style="left:62pt;top:543pt;width:260pt;height:31pt"></div>
  {{-- E-signature, only when the issuer applied it: between the closing line and the printed name --}}
  @if(!empty($signatureImage))<img src="{{ $signatureImage }}" alt="" style="position:absolute;left:63.2pt;top:510pt;max-height:34pt;max-width:170pt">@endif
  <div class="t b" style="left:63.2pt;top:546pt;font-size:12pt">{{ data_get($policy ?? [], 'signatory.name') }}</div>
  <div class="t" style="left:63.2pt;top:561pt;font-size:11pt">{{ data_get($policy ?? [], 'signatory.office') }}</div>
@endcomponent
@include('notices._schedule', ['annexLabel' => 'Attachment — Monitoring Schedule'])
</body>
</html>
