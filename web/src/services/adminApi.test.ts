import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({ default: { get, post } }))

import { adminApi } from './adminApi'

describe('adminApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opts into emergency summaries without changing the legacy list or detail requests', async () => {
    get.mockResolvedValue({ data: { data: [] } })
    await adminApi.getEmergencySummaries()
    await adminApi.getEmergencies()
    await adminApi.getEmergency(7)
    expect(get).toHaveBeenNthCalledWith(1, '/admin/emergencies', { params: { view: 'summary' } })
    expect(get).toHaveBeenNthCalledWith(2, '/admin/emergencies')
    expect(get).toHaveBeenNthCalledWith(3, '/admin/emergencies/7')
  })

  it('loads the establishment workspace, history, records, and verification queue', async () => {
    get.mockResolvedValue({ data: { data: { ok: true } } })

    await adminApi.getMonitoringEstablishments({ search: 'Central', routine_status: 'completed', additional_task: 'verification_required', observation: 'with_observations', page: 2, per_page: 25 })
    await adminApi.getMonitoringEstablishment(7)
    await adminApi.getMonitoringPriceHistory(7, { commodity: 'key:rice', page: 2, per_page: 25 })
    await adminApi.getMonitoringRecords({ store_id: 7, anomaly: 'yes' })
    await adminApi.getFieldVerificationRequests({ status: 'open', search: 'Central', store_id: 7, page: 1, per_page: 10 })

    expect(get).toHaveBeenNthCalledWith(1, '/admin/monitoring-establishments', { params: { search: 'Central', routine_status: 'completed', additional_task: 'verification_required', observation: 'with_observations', page: 2, per_page: 25 } })
    expect(get).toHaveBeenNthCalledWith(2, '/admin/monitoring-establishments/7')
    expect(get).toHaveBeenNthCalledWith(3, '/admin/monitoring-establishments/7/price-history', { params: { commodity: 'key:rice', page: 2, per_page: 25 } })
    expect(get).toHaveBeenNthCalledWith(4, '/admin/monitoring-records', { params: { store_id: 7, anomaly: 'yes' } })
    expect(get).toHaveBeenNthCalledWith(5, '/admin/verification-requests', { params: { status: 'open', search: 'Central', store_id: 7, page: 1, per_page: 10 } })
  })

  it('creates assigned complaint and supervisor visits', async () => {
    post.mockResolvedValue({ data: { data: { id: 301, status: 'claimed' } } })

    await adminApi.requestFieldVerification(101, { reason: 'Verify the shelf price in person.', field_officer_id: 9 })
    await adminApi.createAdditionalVisit(7, { reason: 'Supervisor revisit.', field_officer_id: 9 })
    await adminApi.assignFieldVerification(301, 9)

    expect(post).toHaveBeenNthCalledWith(1, '/admin/reports/101/verification-request', { reason: 'Verify the shelf price in person.', field_officer_id: 9 })
    expect(post).toHaveBeenNthCalledWith(2, '/admin/monitoring-establishments/7/additional-visits', { reason: 'Supervisor revisit.', field_officer_id: 9 })
    expect(post).toHaveBeenNthCalledWith(3, '/admin/verification-requests/301/assign', { field_officer_id: 9 })
  })

  it('posts verification lifecycle controls to their dedicated endpoints', async () => {
    post.mockResolvedValue({ data: { data: { id: 301, status: 'cancelled' } } })
    const api = adminApi as typeof adminApi & {
      cancelFieldVerification: (requestId: number) => Promise<{ id: number; status: string }>
      reopenFieldVerification: (requestId: number) => Promise<{ id: number; status: string }>
    }

    await expect(api.cancelFieldVerification(301)).resolves.toEqual({ id: 301, status: 'cancelled' })
    await expect(api.reopenFieldVerification(301)).resolves.toEqual({ id: 301, status: 'cancelled' })

    expect(post).toHaveBeenNthCalledWith(1, '/admin/verification-requests/301/cancel')
    expect(post).toHaveBeenNthCalledWith(2, '/admin/verification-requests/301/reopen')
  })

  it('loads, refreshes, and confirms an APC preparation by hash', async () => {
    const record = { id: 7, preparation_hash: 'a'.repeat(64) }
    get.mockResolvedValue({ data: { data: record } })
    post.mockResolvedValue({ data: { data: record } })

    await adminApi.getEmergency(7)
    await adminApi.prepareEmergency(7)
    await adminApi.activateEmergency(7, { confirmed: true, preparation_hash: record.preparation_hash })

    expect(get).toHaveBeenCalledWith('/admin/emergencies/7')
    expect(post).toHaveBeenNthCalledWith(1, '/admin/emergencies/7/prepare')
    expect(post).toHaveBeenNthCalledWith(2, '/admin/emergencies/7/activate', { confirmed: true, preparation_hash: record.preparation_hash })
  })

  it('gives a legacy legal notice with no snapshot or payload empty ones', async () => {
    const legacy = { id: 7, status: 'issued', source_snapshot: null, draft_payload: null }
    get.mockResolvedValueOnce({ data: { data: legacy } })
    expect(await adminApi.getLegalNotice(7)).toMatchObject({ id: 7, source_snapshot: { items: [] }, draft_payload: {} })

    get.mockResolvedValueOnce({ data: { data: { data: [legacy], current_page: 1, last_page: 1, total: 1 } } })
    expect((await adminApi.getLegalNotices()).data[0]).toMatchObject({ source_snapshot: { items: [] }, draft_payload: {} })

    // A notice that has a snapshot keeps it.
    get.mockResolvedValueOnce({ data: { data: { id: 8, source_snapshot: { store: { store_name: 'A' }, items: [{ id: 1 }] }, draft_payload: { reason: 'Prices above SRP' } } } })
    expect(await adminApi.getLegalNotice(8)).toMatchObject({ source_snapshot: { store: { store_name: 'A' }, items: [{ id: 1 }] }, draft_payload: { reason: 'Prices above SRP' } })
  })
})
