export interface ParsedCommodityDisplay {
  title: string;
  categoryPath: string;
  unit: string;
  effDate?: string;
}

export function formatCommodityDisplay(
  rawName: string,
  fallbackCategory = '',
  fallbackUnit = '',
  rawEffectiveDate = ''
): ParsedCommodityDisplay {
  if (!rawName) {
    return { title: '', categoryPath: fallbackCategory, unit: fallbackUnit };
  }

  let title = rawName.trim();
  let categoryPath = fallbackCategory.trim();
  let unit = fallbackUnit.trim();

  // Split multi-segment DTI titles: "Category - Subcategory - Product (Size)"
  if (title.includes(' - ')) {
    const parts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // The last element is ALWAYS the true product title e.g. "Absolute (1L)"
      title = parts[parts.length - 1];
      // All preceding elements form the Category Path e.g. "Bottled Water - Distilled Water"
      if (!categoryPath) {
        categoryPath = parts.slice(0, parts.length - 1).join(' - ');
      }
    }
  }

  // Extract size unit from parenthesis if missing
  const sizeMatch = title.match(/\(([^)]+)\)$/);
  if (sizeMatch && !unit) {
    unit = sizeMatch[1];
  }

  // Format date string if provided
  let effDate = rawEffectiveDate || '2026-05-11';
  if (effDate.includes('T')) {
    effDate = effDate.split('T')[0];
  }
  if (effDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    effDate = effDate.trim();
  }

  return { title, categoryPath, unit, effDate };
}
