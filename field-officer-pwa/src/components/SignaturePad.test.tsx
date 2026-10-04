// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SignaturePad } from './SignaturePad'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('does not capture or clear signatures while identity confirmation is pending', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const change = vi.fn()
  render(<SignaturePad label="Signer" value="" onChange={change} disabled />)
  const canvas = screen.getByLabelText('Signer signature area')
  fireEvent.pointerDown(canvas)
  fireEvent.pointerMove(canvas)
  fireEvent.pointerUp(canvas)
  fireEvent.click(screen.getByRole('button', { name: /Clear/ }))
  expect(change).not.toHaveBeenCalled()
  expect(canvas).toHaveAttribute('aria-disabled', 'true')
})

it('cannot redraw a previous signer from a delayed image load after signatures are cleared', () => {
  const pending: Array<{ onload: (() => void) | null }> = []
  vi.stubGlobal('Image', class { onload = null; set src(_value: string) { pending.push(this) } })
  const drawImage = vi.fn()
  const context = { drawImage, scale: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 150 } as DOMRect)
  const { rerender } = render(<SignaturePad label="Signer" value="data:image/png;base64,old-signer" onChange={vi.fn()} />)
  expect(pending.length).toBeGreaterThan(0)
  rerender(<SignaturePad label="Signer" value="" onChange={vi.fn()} />)
  for (const image of pending) image.onload?.()
  expect(drawImage).not.toHaveBeenCalled()
})

it('discards pending image restores after the signature pad unmounts', () => {
  const pending: Array<{ onload: (() => void) | null }> = []
  vi.stubGlobal('Image', class { onload = null; set src(_value: string) { pending.push(this) } })
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, scale: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 150 } as DOMRect)
  const { unmount } = render(<SignaturePad label="Signer" value="data:image/png;base64,old-signer" onChange={vi.fn()} />)
  unmount()
  for (const image of pending) image.onload?.()
  expect(drawImage).not.toHaveBeenCalled()
})
