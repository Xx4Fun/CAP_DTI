<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Letter of Inquiry</title>
    <style>
        body { font-family: 'Helvetica', sans-serif; color: #333; line-height: 1.5; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 30px; }
        .logo-text { font-size: 24px; font-weight: bold; color: #d97706; }
        .office-title { font-size: 14px; color: #555; }
        .title { text-align: center; font-size: 20px; font-weight: bold; text-decoration: underline; margin-bottom: 20px; }
        .date { text-align: right; margin-bottom: 20px; }
        .recipient { margin-bottom: 20px; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table th, .details-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        .details-table th { background-color: #f5f5f5; }
        .warning-box { border: 1px solid #f59e0b; background-color: #fffbeb; color: #b45309; padding: 15px; border-radius: 4px; margin-top: 30px; }
        .footer { margin-top: 50px; text-align: right; }
        .signature-line { border-top: 1px solid #333; width: 200px; float: right; margin-top: 40px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <span class="logo-text">PRICE-Watch</span><br>
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
        <strong>SEC Registration:</strong> {{ $store->dti_sec_number }}
    </div>

    <div class="title">LETTER OF INQUIRY</div>

    <p>Dear Sir/Madam,</p>

    <p>This is in reference to the regular price monitoring conducted on your business establishment. Our records indicate that on <strong>{{ $recorded_date }}</strong>, the following commodity was observed with shelf pricing that deviates from the officially set Suggested Retail Price (SRP) bulletin:</p>

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

    <p>Pursuant to Section 5 of the Philippine Price Act (R.A. 7581), you are hereby requested to submit a written explanation detailing the reasons for this price difference.</p>

    <div class="warning-box">
        <strong>IMPORTANT NOTICE:</strong> You are given a period of exactly <strong>forty-eight (48) hours</strong> from receipt of this notice to file your rebuttal explanation and submit supporting receipts or vendor invoices via the online Vendor Portal. Fail to submit within the 48-hour period will result in immediate escalation.
    </div>

    <div class="footer">
        Very truly yours,<br><br>
        <strong>DTI Antique Regulatory Board</strong>
        <div style="clear: both;"></div>
        <div class="signature-line">
            DTI Evaluating Officer
        </div>
    </div>
</body>
</html>
