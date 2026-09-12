import { describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_SECTIONS, PRIVACY_NOTICE_TITLE, PRIVACY_NOTICE_VERSION } from './privacyNotice';

describe('privacy notice', () => {
  it('pins the version to the text the app actually shows', () => {
    expect(PRIVACY_NOTICE_VERSION).toBe('1.1');
    expect(PRIVACY_NOTICE_TITLE).toContain('v1.1');
    expect(PRIVACY_NOTICE_SECTIONS.map((section) => section.heading)).toEqual([
      'Scope',
      'Restricted access',
      'Tamper-evident originals',
      'Automated receipt reading',
      'Your photos',
    ]);
  });

  it('never claims DTI-only access without naming the automated reading', () => {
    const restricted = PRIVACY_NOTICE_SECTIONS.find((section) => section.heading === 'Restricted access');
    const automated = PRIVACY_NOTICE_SECTIONS.find((section) => section.heading === 'Automated receipt reading');

    expect(restricted?.body).toMatch(/automated reading/i);
    expect(automated?.body).toMatch(/Google/);
  });

  it('discloses the audit logging the backend performs', () => {
    const text = PRIVACY_NOTICE_SECTIONS.map((section) => section.body).join(' ');

    expect(text).toMatch(/IP address/i);
    expect(text).toMatch(/browser details/i);
  });

  it('never exposes server paths to customers', () => {
    const text = PRIVACY_NOTICE_SECTIONS.map((section) => section.body).join(' ');

    expect(text).not.toMatch(/storage\/app|receipt_vault|[A-Z]:\\/);
  });
});
