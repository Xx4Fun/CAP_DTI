const fs = require('fs');
const path = require('path');

const masterData = JSON.parse(fs.readFileSync('c:/CAP101_DTI_SYS/DTI_SRP_Master_List_2026-05-11.json', 'utf8'));
const fileMap = JSON.parse(fs.readFileSync('c:/CAP101_DTI_SYS/backend/database/seeders/commodity_images_map.json', 'utf8'));

const mappings = [];

fileMap.forEach(f => {
  const rel = f.originalPath.split(path.sep).join('/');
  const base = f.baseName;
  const dbPath = f.dbPath;

  let matchedItem = null;

  if (rel.includes('Battery/Energizer MaxAA')) {
    matchedItem = masterData.items.find(i => i.item_name.includes('Energizer Max') && i.unit === 'AA');
  } else if (rel.includes('Battery/Eveready Super Heavy Duty')) {
    matchedItem = masterData.items.find(i => i.item_name.includes('Eveready Super Heavy Duty') && i.unit === 'D');
  } else if (rel.startsWith('Beefloaf/')) {
    const brand = base.split('-')[0].split('150')[0].trim();
    matchedItem = masterData.items.find(i => i.category === 'Beef Loaf' && i.item_name.toLowerCase().includes(brand.toLowerCase()) && i.unit === '150g');
  } else if (rel.includes('Bread/Pinoy Pandesal')) {
    matchedItem = masterData.items.find(i => i.item_name.toLowerCase().includes('pandesal') && i.unit === '250g');
  } else if (rel.includes('Bread/Pinoy Tasty')) {
    matchedItem = masterData.items.find(i => i.item_name.toLowerCase().includes('tasty') && i.unit === '450g');
  } else if (rel.startsWith('Candles/')) {
    if (base.includes('5-Star Esperma White (25pcs.pack)#6')) matchedItem = masterData.items.find(i => i.item_name.includes('5-Star') && i.unit === '#06');
    else if (base.includes('5-Star Esperma White (4pcs.pack)#14')) matchedItem = masterData.items.find(i => i.item_name.includes('5-Star') && i.unit === '#14');
    else if (base.includes('Export Candles White (10pcs.pack)#10')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#10');
    else if (base.includes('Export Candles White (10pcs.pack)#12')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#12');
    else if (base.includes('Export Candles White (12pcs.pack)#8')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#08');
    else if (base.includes('Export Candles White (20pcs.pack) #3')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles White (20pcs./pack)') && i.unit === '#03');
    else if (base.includes('Export Candles White (20pcs.pack)#5')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#05');
    else if (base.includes('Export Candles White (20pcs.pack)#6')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#06');
    else if (base.includes('Export Candles White (4pcs.pack)#16')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles White (4pcs./pack)') && i.unit === '#16');
    else if (base.includes('Export Candles White (4pcs.pack)#18')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles White (4pcs./pack)') && i.unit === '#18');
    else if (base.includes('Export Candles White (4pcs.pack)#19')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles White (4pcs./pack)') && i.unit === '#19');
    else if (base.includes('Export Candles White (8pcs.pack)#14')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Candles') && i.unit === '#14');
    else if (base.includes('Export Vigil Candles WhiteYellow (12pcs.pack)#1')) matchedItem = masterData.items.find(i => i.item_name.includes('Export Vigil Candles') && i.unit === '#01');
    else if (base.includes('Liwanag Esperma Candle White (20pcs.pack)#5')) matchedItem = masterData.items.find(i => i.item_name.includes('Liwanag Esperma Candle White (20pcs./pack)') && i.unit === '#05');
    else if (base.includes('Liwanag Esperma Candle White (20pcs.pack).webp')) matchedItem = masterData.items.find(i => i.item_name.includes('Liwanag Esperma Candle White (20pcs./pack)') && i.unit === '#03');
    else if (base.includes('Liwanag Esperma Candle White (2pcs.pack)#24')) matchedItem = masterData.items.find(i => i.item_name.includes('Liwanag Esperma') && i.unit === '#24');
    else if (base.includes('Liwanag Esperma Candle White (4pcs.pack)#18')) matchedItem = masterData.items.find(i => i.item_name.includes('Liwanag Esperma') && i.unit === '#18');
    else if (base.includes('Manila Wax Sperma White (10pcs.pack)#2')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Sperma White (10pcs./pack)') && i.unit === '#02');
    else if (base.includes('Manila Wax Sperma White (2pcs.pack)#16')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Sperma') && i.unit === '#16');
    else if (base.includes('Manila Wax Sperma White (4pcs.pack)#14')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Sperma') && i.unit === '#14');
    else if (base.includes('MANILA WAX VOTIVE WHITE (6pcs.pack) #3')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Votive') && i.unit === '#03');
    else if (base.includes('Manila Wax Votive White (6pcs.pack)#2')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Votive') && i.unit === '#02');
    else if (base.includes('Manila Wax Votive WhiteYellow (6pcs.pack)#1')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Votive') && i.unit === '#01');
    else if (base.includes('Manila Wax Votive WhiteYellow (6pcs.pack)#2')) matchedItem = masterData.items.find(i => i.item_name.includes('Manila Wax Votive') && i.unit === '#02');
  } else if (rel.startsWith('Canned Sardines in Tomato Sauce/')) {
    if (base.includes('555 Bonus Pack')) matchedItem = masterData.items.find(i => i.item_name.includes('555 Bonus Pack'));
    else if (base.includes('Atami EOC')) matchedItem = masterData.items.find(i => i.item_name.includes('Atami Easy Open Can'));
    else if (base.includes('Atami Regular Lid')) matchedItem = masterData.items.find(i => i.item_name.includes('Atami Regular Lid'));
    else if (base.includes('King Cup Regular Lid')) matchedItem = masterData.items.find(i => i.item_name.includes('King Cup Regular Lid'));
    else if (base.includes('Lucky 7')) matchedItem = masterData.items.find(i => i.item_name.includes('Lucky 7'));
    else if (base.includes('Mariko Regular Lid')) matchedItem = masterData.items.find(i => i.item_name.includes('Mariko Regular Lid'));
    else if (base.includes('Mikado EOC')) matchedItem = masterData.items.find(i => i.item_name.includes('Mikado Easy Open Can'));
    else if (base.includes('Mikado Regular Lid')) matchedItem = masterData.items.find(i => i.item_name.includes('Mikado Regular Lid'));
    else if (base.includes('Saba Philippines')) matchedItem = masterData.items.find(i => i.item_name.includes('Saba Philippines'));
    else if (base.includes('Sllenas')) matchedItem = masterData.items.find(i => i.item_name.includes('Sallenas'));
    else if (base.includes('Toyo Bonus')) matchedItem = masterData.items.find(i => i.item_name.includes('Toyo Bonus'));
  } else if (rel.startsWith('Coffee/')) {
    if (base.includes('Blend 45')) matchedItem = masterData.items.find(i => i.item_name.includes('Blend 45'));
    else if (base.includes('Cafe Puro')) matchedItem = masterData.items.find(i => i.item_name.includes('Puro'));
    else if (base.includes('Greatest Taste')) matchedItem = masterData.items.find(i => i.item_name.includes('Great Taste'));
    else if (base.includes('Kopiko')) matchedItem = masterData.items.find(i => i.item_name.includes('Kopiko'));
    else if (base.includes('Nescafe')) matchedItem = masterData.items.find(i => i.item_name.includes('Nescafe'));
    else if (base.includes('San Mig')) matchedItem = masterData.items.find(i => i.item_name.includes('San Mig'));
  } else if (rel.startsWith('CornedBeef/')) {
    if (base.includes('Argentina150g')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Argentina') && i.unit === '150g');
    else if (base.includes('Argentina175g')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Argentina') && i.unit === '175g');
    else if (base.includes('Bingo150g')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Bingo') && i.unit === '150g');
    else if (base.includes('El Rancho')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('El Rancho'));
    else if (base.includes('Star Corned Beef')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Star'));
    else if (base.includes('Winner')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Winner'));
    else if (base.includes('Young_s Town')) matchedItem = masterData.items.find(i => i.category === 'Corned Beef' && i.item_name.includes('Young'));
  } else if (rel.startsWith('Distilled Water/')) {
    if (base.includes('Absolute 1L')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Absolute') && i.unit === '1L');
    else if (base.includes('Absolute 350ml')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Absolute') && i.unit === '350mL');
    else if (base.includes('Absolute 500ml')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Absolute') && i.unit === '500mL');
    else if (base.includes('Absolute 6L')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Absolute') && i.unit === '6L');
    else if (base.includes('SM Bonus 325')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('SM Bonus') && i.unit === '325mL');
    else if (base.includes('SM Bonus 500')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('SM Bonus') && i.unit === '500mL');
    else if (base.includes('Wilkins 1L')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Wilkins') && i.unit === '1L');
    else if (base.includes('Wilkins 330ml')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Wilkins') && i.unit === '330mL');
    else if (base.includes('Wilkins 500ml')) matchedItem = masterData.items.find(i => i.category.includes('Distilled') && i.item_name.includes('Wilkins') && i.unit === '500mL');
  } else if (rel.startsWith('Luncheon Meat/')) {
    if (base.includes('CDO')) matchedItem = masterData.items.find(i => i.category.includes('Luncheon') && i.item_name.includes('CDO'));
    else if (base.includes('Purefoods')) matchedItem = masterData.items.find(i => i.category.includes('Luncheon') && i.item_name.includes('Purefoods'));
  } else if (rel.startsWith('MeatLoaf/')) {
    if (base.includes('555-150g')) matchedItem = masterData.items.find(i => i.category === 'Meat Loaf' && i.item_name.includes('555'));
    else if (base.includes('Argentina150g')) matchedItem = masterData.items.find(i => i.category === 'Meat Loaf' && i.item_name.includes('Argentina') && i.unit === '150g');
    else if (base.includes('Argentina170g')) matchedItem = masterData.items.find(i => i.category === 'Meat Loaf' && i.item_name.includes('Argentina') && i.unit === '170g');
    else if (base.includes('CDO150g')) matchedItem = masterData.items.find(i => i.category === 'Meat Loaf' && i.item_name.includes('CDO'));
    else if (base.includes('Winner')) matchedItem = masterData.items.find(i => i.category === 'Meat Loaf' && i.item_name.includes('Winner'));
  } else if (rel.startsWith('Milk/')) {
    if (base.includes('Angel Filled')) matchedItem = masterData.items.find(i => i.item_name.includes('Angel Filled Milk'));
    else if (base.includes('Bear Brand 135g')) matchedItem = masterData.items.find(i => i.item_name.includes('Bear Brand') && i.unit === '135g');
    else if (base.includes('Birch Tree')) matchedItem = masterData.items.find(i => i.item_name.includes('Birch Tree'));
    else if (base.includes('Jersey Fortified')) matchedItem = masterData.items.find(i => i.item_name.includes('Jersey Fortified'));
    else if (base.includes('Jersey Sweetened')) matchedItem = masterData.items.find(i => i.item_name.includes('Jersey Sweetened'));
  } else if (rel.startsWith('Mineralized Water/')) {
    if (base.includes('Hidden-Spring 330ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Hidden Spring'));
    else if (base.includes('Refresh 350 ml')) matchedItem = masterData.items.find(i => i.category.includes('Mineralized') && i.item_name.includes('Refresh') && i.unit === '350mL');
    else if (base.includes('Refresh 500ml')) matchedItem = masterData.items.find(i => i.category.includes('Mineralized') && i.item_name.includes('Refresh') && i.unit === '500mL');
    else if (base.includes('robinsons mall 500 ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Robinsons'));
    else if (base.includes('summit 1l')) matchedItem = masterData.items.find(i => i.category.includes('Mineralized') && i.item_name.includes('Summit') && i.unit === '1L');
    else if (base.includes('SUMMIT 350ML')) matchedItem = masterData.items.find(i => i.category.includes('Mineralized') && i.item_name.includes('Summit') && i.unit === '350mL');
    else if (base.includes('SUMMIT 6L')) matchedItem = masterData.items.find(i => i.category.includes('Mineralized') && i.item_name.includes('Summit') && i.unit === '6L');
    else if (base.includes('supersavers natures pure 500 ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Supersavers') && i.unit === '500mL');
    else if (base.includes('Supersavers Nature_s Pure 330ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Supersavers') && i.unit === '330mL');
    else if (base.includes('Viva 330 ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Viva') && i.unit === '330mL');
  } else if (rel.startsWith('Noodles/')) {
    if (base.includes('Ho-Mi 55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Ho-Mi'));
    else if (base.includes('Lucky Me 55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Lucky Me'));
    else if (base.includes('Payless 55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Payless'));
    else if (base.includes('Quick Chow 55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Quickchow'));
  } else if (rel.startsWith('Patis/')) {
    if (base.includes('Datu Puti350ml')) matchedItem = masterData.items.find(i => i.category.includes('Patis') && i.item_name.includes('Datu Puti'));
    else if (base.includes('Lorins150ml (Pouch)')) matchedItem = masterData.items.find(i => i.item_name.includes('Lorins - Pouch'));
    else if (base.includes('Lorins350ml (Budget Pouch)')) matchedItem = masterData.items.find(i => i.item_name.includes('Lorins - Budget Pouch'));
    else if (base.includes('Lorins350ml (PET Bottle)')) matchedItem = masterData.items.find(i => i.item_name.includes('Lorins PET Bottle'));
    else if (base.includes('Nelicom350ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Nelicom'));
    else if (base.includes('SilverSwanSpecial350mlBottle')) matchedItem = masterData.items.find(i => i.item_name.includes('Silver Swan Special'));
  } else if (rel.startsWith('Purified Water/')) {
    if (base.includes('Magnolia Pure 355ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Magnolia Pure'));
    else if (base.includes('NATURE SPRING 1L')) matchedItem = masterData.items.find(i => i.category.includes('Purified') && i.item_name.includes('Nature') && i.unit === '1L');
    else if (base.includes('Nature Spring 500ml')) matchedItem = masterData.items.find(i => i.category.includes('Purified') && i.item_name.includes('Nature') && i.unit === '500mL');
    else if (base.includes('wilkins 1L')) matchedItem = masterData.items.find(i => i.category.includes('Purified') && i.item_name.includes('Wilkins') && i.unit === '1L');
    else if (base.includes('wilkins 500ml')) matchedItem = masterData.items.find(i => i.category.includes('Purified') && i.item_name.includes('Wilkins') && i.unit === '500mL');
  } else if (rel.startsWith('Salt/')) {
    if (base.includes('Fidel Coarse 250g')) matchedItem = masterData.items.find(i => i.item_name.includes('Fidel'));
    else if (base.includes('Lasap Rock Salt 250g')) matchedItem = masterData.items.find(i => i.item_name.includes('Lasap'));
  } else if (rel.startsWith('SoySouce/')) {
    if (base.includes('Datu Puti.350ml')) matchedItem = masterData.items.find(i => i.category.includes('Soy Sauce') && i.item_name.includes('Datu Puti'));
    else if (base.includes('Silver Swan200ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Silver Swan Doy Pack'));
    else if (base.includes('SilverSwan350ml')) matchedItem = masterData.items.find(i => i.category.includes('Soy Sauce') && i.item_name.includes('Silver Swan'));
  } else if (rel.startsWith('ToiletSoap/')) {
    if (base.includes('Green Cross (Pure Care)125g')) matchedItem = masterData.items.find(i => i.item_name.includes('Green Cross') && i.unit === '125g');
    else if (base.includes('Green Cross (Pure Care)55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Green Cross') && i.unit === '55g');
    else if (base.includes('Green Cross (Pure Care)85g')) matchedItem = masterData.items.find(i => i.item_name.includes('Green Cross') && i.unit === '85g');
    else if (base.includes('Palmolive Naturals')) matchedItem = masterData.items.find(i => i.item_name.includes('Palmolive Naturals'));
    else if (base.includes('Safeguard Pure White119g')) matchedItem = masterData.items.find(i => i.item_name.includes('Safeguard') && i.unit === '119g');
    else if (base.includes('Safeguard Pure White55g')) matchedItem = masterData.items.find(i => i.item_name.includes('Safeguard') && i.unit === '55g');
    else if (base.includes('Safeguard Pure White82g')) matchedItem = masterData.items.find(i => i.item_name.includes('Safeguard') && i.unit === '82g');
  } else if (rel.startsWith('Vinegar/')) {
    if (base.includes('Datu Puti White Vinegar350ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Datu Puti - White Vinegar'));
    else if (base.includes('Silver Swan Sukang Puti200ml')) matchedItem = masterData.items.find(i => i.item_name.includes('Silver Swan Sukang Puti Doy Pack'));
    else if (base.includes('Silver Swan Sukang Puti350ml')) matchedItem = masterData.items.find(i => i.category.includes('Vinegar (Gin and PET') && i.item_name.includes('Silver Swan Sukang Puti'));
  }

  if (matchedItem) {
    let commodityName = matchedItem.item_name;
    if (matchedItem.unit && !commodityName.includes(matchedItem.unit)) {
      commodityName = commodityName + ' (' + matchedItem.unit + ')';
    }
    mappings.push({
      originalImage: rel,
      dbPath: dbPath,
      commodityName: commodityName,
      matchedItemName: matchedItem.item_name,
      category: matchedItem.category,
      unit: matchedItem.unit
    });
  } else {
    console.log('UNMATCHED:', rel);
  }
});

console.log('Total mapped successfully:', mappings.length, '/', fileMap.length);
fs.writeFileSync('c:/CAP101_DTI_SYS/backend/database/seeders/commodity_db_mappings.json', JSON.stringify(mappings, null, 2));
