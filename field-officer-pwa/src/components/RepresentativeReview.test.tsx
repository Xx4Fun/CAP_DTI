// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RepresentativeReview } from './RepresentativeReview'
import { fieldApi } from '../services/fieldApi'
import { applyRepresentativePrefill } from '../app/representative'
import { createDraft } from '../app/workflow'
import type { RepresentativeStore, StoreRecord, VisitDraft } from '../types'

vi.mock('../services/fieldApi', () => ({ fieldApi: { representative: vi.fn() } }))
afterEach(cleanup)
const store: StoreRecord = { id: 7, store_name: 'Market', address: 'Antique', latitude: 10, longitude: 121, is_active: true, owner_name: 'Owner', current_representative: { name: 'Ana', title: 'Manager', updated_at: '2026-10-04T01:00:00Z' } }
const draft = () => applyRepresentativePrefill({ ...createDraft('lease'), store_id: 7 }, store)
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fieldApi.representative).mockResolvedValue({ ...store, current_representative: { ...store.current_representative!, name: 'Ben' } }) })

function Harness({ initial = draft(), online = true, cache = vi.fn() }: { initial?: VisitDraft; online?: boolean; cache?: (store: RepresentativeStore) => Promise<void> }) {
  const [value, setValue] = useState(initial)
  const [ready, setReady] = useState(false)
  return <><RepresentativeReview draft={value} store={store} token="token" online={online} onDraft={setValue} onCache={cache} onReady={setReady} /><output data-testid="draft">{JSON.stringify(value)}</output><button disabled={!ready}>Capture signature</button></>
}

it('checks fresh details, caches them and requires identity confirmation before signatures', async () => {
  const cache = vi.fn().mockResolvedValue(undefined)
  render(<Harness cache={cache} />)
  await waitFor(() => expect(screen.getByLabelText('Store representative name')).toHaveValue('Ben'))
  expect(cache).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
  expect(screen.getByRole('button', { name: 'Capture signature' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Capture signature' })).toBeEnabled()
})

it('uses cached details offline or after a failed connection', async () => {
  const { unmount } = render(<Harness online={false} />)
  expect(screen.getByText('Using saved representative details. Confirm with the person signing.')).toBeInTheDocument()
  expect(screen.getByLabelText('Store representative name')).toHaveValue('Ana')
  expect(fieldApi.representative).not.toHaveBeenCalled()
  unmount()
  vi.mocked(fieldApi.representative).mockRejectedValue(new Error('network'))
  render(<Harness />)
  await screen.findByText('Using saved representative details. Confirm with the person signing.')
  expect(screen.getByLabelText('Store representative name')).toHaveValue('Ana')
})

it('preserves manual edits made during a delayed fetch and offers the current representative', async () => {
  let resolve!: (store: RepresentativeStore) => void
  vi.mocked(fieldApi.representative).mockReturnValue(new Promise((done) => { resolve = done }))
  render(<Harness />)
  fireEvent.change(screen.getByLabelText('Store representative name'), { target: { value: 'Actual signer' } })
  await act(async () => resolve({ ...store, current_representative: { ...store.current_representative!, name: 'Ben' } }))
  expect(screen.getByLabelText('Store representative name')).toHaveValue('Actual signer')
  fireEvent.click(screen.getByRole('button', { name: 'Use current representative' }))
  expect(screen.getByLabelText('Store representative name')).toHaveValue('Ben')
})

it('requires confirmation to change signed identity and clears both signatures only on approval', async () => {
  render(<Harness initial={{ ...draft(), representative_confirmed: true, signatures: { officer_png_base64: 'officer', representative_png_base64: 'signer' } }} />)
  await screen.findByRole('button', { name: 'Use current representative' })
  fireEvent.change(screen.getByLabelText('Position / Title'), { target: { value: 'Cashier' } })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByTestId('draft')).toHaveTextContent('"representative_png_base64":"signer"')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByLabelText('Position / Title')).toHaveValue('Manager')
  fireEvent.click(screen.getByRole('button', { name: 'Use current representative' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear signatures and change' }))
  expect(screen.getByTestId('draft')).toHaveTextContent('"officer_png_base64":""')
  expect(screen.getByTestId('draft')).toHaveTextContent('"representative_png_base64":""')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

it('discards a delayed response after navigation instead of touching another visit or cache', async () => {
  let resolve!: (store: RepresentativeStore) => void
  vi.mocked(fieldApi.representative).mockReturnValue(new Promise((done) => { resolve = done }))
  const cache = vi.fn()
  const onDraft = vi.fn()
  const { unmount } = render(<RepresentativeReview draft={draft()} store={store} token="token" online onDraft={onDraft} onCache={cache} onReady={vi.fn()} />)
  unmount()
  await act(async () => resolve(store))
  expect(onDraft).not.toHaveBeenCalled()
  expect(cache).not.toHaveBeenCalled()
})

it('does not update the visit after navigation while its encrypted cache write is pending', async () => {
  let finishCache!: () => void
  const cache = vi.fn().mockReturnValue(new Promise<void>((done) => { finishCache = done }))
  const onDraft = vi.fn()
  const { unmount } = render(<RepresentativeReview draft={draft()} store={store} token="token" online onDraft={onDraft} onCache={cache} onReady={vi.fn()} />)
  await waitFor(() => expect(cache).toHaveBeenCalledTimes(1))
  unmount()
  await act(async () => finishCache())
  expect(onDraft).not.toHaveBeenCalled()
})
