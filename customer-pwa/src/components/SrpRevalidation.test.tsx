import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { SrpSearch } from './SrpSearch'

describe('SRP live bulletin revalidation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('refreshes the authoritative bulletin when the customer returns to the app', async () => {
    localStorage.clear()
    const request = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: 1,
          commodity_name: 'Premium Rice',
          baseline_price: 48,
          effective_date: '2026-05-11',
          is_active: true,
        }],
      },
    })

    render(<SrpSearch />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })
})
