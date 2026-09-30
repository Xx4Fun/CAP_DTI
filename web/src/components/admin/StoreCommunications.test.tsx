import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import type { ConversationThread } from '../../types/admin'
import { StoreCommunications } from './StoreCommunications'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getConversations: vi.fn(),
    getConversation: vi.fn(),
    sendStoreMessage: vi.fn(),
    getMessageAttachment: vi.fn(),
  },
}))

// The full suite runs files in parallel; the default 1 s wait for lazy renders is too tight under that load.
configure({ asyncUtilTimeout: 5000 })

const api = vi.mocked(adminApi)

const thread = (overrides: Partial<ConversationThread> = {}): ConversationThread => ({
  store: { id: 7, store_name: 'Antique Grocery', address: 'San Jose', linked: true, vendor: { id: 3, name: 'Maria', email: 'maria@shop.test', is_active: true } },
  messages: [
    { id: 1, sender_side: 'vendor', sender_name: 'Maria', vendor_user_id: 3, body: 'Supplier raised prices.', read_at: null, created_at: '2026-09-28T01:00:00Z', attachment: null },
  ],
  notices: [
    { id: 11, notice_type: 'LOI', control_number: 'LOI-2026-000011', status: 'issued', delivery_state: 'received', preceding_notice_id: null, created_at: '2026-09-27T00:00:00Z', issued_at: '2026-09-27T02:00:00Z', delivered_at: '2026-09-27T03:00:00Z', due_date_timestamp: '2026-10-01T01:00:00Z', response_received_at: null, closed_at: null, cancelled_at: null },
  ],
  has_more: false,
  eligible_records: [{ id: 42, client_uuid: 'uuid', finalized_at: '2026-09-26T00:00:00Z', eligible_item_count: 2 }],
  ...overrides,
})

