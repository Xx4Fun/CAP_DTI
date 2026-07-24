import { expect, it } from 'vitest';
import { describeRegulatoryStatus, deriveTimelineItems } from './status';

it('describes unavailable regulatory state without claiming normal monitoring', () => {
  expect(describeRegulatoryStatus({ kind: 'unavailable', reason: 'offline' }))
    .toBe('Regulatory status unavailable');
});

it('describes a confirmed normal-monitoring configuration', () => {
  expect(describeRegulatoryStatus({
    kind: 'available',
    config: {
      app_name: 'PRICE-Watch',
      state_of_calamity: false,
      privacy_notice_version: '1.0',
      max_upload_size_mb: 10,
      allowed_mime_types: ['image/jpeg'],
      last_updated_at: '2026-07-25T10:00:00Z',
    },
  })).toBe('Normal monitoring');
});

it('never marks the current timeline item completed', () => {
  const result = deriveTimelineItems([
    { status: 'Submitted', public_message: 'Received', timestamp: '2026-07-25' },
    { status: 'Under Evaluation', public_message: 'Reviewing', timestamp: '2026-07-26' },
  ], 'Under Evaluation');

  expect(result).toEqual([
    expect.objectContaining({ state: 'completed' }),
    expect.objectContaining({ state: 'current' }),
  ]);
});
