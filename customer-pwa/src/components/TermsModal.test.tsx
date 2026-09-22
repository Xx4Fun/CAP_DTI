import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TermsModal } from './TermsModal';

describe('TermsModal component', () => {
  it('renders with Terms of Use tab selected by default', () => {
    render(<TermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />);

    expect(screen.getByRole('dialog', { name: /Terms of Service & Policies/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Terms of Use/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Purpose of Platform')).toBeInTheDocument();
    expect(screen.getByText(/PRICE-Watch is an official government-citizen price transparency portal/i)).toBeInTheDocument();
  });

  it('switches to Privacy Notice tab when clicked', async () => {
    const user = userEvent.setup();
    render(<TermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />);

    const privacyTab = screen.getByRole('tab', { name: /Privacy Notice/i });
    await user.click(privacyTab);

    expect(privacyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/DTI Consumer Evidence Vault Privacy Notice/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={handleClose} initialTab="terms" />);

    const closeBtn = screen.getByRole('button', { name: /Close policies modal/i });
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses modal on Escape key press', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={handleClose} initialTab="terms" />);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when isOpen is false', () => {
    render(<TermsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with Privacy Notice active when initialTab is privacy', () => {
    render(<TermsModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />);
    expect(screen.getByRole('tab', { name: /Privacy Notice/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/DTI Consumer Evidence Vault Privacy Notice/i)).toBeInTheDocument();
  });

  it('calls onClose when "Understood & Close" button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<TermsModal isOpen={true} onClose={handleClose} />);

    const doneBtn = screen.getByRole('button', { name: /Understood & Close/i });
    await user.click(doneBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open and restores on unmount', () => {
    const { unmount } = render(<TermsModal isOpen={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

