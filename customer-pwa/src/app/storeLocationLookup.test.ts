import { describe, expect, it } from 'vitest';
import { getStoreLocation } from './storeLocationLookup';

describe('getStoreLocation', () => {
  it('resolves known store locations in San Jose and Antique', () => {
    expect(getStoreLocation('Robinsons Superstore Antique')).toBe('Atabay, San Jose de Buenavista');
    expect(getStoreLocation('Super Metro San Jose')).toBe('Tradetown, San Jose de Buenavista');
    expect(getStoreLocation('Robinsons Place Antique')).toBe('Sibalom, Antique');
    expect(getStoreLocation('SM City San Jose')).toBe('Poblacion, San Jose de Buenavista');
    expect(getStoreLocation('WalterMart San Jose')).toBe('Brgy. 1, San Jose de Buenavista');
    expect(getStoreLocation('Gaisano Grand Antique')).toBe('San Angel, San Jose de Buenavista');
  });

  it('falls back safely for unknown or missing store names', () => {
    expect(getStoreLocation('Corner Sari-Sari Store')).toBe('San Jose de Buenavista, Antique');
    expect(getStoreLocation('')).toBe('San Jose de Buenavista, Antique');
    expect(getStoreLocation(null)).toBe('San Jose de Buenavista, Antique');
  });
});
