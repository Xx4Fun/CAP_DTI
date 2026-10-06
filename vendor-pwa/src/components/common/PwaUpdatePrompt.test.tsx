// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { put } from '../../offline/repository';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

const update = vi.hoisted(() => vi.fn());
vi.mock('../../app/pwaRegistration', () => ({ useRegisterSW: () => ({ needRefresh: [true, vi.fn()], updateServiceWorker: update }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps the current worker when a draft save failed and allows updating after the same draft is saved', async () => {
  const original = IDBObjectStore.prototype.put;
  const failed = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
    if (this.name === 'drafts') throw new DOMException('No space', 'QuotaExceededError');
    return original.call(this, value, key);
  });
  await expect(put(5, 'drafts', 'message/1', { draft: 'Keep me' })).rejects.toThrow('No space');
  failed.mockRestore();
  const user = userEvent.setup();
  render(<PwaUpdatePrompt />);
  await user.click(screen.getByRole('button', { name: 'Update now' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update now' })).toBeEnabled());
  expect(update).not.toHaveBeenCalled();
  await put(5, 'drafts', 'message/1', { draft: 'Keep me' });
  await user.click(screen.getByRole('button', { name: 'Update now' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(true));
});
