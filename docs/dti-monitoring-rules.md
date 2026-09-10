# DTI San Jose Monitoring and Price Freeze Rules

These rules apply to the PRICE-Watch monitoring workflow for San Jose de Buenavista.

## Normal Monitoring

- San Jose de Buenavista follows a regular weekly monitoring cycle.
- Field Monitoring Officers record the actual monitored selling prices of covered products from establishments.
- Normal monitoring uses the applicable regular price reference, such as the active SRP.
- Every finalized monitoring record must preserve the exact reference used during that visit, including its value, type, and effective date.
- Historical monitoring records must never be recalculated using a newer SRP or reference.

## Weekly Monitoring History

The system should retain establishment-level monitored prices across weekly monitoring cycles.

This historical data supports:
- temporal price history;
- previous monitored-price comparison;
- minimum and maximum monitored prices;
- other statistical summaries needed by DTI;
- preparation of the Price Freeze/APC reference when applicable.

## When a State of Calamity Is Declared

When a State of Calamity is declared, PRICE-Watch should use the **most recent completed weekly monitoring cycle that happened before the declaration date**.

The system must NOT use prices collected after the declaration when preparing the initial Price Freeze/APC reference.

For each monitored product, the system should gather the prices recorded for that same product from all relevant establishments included in that latest completed weekly monitoring cycle.

Example:

Latest completed monitoring week before the declaration:

Product: Brand X Sardines 155g

- Establishment A: ₱25.00
- Establishment B: ₱26.00
- Establishment C: ₱25.50
- Establishment D: ₱27.00
- Establishment E: ₱26.50

From those recorded prices, the system may calculate supporting statistics such as:

- Minimum monitored price: ₱25.00
- Maximum monitored price: ₱27.00
- Average monitored price: ₱26.00
- Number of establishments included: 5

These calculations should be performed separately for each product. PRICE-Watch computes the APC candidate using DTI's official method: the midpoint of the minimum and maximum monitored prices, rounded to centavos. The observed arithmetic mean and record counts remain supporting statistics.

The computed midpoint is not official merely because it was calculated. The DTI Admin must review the pre-declaration source records and confirm the prepared APC dataset. Only that confirmation creates the official APC/Price Freeze Reference and activates it for the Price Freeze period.

Once confirmed, that APC/Price Freeze Reference becomes the active comparison basis for the applicable product while the Price Freeze is in effect.

## Price Freeze Monitoring

Once the Price Freeze/APC is activated:

- The applicable official APC/Price Freeze Reference becomes the comparison basis for covered products.
- It remains separate from the normal SRP and must not overwrite the SRP.
- A price above the applicable APC should be flagged for DTI attention without requiring the normal 10% increase threshold.
- Field Monitoring should use the Price Freeze reference that was active during the actual monitoring visit.
- Price Freeze monitoring may use a different monitoring frequency, such as daily monitoring, according to the DTI process.
- Every monitoring record must preserve the exact APC/reference used at that time.

## Ending Price Freeze

When the Price Freeze ends:

- deactivate the APC/Price Freeze protocol;
- retain all APC records and monitoring history;
- return covered products to their applicable normal monitoring reference;
- return San Jose to its regular monitoring cycle.

Never overwrite or convert the APC into a new SRP.

## Important Principle

PRICE-Watch may calculate and present monitoring statistics to assist DTI, but the system must not independently declare an official APC, violation, LOI, SCO, or other regulatory action.

Final regulatory decisions remain with authorized DTI personnel.
