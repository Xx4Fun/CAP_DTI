import { describe, it, expect } from 'vitest';
import { formatCommodityDisplay } from './commodityFormatter';

describe('formatCommodityDisplay', () => {
  it('correctly parses multi-hyphen DTI commodity strings into clean product title and category path', () => {
    const result = formatCommodityDisplay('Bottled Water - Distilled Water - Absolute (1L)');
    expect(result.title).toBe('Absolute (1L)');
    expect(result.categoryPath).toBe('Bottled Water - Distilled Water');
    expect(result.unit).toBe('1L');
  });

  it('correctly handles 4-level nested commodity strings', () => {
    const result = formatCommodityDisplay('Condiments - Vinegar (Gin and PET Bottle) - Datu Puti - White Vinegar (350mL)');
    expect(result.title).toBe('White Vinegar (350mL)');
    expect(result.categoryPath).toBe('Condiments - Vinegar (Gin and PET Bottle) - Datu Puti');
    expect(result.unit).toBe('350mL');
  });

  it('preserves existing category if already present and parses title', () => {
    const result = formatCommodityDisplay('Bottled Water - Distilled Water - Absolute (350mL)', 'Bottled Water - Distilled Water', '350mL');
    expect(result.title).toBe('Absolute (350mL)');
    expect(result.categoryPath).toBe('Bottled Water - Distilled Water');
    expect(result.unit).toBe('350mL');
  });

  it('handles single segment commodity names gracefully', () => {
    const result = formatCommodityDisplay('Absolute (500mL)', 'Bottled Water - Distilled Water', '500mL');
    expect(result.title).toBe('Absolute (500mL)');
    expect(result.categoryPath).toBe('Bottled Water - Distilled Water');
    expect(result.unit).toBe('500mL');
  });
});
