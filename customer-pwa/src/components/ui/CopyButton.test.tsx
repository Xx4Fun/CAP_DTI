import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('copies and announces success', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<CopyButton value="DTI-2026-001" label="Copy reference number" />);
    await user.click(screen.getByRole('button', { name: 'Copy reference number' }));
    expect(writeText).toHaveBeenCalledWith('DTI-2026-001');
    expect(screen.getByRole('status')).toHaveTextContent('Reference number copied.');
  });
});
