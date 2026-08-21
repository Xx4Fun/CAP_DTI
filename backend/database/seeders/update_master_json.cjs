const fs = require('fs');

const mappings = JSON.parse(fs.readFileSync('c:/CAP101_DTI_SYS/backend/database/seeders/commodity_db_mappings.json', 'utf8'));
const masterPath = 'c:/CAP101_DTI_SYS/DTI_SRP_Master_List_2026-05-11.json';
const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

// Update DTI_SRP_Master_List_2026-05-11.json
let updatedCount = 0;
masterData.items = masterData.items.map(item => {
  const map = mappings.find(m => {
    return (m.matchedItemName === item.item_name && m.unit === item.unit) ||
           (m.category === item.category && m.matchedItemName === item.item_name);
  });
  if (map) {
    updatedCount++;
    return { ...item, image_path: map.dbPath };
  }
  return item;
});

fs.writeFileSync(masterPath, JSON.stringify(masterData, null, 2));
console.log('Updated', updatedCount, 'items in master JSON.');

// Update srpFallback.ts
const fallbackPath = 'c:/CAP101_DTI_SYS/customer-pwa/src/data/srpFallback.ts';
const fallbackCommodities = masterData.items.map((item, idx) => {
  let commodityName = item.item_name;
  if (item.unit && !commodityName.includes(item.unit)) {
    commodityName = commodityName + ' (' + item.unit + ')';
  }
  return {
    id: idx + 1,
    commodity_name: commodityName,
    image_path: item.image_path || null,
    category: item.category,
    unit: item.unit,
    regulatory_classification: item.regulatory_classification,
    baseline_price: item.srp,
    effective_date: '2026-05-11',
    is_active: true,
    price_freeze_applicable: item.price_freeze_applicable,
    price_freeze_treatment: item.price_freeze_treatment
  };
});

const tsCode = "import type { Commodity } from '../api/client';\n\nexport const fallbackCommodities: Commodity[] = " + JSON.stringify(fallbackCommodities, null, 4) + ";\n";
fs.writeFileSync(fallbackPath, tsCode);
console.log('Updated srpFallback.ts with ' + fallbackCommodities.length + ' items.');
