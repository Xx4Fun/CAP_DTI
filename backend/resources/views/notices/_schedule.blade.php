@if($draft ?? false)<div class="legal-draft-watermark">DRAFT — NOT AN OFFICIAL NOTICE</div>@endif
<section class="legal-schedule">
  <h1>{{ $annexLabel ?? 'Monitoring Schedule' }}</h1>
  <p>Monitoring record: {{ data_get($notice->source_snapshot, 'monitoring_record_number') ?: 'Not recorded' }}</p>
  <table><thead><tr><th>Product</th><th>Observed price</th><th>Compared against</th><th>Basis</th></tr></thead><tbody>
  @foreach(data_get($notice->source_snapshot, 'items', []) as $item)
    @php($spike = ($item['finding_basis'] ?? null) === 'previous_price_spike')
    <tr><td>{{ $item['commodity_name'] ?: 'Not recorded' }} {{ $item['unit'] ? '('.$item['unit'].')' : '' }}</td><td>₱{{ number_format($item['observed_price'], 2) }}</td>
    @if($spike)
      <td>₱{{ $item['previous_price'] === null ? '—' : number_format($item['previous_price'], 2) }}</td><td>This store's previous verified price, recorded in an earlier DTI monitoring visit</td>
    @else
      <td>₱{{ number_format($item['reference_value'], 2) }}</td><td>{{ $item['reference_label'] ?: 'Not recorded' }} · {{ $item['reference_source'] ?: 'Source not recorded' }} · {{ $item['reference_effective_date'] ?: 'Date not recorded' }}</td>
    @endif
    </tr>
  @endforeach
  </tbody></table>
  <p><strong>Evaluator review required; this is not an automatic legal finding.</strong></p>
</section>
<style>
.legal-draft-watermark{position:fixed;z-index:20;left:12%;top:42%;transform:rotate(-28deg);font:700 34pt Arial;color:rgba(180,0,0,.18);border:4px solid rgba(180,0,0,.18);padding:12px;pointer-events:none}
.legal-schedule{page-break-before:always;padding:18mm;background:#fff;color:#111;font-family:'DejaVu Sans',Arial,sans-serif;font-size:9.5pt}.legal-schedule h1{font-size:18pt}.legal-schedule table{width:100%;border-collapse:collapse}.legal-schedule th,.legal-schedule td{border:1px solid #555;padding:7px;text-align:left;vertical-align:top}
</style>
