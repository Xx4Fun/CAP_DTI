import { describe, it, expect } from 'vitest';
import {
  CONSUMER_RIGHTS,
  CONSUMER_RESPONSIBILITIES,
  PRICE_ACT_REGULATIONS,
  PRICE_TAG_REGULATIONS,
  TERMS_OF_USE_SECTIONS,
  TERMS_VERSION,
} from './termsAndConditions';

describe('termsAndConditions data module', () => {
  it('defines versioned terms of use', () => {
    expect(TERMS_VERSION).toBe('1.0');
    expect(TERMS_OF_USE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    expect(TERMS_OF_USE_SECTIONS.map((s) => s.heading)).toContain('Acceptable Evidence & Receipt Verification');
  });

  it('contains all 8 basic consumer rights under R.A. 7394', () => {
    expect(CONSUMER_RIGHTS).toHaveLength(8);
    const titles = CONSUMER_RIGHTS.map((r) => r.title);
    expect(titles).toContain('Right to Basic Needs');
    expect(titles).toContain('Right to Safety');
    expect(titles).toContain('Right to Information');
    expect(titles).toContain('Right to Choose');
    expect(titles).toContain('Right to Representation');
    expect(titles).toContain('Right to Redress');
    expect(titles).toContain('Right to Consumer Education');
    expect(titles).toContain('Right to a Healthy Environment');
  });

  it('contains the 5 consumer responsibilities', () => {
    expect(CONSUMER_RESPONSIBILITIES).toHaveLength(5);
    const titles = CONSUMER_RESPONSIBILITIES.map((r) => r.title);
    expect(titles).toContain('Critical Awareness');
    expect(titles).toContain('Action');
    expect(titles).toContain('Social Concern');
    expect(titles).toContain('Environmental Awareness');
    expect(titles).toContain('Solidarity');
  });

  it('details R.A. 7581 Price Act regulations', () => {
    expect(PRICE_ACT_REGULATIONS).toHaveLength(3);
    const headings = PRICE_ACT_REGULATIONS.map((p) => p.heading);
    expect(headings).toContain('Baseline SRP Protection');
    expect(headings).toContain('The 10% Normal Market Rule');
    expect(headings).toContain('Automatic Price Freeze in Calamity');
  });

  it('details R.A. 71 Price Tag Law regulations', () => {
    expect(PRICE_TAG_REGULATIONS).toHaveLength(3);
    const headings = PRICE_TAG_REGULATIONS.map((p) => p.heading);
    expect(headings).toContain('Mandatory Price Tagging');
    expect(headings).toContain('Cashier Price Matching (One-Price Policy)');
    expect(headings).toContain('No Hidden Surcharges or Additional Fees');
  });
});
