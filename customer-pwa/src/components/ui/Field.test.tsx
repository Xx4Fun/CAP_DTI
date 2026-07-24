import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field, PasswordField } from './Field';

describe('Field', () => {
  it('connects label, hint, and error', () => {
    render(<Field label="Reference number" name="reference" hint="Printed on your receipt." error="Enter a valid reference." />);
    const input = screen.getByRole('textbox', { name: 'Reference number' });
    expect(input).toHaveAccessibleDescription('Printed on your receipt. Enter a valid reference.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('reveals and conceals a password', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Password" name="password" />);
    const input = screen.getByLabelText('Password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
