import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BackNavigationProvider } from './backNavigation';
import { useBackLayer } from '../hooks/useBackLayer';

function BackLayerHarness() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useBackLayer('panel', panelOpen, () => setPanelOpen(false));
  useBackLayer('dialog', dialogOpen, () => setDialogOpen(false));

  return (
    <>
      <button type="button" onClick={() => setPanelOpen(true)}>Open panel</button>
      {panelOpen && (
        <section aria-label="Panel">
          <button type="button" onClick={() => setDialogOpen(true)}>Open dialog</button>
        </section>
      )}
      {dialogOpen && <div role="dialog" aria-label="Dialog">Dialog</div>}
    </>
  );
}

describe('BackNavigationProvider', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/prices');
  });

  it('keeps one same-route history guard and closes the topmost transient layer first', async () => {
    const user = userEvent.setup();
    render(
      <BackNavigationProvider>
        <BackLayerHarness />
      </BackNavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open panel' }));
    await waitFor(() => expect(history.state).toMatchObject({ __priceWatchBackGuard: true }));

    const firstGuardState = history.state;
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(history.state).toBe(firstGuardState);

    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dialog' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Panel' })).toBeInTheDocument();
    await waitFor(() => expect(history.state).toMatchObject({ __priceWatchBackGuard: true }));

    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Panel' })).not.toBeInTheDocument());
    expect(location.pathname).toBe('/prices');
  });
});
