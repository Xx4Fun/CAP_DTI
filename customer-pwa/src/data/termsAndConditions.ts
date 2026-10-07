export const TERMS_VERSION = '1.0';

export interface ConsumerRightItem {
  id: number;
  title: string;
  tagalogTitle: string;
  description: string;
  dtiProtection: string;
}

export interface ConsumerResponsibilityItem {
  id: number;
  title: string;
  description: string;
}

export interface RegulationItem {
  id: string;
  heading: string;
  lawReference: string;
  description: string;
}

export interface LegalSection {
  heading: string;
  body: string;
}

export const CONSUMER_RIGHTS: ReadonlyArray<ConsumerRightItem> = [
  {
    id: 1,
    title: 'Right to Basic Needs',
    tagalogTitle: 'Karapatan sa Pangunahing Pangangailangan',
    description: 'Guarantees the availability of essential goods and basic commodities at fair prices and quality standards.',
    dtiProtection: 'DTI sets Suggested Retail Prices (SRP) for canned fish, milk, coffee, bread, and instant noodles to prevent unreasonable price spikes.',
  },
  {
    id: 2,
    title: 'Right to Safety',
    tagalogTitle: 'Karapatan sa Kaligtasan',
    description: 'Protection against the marketing and sale of products and services that are hazardous to consumer health and life.',
    dtiProtection: 'Enforcement of Philippine National Standards (PNS), product certification marks (PS and ICC), and expiration date compliance.',
  },
  {
    id: 3,
    title: 'Right to Information',
    tagalogTitle: 'Karapatan sa Impormasyon',
    description: 'Protection against misleading, dishonest, or fraudulent advertising, labeling, and pricing practices.',
    dtiProtection: 'Enforcement of Republic Act No. 71 (Price Tag Law). All retail goods must bear clear price tags, and cashiers must charge that exact amount.',
  },
  {
    id: 4,
    title: 'Right to Choose',
    tagalogTitle: 'Karapatan sa Pagpili',
    description: 'The right to select products and services at competitive prices with an assurance of satisfactory quality.',
    dtiProtection: 'Prohibits anti-competitive practices, tied sales, and monopolies that restrict fair access to essential commodities.',
  },
  {
    id: 5,
    title: 'Right to Representation',
    tagalogTitle: 'Karapatan sa Paglahok',
    description: 'The right to voice consumer interests in the creation and execution of government economic and trade policies.',
    dtiProtection: 'Consumer participation in DTI public hearings, consultations, and the National Price Coordinating Council (NPCC).',
  },
  {
    id: 6,
    title: 'Right to Redress',
    tagalogTitle: 'Karapatan sa Pagwawasto',
    description: 'The right to be compensated for misrepresentation, substandard goods, or unsatisfactory services through refunds, replacement, or repair.',
    dtiProtection: 'DTI consumer complaint mediation, adjudication, and issuance of formal Show Cause Orders to non-compliant retailers.',
  },
  {
    id: 7,
    title: 'Right to Consumer Education',
    tagalogTitle: 'Karapatan sa Edukasyon',
    description: 'The right to acquire knowledge and skills required to make informed and confident consumer decisions throughout life.',
    dtiProtection: 'Public price monitoring advisories, consumer education campaigns, and digital price matrices via PRICE-Watch.',
  },
  {
    id: 8,
    title: 'Right to a Healthy Environment',
    tagalogTitle: 'Karapatan sa Malinis na Kapaligiran',
    description: 'The right to live and work in an environment that is neither threatening nor dangerous and promotes health and well-being.',
    dtiProtection: 'Support for sustainable packaging, proper waste handling, and phasing out toxic substances in retail distribution.',
  },
];

export const CONSUMER_RESPONSIBILITIES: ReadonlyArray<ConsumerResponsibilityItem> = [
  {
    id: 1,
    title: 'Critical Awareness',
    description: 'The responsibility to be more alert and questioning about the price, quality, and condition of goods and services we use.',
  },
  {
    id: 2,
    title: 'Action',
    description: 'The responsibility to assert ourselves and act to ensure that we get a fair deal. As long as we remain passive consumers, we will continue to be exploited.',
  },
  {
    id: 3,
    title: 'Social Concern',
    description: 'The responsibility to be aware of the impact of our consumption on other citizens, especially disadvantaged or vulnerable groups.',
  },
  {
    id: 4,
    title: 'Environmental Awareness',
    description: 'The responsibility to understand the environmental consequences of our consumption and recognize our duty to conserve resources.',
  },
  {
    id: 5,
    title: 'Solidarity',
    description: 'The responsibility to organize together as consumers to develop the strength and influence to promote and protect our common interests.',
  },
];

