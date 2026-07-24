import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const firstAction = createRef<HTMLButtonElement>();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open details</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Product details" initialFocusRef={firstAction}>
        <button type="button" ref={firstAction}>Confirm</button>
        <button type="button">Cancel</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('manages focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: 'Open details' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps keyboard focus inside', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    close.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });
});
