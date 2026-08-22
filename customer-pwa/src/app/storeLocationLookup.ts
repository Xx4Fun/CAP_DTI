/**
 * Resolves a friendly localized store address or barangay for display on My Reports cards.
 */
const KNOWN_STORE_LOCATIONS: Array<{ match: RegExp; location: string }> = [
  { match: /robinsons superstore/i, location: 'Atabay, San Jose de Buenavista' },
  { match: /super metro|metro.*san jose/i, location: 'Tradetown, San Jose de Buenavista' },
  { match: /robinsons place|sibalom/i, location: 'Sibalom, Antique' },
  { match: /sm city|savemore|sm.*san jose/i, location: 'Poblacion, San Jose de Buenavista' },
  { match: /waltermart/i, location: 'Brgy. 1, San Jose de Buenavista' },
  { match: /gaisano grand|gaisano.*antique/i, location: 'San Angel, San Jose de Buenavista' },
  { match: /atabay/i, location: 'Atabay, San Jose de Buenavista' },
  { match: /tradetown/i, location: 'Tradetown, San Jose de Buenavista' },
  { match: /poblacion/i, location: 'Poblacion, San Jose de Buenavista' },
];

export function getStoreLocation(storeName?: string | null): string {
  if (!storeName || typeof storeName !== 'string') {
    return 'San Jose de Buenavista, Antique';
  }

  const found = KNOWN_STORE_LOCATIONS.find((entry) => entry.match.test(storeName));
  if (found) {
    return found.location;
  }

  return 'San Jose de Buenavista, Antique';
}