export const PRICE_ACT_REGULATIONS: ReadonlyArray<RegulationItem> = [
  {
    id: 'price-act-srp',
    heading: 'Baseline SRP Protection',
    lawReference: 'R.A. 7581 (Price Act) §10',
    description: 'DTI publishes official Suggested Retail Prices (SRP) for basic necessities and prime commodities. Retailers are expected to keep prices at or below these baselines.',
  },
  {
    id: 'price-act-10percent',
    heading: 'The 10% Normal Market Rule',
    lawReference: 'R.A. 7581 Implementing Rules & Regulations',
    description: 'In normal market conditions, any establishment selling more than 10% above the published SRP baseline is flagged as an anomaly, triggering an automatic DTI Letter of Inquiry (LOI) giving the vendor 48 hours to explain.',
  },
  {
    id: 'price-act-freeze',
    heading: 'Automatic Price Freeze in Calamity',
    lawReference: 'R.A. 7581 §6',
    description: 'When a State of Calamity or emergency is officially declared, covered basic necessities use the confirmed official APC or SRP-held ceiling with 0% markup tolerance. Violators face immediate Show Cause Orders and administrative fines.',
  },
];

export const PRICE_TAG_REGULATIONS: ReadonlyArray<RegulationItem> = [
  {
    id: 'price-tag-mandatory',
    heading: 'Mandatory Price Tagging',
    lawReference: 'R.A. 71 & R.A. 7394 Art. 81',
    description: 'All articles offered for sale at retail must bear a clear price tag, label, or barcode indicating the retail price. Goods cannot be sold without visibly displayed price indications.',
  },
  {
    id: 'price-tag-cashier-match',
    heading: 'Cashier Price Matching (One-Price Policy)',
    lawReference: 'R.A. 7394 Art. 81 & 82',
    description: 'It is unlawful to charge any price higher than what is printed on the shelf tag or label. If there is a price discrepancy between the shelf tag and checkout scanner, the lower price must govern.',
  },
  {
    id: 'price-tag-no-surcharge',
    heading: 'No Hidden Surcharges or Additional Fees',
    lawReference: 'DTI DAO No. 10-04 / R.A. 7394',
    description: 'The tagged price must be all-inclusive. Retailers cannot impose extra surcharges, card swipe fees, or round-up charges beyond the displayed retail shelf tag.',
  },
];

export const TERMS_OF_USE_SECTIONS: ReadonlyArray<LegalSection> = [
  {
    heading: 'Purpose of Platform',
    body: 'PRICE-Watch is an official government-citizen price transparency portal developed in coordination with the Department of Trade and Industry (DTI) Antique Provincial Office. It allows the public to inspect official Suggested Retail Prices (SRP) and submit digital receipt evidence for regulatory review in San Jose de Buenavista, Antique.',
  },
  {
    heading: 'Acceptable Evidence & Receipt Verification',
    body: 'Users who submit price reports must provide genuine, unedited photographs of printed retail sales receipts or official shelf price tags. Submitting intentionally falsified, fabricated, or third-party receipts not originating from the specified establishment is strictly prohibited.',
  },
  {
    heading: 'Digital Chain of Custody & Evidence Vault',
    body: 'To protect the integrity of citizen submissions, the PRICE-Watch client computes a cryptographic SHA-256 checksum of every receipt photo prior to upload. Photos are held in a restricted DTI vault and accessed strictly by authorized DTI evaluators for verification and legal notice generation.',
  },
  {
    heading: 'Regulatory Scope & Advisory Status',
    body: 'Published SRP baselines serve as reference standards. Variations due to promotional discounts, bundled items, or logistical supply disruptions are evaluated through DTI’s formal inquiry process. Submitting a report initiates administrative review but does not constitute a judicial filing.',
  },
  {
    heading: 'Zero Personal Tracking & Privacy',
    body: 'PRICE-Watch does not require account registration, passwords, phone numbers, or credit card details for public price checks. Browsing price bulletins is completely anonymous. Receipt photos are processed in accordance with the Data Privacy Act of 2012 (R.A. 10173).',
  },
];
