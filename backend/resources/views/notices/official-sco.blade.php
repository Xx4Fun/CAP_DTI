@php
  $payload = $notice->draft_payload ?? [];
  $monitored = data_get($notice->source_snapshot, 'monitoring_date');
  $monitored = $monitored ? \Illuminate\Support\Carbon::parse($monitored)->timezone('Asia/Manila')->format('F j, Y') : 'date not recorded';
  $bases = implode('; ', $payload['legal_bases'] ?? []);
  $issued = $notice->issued_at?->timezone('Asia/Manila');
  $fit = fn (?string $text, float $width, int $lines = 1, float $max = 10.5, float $min = 6.5) => max($min, min($max, $width * $lines / max(1, mb_strlen((string) $text) * 0.5)));
  // The TO line holds name and title together only when both fit comfortably.
  $to = trim(($payload['recipient_name'] ?? '').(filled($payload['recipient_title'] ?? null) ? ', '.$payload['recipient_title'] : ''));
  if (mb_strlen($to) > 45) $to = $payload['recipient_name'] ?? '';
  $store = data_get($notice->source_snapshot, 'store.store_name');
  $address = $payload['address'] ?? '';
  $email = $payload['recipient_email'] ?? '';
  $addressSize = $fit($address, 246, 2);
@endphp
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PRICE-WATCH - Show Cause Order</title>
</head>
<body>
@if($draft ?? false)<div class="legal-draft-watermark">DRAFT — NOT AN OFFICIAL NOTICE</div>@endif
@component('notices._form-page', ['background' => 'sco-background.png'])
  {{-- FT-ED IDTS No.: the "EX" placeholder carries the control number --}}
  <div class="w" style="left:153pt;top:128pt;width:120pt;height:13pt"></div>
  <div class="t" style="left:153.7pt;top:131pt;font-size:8.5pt;font-style:italic">{{ $notice->control_number ?: 'DRAFT' }}</div>

  {{-- Addressee block; the printed underlines stay --}}
  <div class="w" style="left:276pt;top:164.5pt;width:252pt;height:13pt"></div>
  <div class="t b" style="left:279pt;top:{{ 167.2 + (10.5 - $fit($to, 246)) * 0.8 }}pt;font-size:{{ $fit($to, 246) }}pt">{{ $to }}</div>
  <div class="t" style="left:279pt;top:{{ 180.2 + (10.5 - $fit($store, 246)) * 0.8 }}pt;font-size:{{ $fit($store, 246) }}pt">{{ $store }}</div>
  <div class="p" style="left:279pt;top:192.2pt;width:248pt;font-size:{{ $addressSize }}pt;line-height:12.7pt;text-align:left">{{ $address }}</div>
  <div class="t" style="left:279pt;top:{{ 230.7 + (10.5 - $fit($email, 246)) * 0.8 }}pt;font-size:{{ $fit($email, 246) }}pt">{{ $email }}</div>

  {{-- Item 1, re-set so the inspection fits where the complaint form names a complainant --}}
  <div class="w" style="left:116pt;top:287pt;width:420pt;height:42pt"></div>
  <div class="p" style="left:118.4pt;top:289pt;width:414pt;font-size:10.5pt;line-height:12.2pt">Upon evaluation of the report/complaint lodged by <span class="b">DTI Price Monitoring — inspection of {{ $monitored }}</span> attached as <span class="b">“Annex A”</span>, we note the deceptive, unfair, and unconscionable sales acts and practices being committed.</div>

  {{-- Item 2, with the selected legal bases in place of "Article(s) of the RA XXXX." --}}
  <div class="w" style="left:116pt;top:337pt;width:420pt;height:30pt"></div>
  <div class="p" style="left:118.4pt;top:338.5pt;width:414pt;font-size:10pt;line-height:11.2pt">Please be informed that the said act constitutes a violation under the following legal basis/bases: <span class="b u">{{ $bases }}.</span></div>

  {{-- Issued this ___ --}}
  <div class="w" style="left:169pt;top:503pt;width:125pt;height:21pt"></div>
  <div class="t" style="left:171.4pt;top:508.5pt;font-size:10.5pt"><span class="b u">{{ $issued ? $issued->format('jS').' day of '.$issued->format('F Y') : '' }}</span>.</div>

  {{-- Signatory --}}
  <div class="w" style="left:318pt;top:557pt;width:224pt;height:23pt"></div>
  {{-- E-signature, only when the issuer applied it: centred on the signature line --}}
  @if(!empty($signatureImage))<div style="position:absolute;left:318pt;top:521pt;width:224pt;height:34pt;text-align:center"><img src="{{ $signatureImage }}" alt="" style="max-height:34pt;max-width:180pt"></div>@endif
  <div class="t b" style="left:318pt;top:557.5pt;width:224pt;font-size:10.5pt;text-align:center">{{ data_get($policy ?? [], 'signatory.name') }}</div>
  <div class="t" style="left:318pt;top:569.5pt;width:224pt;font-size:10.5pt;text-align:center">{{ data_get($policy ?? [], 'signatory.office') }}</div>
@endcomponent
@include('notices._schedule', ['annexLabel' => 'Annex A — Monitoring Schedule'])
</body>
</html>