describe('StoreCommunications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=communications')
    api.getConversations.mockResolvedValue({ data: [
      { id: 7, store_name: 'Antique Grocery', address: 'San Jose', linked: true, vendor: { id: 3, name: 'Maria', email: 'maria@shop.test', is_active: true }, unread_count: 2, open_notice_count: 1, last_message: { sender_side: 'vendor', created_at: '2026-09-28T01:00:00Z', preview: 'Supplier raised prices.' } },
      { id: 8, store_name: 'Old Store', address: 'Sibalom', linked: false, vendor: null, unread_count: 0, open_notice_count: 0, last_message: null },
    ], current_page: 1, last_page: 1, total: 2 })
  })

  it('lists stores with unread counts and shows messages and notice cards in one thread', async () => {
    api.getConversation.mockResolvedValue(thread())
    const user = userEvent.setup()
    render(<StoreCommunications />)

    const list = await screen.findByRole('complementary', { name: 'Store conversations' })
    expect(await within(list).findByLabelText('2 unread')).toBeInTheDocument()
    expect(within(list).getByText('Unlinked')).toBeInTheDocument()

    await user.click(within(list).getByRole('button', { name: /Antique Grocery/ }))
    expect(await screen.findByText('Supplier raised prices.', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Letter of Inquiry LOI-2026-000011/ })).toBeInTheDocument()
    // Later steps appear as their own timeline entries at the time they happened.
    expect(screen.getByRole('button', { name: /LOI-2026-000011 · Delivery recorded: received/ })).toBeInTheDocument()
    expect(within(list).queryByLabelText('2 unread')).not.toBeInTheDocument()
  })

  it('sends a message and appends it to the thread', async () => {
    api.getConversation.mockResolvedValue(thread())
    api.sendStoreMessage.mockResolvedValue({ id: 2, sender_side: 'dti', sender_name: 'Evaluator', vendor_user_id: 3, body: 'Please send the invoice.', read_at: null, created_at: '2026-09-28T02:00:00Z', attachment: null })
    const user = userEvent.setup()
    render(<StoreCommunications />)
    await user.click(await screen.findByRole('button', { name: /Antique Grocery/ }))

    await user.type(await screen.findByLabelText('Message'), 'Please send the invoice.')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(api.sendStoreMessage).toHaveBeenCalledWith(7, { body: 'Please send the invoice.', attachment: undefined })
    expect(await screen.findByText('Please send the invoice.', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })

  it('hands off an eligible visit to Legal Actions and opens notice cards there', async () => {
    api.getConversation.mockResolvedValue(thread())
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<StoreCommunications onNavigate={onNavigate} />)
    await user.click(await screen.findByRole('button', { name: /Antique Grocery/ }))

    await user.click(await screen.findByRole('button', { name: 'Prepare LOI/SCO' }))
    await user.click(screen.getByRole('button', { name: 'Prepare notice' }))
    expect(onNavigate).toHaveBeenLastCalledWith('legal_actions')
    expect(new URLSearchParams(window.location.search).get('source_record')).toBe('42')

    await user.click(screen.getByRole('button', { name: 'Open in Legal Actions' }))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('source_notice')).toBe('11')
    expect(params.get('source_record')).toBeNull()
  })

  it('keeps an unlinked store read-only', async () => {
    api.getConversation.mockResolvedValue(thread({ store: { id: 8, store_name: 'Old Store', address: 'Sibalom', linked: false, vendor: null }, messages: [], notices: [], eligible_records: [] }))
    const user = userEvent.setup()
    render(<StoreCommunications />)
    await user.click(await screen.findByRole('button', { name: /Old Store/ }))

    expect(await screen.findByText(/conversation is read-only/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare LOI/SCO' })).toBeDisabled()
  })

  it('rejects unsupported attachment types before upload', async () => {
    api.getConversation.mockResolvedValue(thread())
    const user = userEvent.setup({ applyAccept: false })
    render(<StoreCommunications />)
    await user.click(await screen.findByRole('button', { name: /Antique Grocery/ }))

    await user.upload(await screen.findByLabelText('Attach a file'), new File(['x'], 'run.exe', { type: 'application/x-msdownload' }))
    expect(await screen.findByText('Attach a PDF, JPEG, PNG, or WebP file.')).toBeInTheDocument()
    await waitFor(() => expect(api.sendStoreMessage).not.toHaveBeenCalled())
  })

  it('names the vendor on DTI messages and loads earlier history on request', async () => {
    api.getConversation.mockResolvedValueOnce(thread({
      has_more: true,
      messages: [{ id: 50, sender_side: 'dti', sender_name: 'Evaluator', vendor_name: 'Maria', vendor_user_id: 3, body: 'Latest', read_at: null, created_at: '2026-09-28T03:00:00Z', attachment: null }],
    })).mockResolvedValueOnce(thread({
      has_more: false, notices: [],
      messages: [{ id: 10, sender_side: 'vendor', sender_name: 'Maria', vendor_user_id: 3, body: 'Oldest', read_at: null, created_at: '2026-09-01T03:00:00Z', attachment: null }],
    }))
    const user = userEvent.setup()
    render(<StoreCommunications />)
    await user.click(await screen.findByRole('button', { name: /Antique Grocery/ }))

    expect(await screen.findByText(/Evaluator → Maria/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load earlier messages' }))
    expect(api.getConversation).toHaveBeenLastCalledWith(7, 50)
    expect(await screen.findByText('Oldest', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument()
  })

  it('keeps a just-sent message when an older poll response arrives afterwards', async () => {
    api.getConversation.mockResolvedValue(thread())
    api.sendStoreMessage.mockResolvedValue({ id: 99, sender_side: 'dti', sender_name: 'Evaluator', vendor_user_id: 3, body: 'Sent just now', read_at: null, created_at: '2026-09-28T04:00:00Z', attachment: null })
    const user = userEvent.setup()
    render(<StoreCommunications />)
    await user.click(await screen.findByRole('button', { name: /Antique Grocery/ }))
    await user.type(await screen.findByLabelText('Message'), 'Sent just now')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Sent just now', { selector: 'p' })).toBeInTheDocument()

    // A poll that started before the send returns the old page.
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(api.getConversation).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Supplier raised prices.', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Sent just now', { selector: 'p' })).toBeInTheDocument()
  })
})
