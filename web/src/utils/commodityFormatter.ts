export interface ParsedCommodityDisplay {
  title: string;
  categoryPath: string;
  unit: string;
}

export function formatCommodityDisplay(
  rawName: string,
  fallbackCategory = '',
  fallbackUnit = ''
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

  return { title, categoryPath, unit };
}

/**
 * Humanizes a kebab-case commodity key/slug into an official readable product title.
 * Examples:
 * - "5-star-esperma-white-20pcspack-03" -> "5-Star Esperma White (20 pcs/pack)"
 * - "absolute-1l" -> "Absolute 1L"
 * - "cafe-puro-17g" -> "Cafe Puro 17g"
 */
export function humanizeCommoditySlug(slug: string): string {
  if (!slug) return '';

  let cleaned = slug.trim().toLowerCase();

  // Strip trailing sequential database codes like -03, -06, -22 if preceded by packaging
  cleaned = cleaned.replace(/-(\d{2})$/, '');

  // Replace common package abbreviations before word split
  cleaned = cleaned.replace(/(\d+)\s*pcspack/gi, ' ($1 pcs/pack)');
  cleaned = cleaned.replace(/(\d+)\s*pcs/gi, ' ($1 pcs)');

  // Split on hyphens or underscores
  const words = cleaned.split(/[-_]+/).filter(Boolean);

  const formattedWords = words.map((word) => {
    // Preserve units like 1l, 350ml, 155g, 1kg
    if (/^\d+(ml|g|kg)$/i.test(word)) {
      return word.toLowerCase();
    }
    if (/^\d+l$/i.test(word)) {
      return word.slice(0, -1) + 'L';
    }
    // Specific Brand or common names
    if (word === '5') return '5';
    if (word === 'star') return 'Star';
    if (word === '5-star') return '5-Star';

    // Title case
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  let result = formattedWords.join(' ');
  // Handle "5 Star" -> "5-Star"
  result = result.replace(/^5 Star\b/, '5-Star');
  return result;
}

/**
 * Formats an ISO date or date string to Philippine Standard Time: "Oct 7, 2026".
 */
export function formatPstDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const raw = isoString.slice(0, 10);
    const date = new Date(raw + 'T00:00:00+08:00');
    if (isNaN(date.getTime())) return isoString.slice(0, 10);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString.slice(0, 10);
  }
}

/**
 * Formats a date range cleanly: "Oct 7, 2026 – Oct 8, 2026" or "Oct 7, 2026 (Open)".
 */
export function formatPstDateRange(startsOn: string | null | undefined, endsOn: string | null | undefined): string {
  if (!startsOn) return '—';
  const startStr = formatPstDate(startsOn);
  if (!endsOn) return `${startStr} (Open)`;
  const endStr = formatPstDate(endsOn);
  return `${startStr} – ${endStr}`;
}
