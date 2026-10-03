import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The 1000 ms default is too tight when the machine is busy: a lazy panel import plus one
// role query over the styled DOM can take longer than that. Assertions are unchanged.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
