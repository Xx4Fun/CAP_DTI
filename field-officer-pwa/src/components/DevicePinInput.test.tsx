// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DevicePinInput } from './DevicePinInput'

function ControlledPin() {
  const [value, setValue] = useState('')
  return <DevicePinInput value={value} onChange={setValue} />
}

describe('DevicePinInput', () => {
  it('supports paste-like input, backspace, and slot-click refocusing through one native numeric field', async () => {
    const user = userEvent.setup()
    const { container } = render(<ControlledPin />)
    const input = screen.getByLabelText('4-digit device PIN') as HTMLInputElement

    fireEvent.change(input, { target: { value: '1a23-45' } })
    expect(input).toHaveValue('1234')
    await user.click(input)
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('123')

    const slots = container.querySelector('.pin-slots') as HTMLElement
    input.blur()
    await user.click(slots)
    expect(input).toHaveFocus()
    expect(container.querySelectorAll('.pin-slots > span')).toHaveLength(4)
  })
})
