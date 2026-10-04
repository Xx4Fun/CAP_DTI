// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RepresentativeCard } from './RepresentativeCard';
import type { VendorStore } from '../../app/types';
import { formatDate } from '../../app/rules';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const store = { id: 1, store_name: 'Market One', current_representative: { name: 'Ana', title: 'Owner', updated_at: '2026-10-04T01:00:00Z' } } as VendorStore;

it('preserves unsaved input through background refresh and resets on establishment switch', () => {
  const save = vi.fn();
  const { rerender } = render(<RepresentativeCard store={store} onSave={save} />);
  expect(screen.getByText(formatDate(store.current_representative!.updated_at, true))).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change representative' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ben' } });
  rerender(<RepresentativeCard store={{ ...store, current_representative: { ...store.current_representative!, name: 'New server name' } }} onSave={save} />);
  expect(screen.getByLabelText('Full name')).toHaveValue('Ben');
  rerender(<RepresentativeCard store={{ ...store, id: 2, store_name: 'Market Two' }} onSave={save} />);
  expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  expect(screen.getByText('Market Two')).toBeInTheDocument();
});

it('trims the name, saves the selected role, and retains input after a connection failure', async () => {
  const save = vi.fn().mockRejectedValue(new Error('offline'));
  render(<RepresentativeCard store={store} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change representative' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '  Ben Santos  ' } });
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Manager' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(save).toHaveBeenCalledWith(1, { name: 'Ben Santos', title: 'Manager' });
  expect(screen.getByLabelText('Full name')).toHaveValue('  Ben Santos  ');
});

it('rejects whitespace', () => {
  const save = vi.fn();
  render(<RepresentativeCard store={store} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change representative' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter');
  expect(save).not.toHaveBeenCalled();
});

it('keeps entered details offline without attempting a save', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const save = vi.fn();
  render(<RepresentativeCard store={store} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change representative' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ben Santos' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Connect to the internet');
  expect(screen.getByLabelText('Full name')).toHaveValue('Ben Santos');
  expect(save).not.toHaveBeenCalled();
});
