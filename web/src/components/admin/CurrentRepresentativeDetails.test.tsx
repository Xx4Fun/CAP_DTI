import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CurrentRepresentativeDetails } from './CurrentRepresentativeDetails'
import { representativeAuditDetails } from '../../utils/representativeAudit'

it('shows the operational representative with its role and update time', () => {
  render(<CurrentRepresentativeDetails representative={{ name: 'Ben Santos', title: 'Manager', updated_at: '2026-10-04T01:00:00Z' }} />)
  expect(screen.getByText('Current establishment representative')).toBeInTheDocument()
  expect(screen.getByText('Ben Santos · Manager')).toBeInTheDocument()
  expect(screen.getByText(/Updated/)).toBeInTheDocument()
})

it('formats an audited change with previous and new names and roles', () => {
  expect(representativeAuditDetails({ previous: { name: 'Ana', title: 'Owner' }, current: { name: 'Ben', title: 'Manager' }, store_name: 'Market' })).toBe('Market: Ana (Owner) → Ben (Manager)')
  expect(representativeAuditDetails({ previous: null, current: { name: 'Ana', title: 'Owner' } })).toBe('Not configured → Ana (Owner)')
})
