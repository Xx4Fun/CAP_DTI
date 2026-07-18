<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Show Cause Order</title>
    <style>
        body { font-family: 'Helvetica', sans-serif; color: #333; line-height: 1.5; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #dc2626; padding-bottom: 10px; margin-bottom: 30px; }
        .logo-text { font-size: 24px; font-weight: bold; color: #dc2626; }
        .office-title { font-size: 14px; color: #555; }
        .title { text-align: center; font-size: 22px; font-weight: bold; color: #dc2626; text-decoration: underline; margin-bottom: 20px; }
        .date { text-align: right; margin-bottom: 20px; }
        .recipient { margin-bottom: 20px; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table th, .details-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        .details-table th { background-color: #fee2e2; color: #991b1b; }
        .danger-box { border: 2px solid #dc2626; background-color: #fef2f2; color: #991b1b; padding: 15px; border-radius: 4px; margin-top: 30px; }
        .footer { margin-top: 50px; text-align: right; }
        .signature-line { border-top: 1px solid #333; width: 200px; float: right; margin-top: 40px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <span class="logo-text">PRICE-Watch (EMERGENCY RESPONSE)</span><br>
        <span class="office-title">Department of Trade and Industry - Antique Provincial Office</span><br>
        <span class="office-title">San Jose de Buenavista, Antique</span>
    </div>

    <div class="date">
        Date: {{ now()->format('F d, Y') }}
    </div>

    <div class="recipient">
        <strong>TO:</strong> {{ $store->owner_name }}<br>
        <strong>Store Name:</strong> {{ $store->store_name }}<br>
        <strong>Address:</strong> {{ $store->address }}<br>
        <strong>SEC Registration:</strong> {{ $store->dti_sec_number }}<br>
        <strong>Recidivism Index:</strong> {{ $store->recidivism_index }} offense(s)
    </div>

    <div class="title">SHOW CAUSE ORDER</div>

    <p><strong>NOTICE OF PRICE REGULATORY VIOLATION:</strong></p>

    <p>This is an official directive issued due to emergency protocols. Pursuant to Section 6 of the Philippine Price Act (R.A. 7581) and under the active **State of Calamity / Repeat Offense** regulatory guidelines, the standard 10% deviation allowance is strictly suspended. All commodities must strictly match the SRP baseline pricing.</p>
    
    <p>Our field inspection on <strong>{{ $recorded_date }}</strong> has logged the following pricing violation:</p>

    <table class="details-table">
        <thead>
            <tr>
                <th>Commodity Name</th>
                <th>Official SRP Baseline</th>
                <th>Observed Shelf Price</th>
                <th>Price Deviation</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>{{ $commodity->commodity_name }}</td>
                <td>₱{{ number_format($commodity->baseline_price, 2) }}</td>
                <td>₱{{ number_format($recorded_price, 2) }}</td>
                <td style="color: red; font-weight: bold;">+₱{{ number_format($recorded_price - $commodity->baseline_price, 2) }} ({{ number_format((($recorded_price - $commodity->baseline_price) / $commodity->baseline_price) * 100, 1) }}%)</td>
            </tr>
        </tbody>
    </table>

    <div class="danger-box">
        <strong>IMMEDIATE DISCIPLINARY DIRECTIVE:</strong> You are hereby ordered to **SHOW CAUSE** within **forty-eight (48) hours** from receipt of this notice why your establishment should not be penalised for profiteering and price manipulation. This case has been escalated to the **Field Dispatch Unit**.
    </div>

    <div class="footer">
        Very truly yours,<br><br>
        <strong>DTI Antique Regulatory Board</strong>
        <div style="clear: both;"></div>
        <div class="signature-line">
            DTI Evaluating Director
        </div>
    </div>
</body>
</html>
