import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  MailPlus,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Store,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { VendorInvitationDeliveryStatus } from '../../services/adminApi'
import type { ManagedUserPage, ManagedUserRecord, ManagedUserRole, StoreRecord, VendorInvitationRecord } from '../../types/admin'
import { adminToast } from '../../services/adminToast'
import { VendorInviteForm } from './VendorInviteForm'

// Fallback only (the Admin shell passes renderRegistration); lazy so leaflet stays out of this chunk.
const StoreOnboarding = lazy(() => import('../StoreOnboarding').then((module) => ({ default: module.StoreOnboarding })))

const STORE_PLACEHOLDER_IMAGE = '/stores/store.webp'

type ManagementView = 'list' | 'vendor' | 'field-officer'
type RoleFilter = 'all' | ManagedUserRole
type StatusFilter = 'all' | 'active' | 'inactive'

export type VendorRegistrationRenderer = (controls: { onBack: () => void; onCreated: (store: StoreRecord) => void }) => ReactNode

const emptyPage: ManagedUserPage = {
  records: [],
  pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null },
  counts: { total: 0, field_officer: 0, vendor: 0, inactive: 0 },
}

const fieldPwaUrl = (import.meta.env.VITE_FIELD_PWA_URL as string | undefined)?.trim()
const vendorPwaUrl = (import.meta.env.VITE_VENDOR_PWA_URL as string | undefined)?.trim()

function errorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response
  const fieldError = response?.data?.errors && Object.values(response.data.errors).flat()[0]
  return fieldError || response?.data?.message || fallback
}

export function UserManagementPanel({ vendorRegistration }: { vendorRegistration?: VendorRegistrationRenderer }) {
  const initialView = new URLSearchParams(window.location.search).get('view')
  const [view, setView] = useState<ManagementView>(initialView === 'create-field-officer' ? 'field-officer' : initialView === 'register-vendor' ? 'vendor' : 'list')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(emptyPage)
  const [pageNumber, setPageNumber] = useState(1)
  const [perPage, setPerPage] = useState<10 | 25 | 50>(10)
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openActions, setOpenActions] = useState<number | null>(null)
  const [editing, setEditing] = useState<ManagedUserRecord | null>(null)
  const [resetting, setResetting] = useState<ManagedUserRecord | null>(null)
  const [deactivating, setDeactivating] = useState<ManagedUserRecord | null>(null)
  const [unlinking, setUnlinking] = useState<{ account: ManagedUserRecord; store: { id: number; store_name: string } } | null>(null)
  const [handoff, setHandoff] = useState<{ account: ManagedUserRecord; temporaryPassword: string } | null>(null)
  const [vendorHandoff, setVendorHandoff] = useState<{ storeName: string; email: string; invitationUrl: string; deliveryStatus: VendorInvitationDeliveryStatus } | null>(null)
  const [invitations, setInvitations] = useState<VendorInvitationRecord[]>([])
  const [invitationsError, setInvitationsError] = useState('')

  const changeView = (next: ManagementView) => {
    setView(next)
    setOpenActions(null)
    setShowAddMenu(false)
    const url = new URL(window.location.href)
    if (next === 'field-officer') url.searchParams.set('view', 'create-field-officer')
    else if (next === 'vendor') url.searchParams.set('view', 'register-vendor')
    else url.searchParams.delete('view')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPageNumber(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!showAddMenu) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAddMenu])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setPage(await adminApi.getManagedUsers({ search: debouncedSearch || undefined, role, status, page: pageNumber, per_page: perPage }))
    } catch (requestError) {
      setError(errorMessage(requestError, 'User accounts could not load. Try again.'))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, role, status, pageNumber, perPage])

  const loadInvitations = useCallback(async () => {
    try {
      setInvitations(await adminApi.getVendorInvitations())
      setInvitationsError('')
    } catch (requestError) {
      // Keep rows already shown: a failed load must not look like "no pending invitations".
      setInvitationsError(errorMessage(requestError, 'Pending vendor invitations could not load.'))
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])
  useEffect(() => { if (view === 'list') void loadInvitations() }, [view, loadInvitations])

  if (view === 'vendor') {
    return (
      <VendorOnboarding
        renderRegistration={vendorRegistration}
        onBack={() => changeView('list')}
        onInvited={(store, email, invitationUrl, deliveryStatus) => {
          setVendorHandoff({ storeName: store.store_name, email, invitationUrl, deliveryStatus })
          changeView('list')
        }}
      />
    )
  }

  if (view === 'field-officer') {
    return <CreateFieldOfficer onBack={() => changeView('list')} onCreated={(account, temporaryPassword) => {
      setHandoff({ account, temporaryPassword })
      setRole('all')
      setStatus('all')
      setPageNumber(1)
      changeView('list')
      void loadUsers()
    }} />
  }

  const roleTabs: Array<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'All users' },
    { value: 'field_officer', label: 'DTI Field Monitoring' },
    { value: 'vendor', label: 'Vendors' },
  ]

  return (
    <div className="user-management-workspace">
      <section className="user-account-summary" aria-label="User account summary">
        <AccountCount label="Managed users" value={page.counts.total} icon={<Users size={19} />} />
        <AccountCount label="Field officers" value={page.counts.field_officer} icon={<ShieldCheck size={19} />} />
        <AccountCount label="Vendors" value={page.counts.vendor} icon={<Store size={19} />} />
        <AccountCount label="Inactive" value={page.counts.inactive} icon={<UserRoundCheck size={19} />} />
      </section>

      <section className="user-management-command" aria-label="User management controls">
        <div className="admin-search-field">
          <Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Search user accounts" placeholder="Search name, email, or establishment" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="admin-view-tabs user-role-tabs" aria-label="Filter users by account type">
          {roleTabs.map((tab) => (
            <button key={tab.value} type="button" className={role === tab.value ? 'active' : ''} onClick={() => { setRole(tab.value); setPageNumber(1) }}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="user-status-filter">
          <select aria-label="Filter users by status" value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setPageNumber(1) }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="user-add-wrapper" ref={addMenuRef}>
          <button
            type="button"
            className="admin-button primary user-add-desktop user-add-button"
            aria-expanded={showAddMenu}
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Plus size={17} aria-hidden="true" />
            <span>Add user</span>
            <ChevronDown size={15} className={`user-add-chevron ${showAddMenu ? 'open' : ''}`} aria-hidden="true" />
          </button>
          {showAddMenu && (
            <div className="user-add-dropdown" aria-label="Add user options">
              <button
                type="button"
                className="user-add-dropdown-item"
                onClick={() => changeView('vendor')}
              >
                <span className="user-add-dropdown-icon vendor">
                  <Store size={18} />
                </span>
                <span className="user-add-dropdown-text">
                  <strong>Vendor account</strong>
                  <small>Choose or register an establishment, then invite its vendor</small>
                </span>
                <ChevronRight size={16} className="user-add-dropdown-arrow" aria-hidden="true" />
              </button>

              <div className="user-add-dropdown-divider" />

              <button
                type="button"
                className="user-add-dropdown-item"
                onClick={() => changeView('field-officer')}
              >
                <span className="user-add-dropdown-icon officer">
                  <ShieldCheck size={18} />
                </span>
                <span className="user-add-dropdown-text">
                  <strong>DTI Field Monitoring account</strong>
                  <small>Create mobile field officer credentials</small>
                </span>
                <ChevronRight size={16} className="user-add-dropdown-arrow" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>

      {error && <div className="admin-feedback error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadUsers()}>Retry</button></div>}
      {role !== 'field_officer' && invitationsError && <div className="admin-feedback error" role="alert"><span>{invitationsError}</span><button type="button" onClick={() => void loadInvitations()}>Retry invitations</button></div>}

      {role !== 'field_officer' && invitations.length > 0 && (
        <PendingInvitations
          invitations={invitations}
          onResent={(invitation, invitationUrl, deliveryStatus) => {
            setVendorHandoff({ storeName: invitation.store?.store_name ?? 'Establishment', email: invitation.email, invitationUrl, deliveryStatus })
            void loadInvitations()
          }}
          onChanged={() => void loadInvitations()}
        />
      )}

      <section className="admin-table-card user-table-card">
        <div className="admin-table-wrap">
          <table className="admin-data-table user-management-table">
            <caption className="sr-only">Managed user accounts</caption>
            <thead><tr><th>User</th><th>Account type</th><th>Assignment</th><th>Status</th><th>Date added</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }, (_, index) => <tr className="admin-skeleton-row" key={index}><td colSpan={6}><span /></td></tr>) : page.records.map((account) => (
                <tr key={account.id}>
                  <td data-label="User"><div className="user-identity-cell"><span className="user-initials" aria-hidden="true">{account.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></div></td>
                  <td data-label="Account type"><span className={`user-role-badge ${account.role}`}>{account.role === 'field_officer' ? 'DTI Field Monitoring' : 'Vendor'}</span></td>
                  <td data-label="Assignment"><strong>{account.role === 'field_officer' ? 'Field Monitoring' : account.stores.map((store) => store.store_name).join(', ') || 'No linked establishment'}</strong><small>{account.role === 'field_officer' ? 'Mobile regulatory access' : `${account.stores.length} linked establishment${account.stores.length === 1 ? '' : 's'}`}</small></td>
                  <td data-label="Status"><span className={`admin-status-badge ${account.is_active ? 'current' : 'history'}`}>{account.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td data-label="Date added">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(account.created_at))}</td>
                  <td data-label="Actions" className="user-actions-cell">
                    <button type="button" className="admin-icon-button" aria-label={`Actions for ${account.name}`} onClick={() => setOpenActions(openActions === account.id ? null : account.id)}><MoreHorizontal size={18} /></button>
                    {openActions === account.id && <div className="user-row-menu">
                      <button type="button" onClick={() => { setEditing(account); setOpenActions(null) }}>Edit account</button>
                      <button type="button" onClick={() => { setResetting(account); setOpenActions(null) }}>Set new password</button>
                      {account.role === 'vendor' && account.stores.map((store) => (
                        <button type="button" key={store.id} onClick={() => { setUnlinking({ account, store }); setOpenActions(null) }}>Unlink {store.store_name}</button>
                      ))}
                      <button type="button" onClick={() => { if (account.is_active) setDeactivating(account); else void toggleAccount(account); setOpenActions(null) }}>{account.is_active ? 'Deactivate account' : 'Reactivate account'}</button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && page.records.length === 0 && <div className="admin-empty-state"><Users size={28} /><strong>No matching users</strong><span>Adjust the search or filters, or add the first account.</span></div>}
        </div>
        <Pagination page={page} perPage={perPage} onPerPage={(value) => { setPerPage(value); setPageNumber(1) }} onPage={setPageNumber} />
      </section>

      <button type="button" className="user-add-fab" aria-label="Add user (mobile)" onClick={() => setShowAddMenu(!showAddMenu)}><Plus size={24} /></button>

      {editing && <EditUserDialog account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); adminToast.success('Account details updated.', { id: 'managed-user-updated' }); void loadUsers() }} />}
      {resetting && <PasswordDialog account={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); adminToast.success('Password updated and active sessions revoked.', { id: 'managed-user-password' }) }} />}
      {deactivating && <ConfirmDialog title="Deactivate account?" message={`${deactivating.name} will be signed out and unable to log in until reactivated.`} confirmLabel="Confirm deactivation" onClose={() => setDeactivating(null)} onConfirm={async () => { await toggleAccount(deactivating); setDeactivating(null) }} />}
      {unlinking && <ConfirmDialog title="Unlink establishment?" message={`${unlinking.account.name} will lose Vendor Portal access to ${unlinking.store.store_name} and its notices. Pending invitations for this establishment are cancelled.`} confirmLabel="Confirm unlink" onClose={() => setUnlinking(null)} onConfirm={async () => { await unlinkStore(unlinking.store); setUnlinking(null) }} />}
      {handoff && <FieldOfficerHandoff account={handoff.account} temporaryPassword={handoff.temporaryPassword} onClose={() => setHandoff(null)} />}
      {vendorHandoff && <VendorInvitationHandoff {...vendorHandoff} onClose={() => { setVendorHandoff(null); void loadInvitations() }} />}
    </div>
  )

  async function toggleAccount(account: ManagedUserRecord) {
    try {
      await adminApi.updateManagedUser(account.id, { is_active: !account.is_active })
      adminToast.success(account.is_active ? `${account.name} was deactivated.` : `${account.name} was reactivated.`, { id: `managed-user-status-${account.id}` })
      await loadUsers()
    } catch (requestError) {
      adminToast.error(errorMessage(requestError, 'The account status could not be changed. Confirm your Admin password and try again.'), { id: `managed-user-status-error-${account.id}` })
    }
  }

  async function unlinkStore(store: { id: number; store_name: string }) {
    try {
      await adminApi.unlinkStoreVendor(store.id)
      adminToast.success(`${store.store_name} was unlinked.`, { id: `store-unlinked-${store.id}` })
      await Promise.all([loadUsers(), loadInvitations()])
    } catch (requestError) {
      adminToast.error(errorMessage(requestError, 'The establishment could not be unlinked. Confirm your Admin password and try again.'), { id: `store-unlink-error-${store.id}` })
    }
  }
}

function VendorOnboarding({ renderRegistration, onBack, onInvited }: {
  renderRegistration?: VendorRegistrationRenderer
  onBack: () => void
  onInvited: (store: StoreRecord, email: string, invitationUrl: string, deliveryStatus: VendorInvitationDeliveryStatus) => void
}) {
  const [registering, setRegistering] = useState(false)
  const [stores, setStores] = useState<StoreRecord[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StoreRecord | null>(null)

  useEffect(() => {
    // Merge so a store registered while this load was in flight stays first (and inside the 50-row cap).
    adminApi.getStores().then((loaded) => setStores((current) => current ? [...current, ...loaded.filter((store) => !current.some((local) => local.id === store.id))] : loaded)).catch((requestError) => setLoadError(errorMessage(requestError, 'Establishments could not load. Try again.')))
  }, [])

  const unlinked = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (stores ?? [])
      .filter((store) => !store.vendor_user_id)
      .filter((store) => !term || store.store_name.toLowerCase().includes(term) || store.address.toLowerCase().includes(term))
      .slice(0, 50)
  }, [stores, query])

  if (registering) {
    const controls = {
      onBack: () => setRegistering(false),
      onCreated: (store: StoreRecord) => { setStores((current) => [store, ...(current ?? [])]); setQuery(''); setSelected(store); setRegistering(false) },
    }
    return <div className="user-management-workspace">{renderRegistration ? renderRegistration(controls) : <Suspense fallback={null}><StoreOnboarding {...controls} /></Suspense>}</div>
  }

  return (
    <div className="user-management-workspace vendor-onboarding">
      <header className="admin-form-header-bar">
        <button type="button" className="admin-header-back-button" aria-label="Back to User Management" title="Back to User Management" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <h2 className="admin-form-page-title">Invite vendor account</h2>
      </header>

      <section className="field-officer-create-card vendor-onboarding-card">
        <div className="field-officer-card-body">
          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon"><Store size={22} /></div>
              <div>
                <h3>1. Establishment</h3>
                <p>Vendors are linked to one establishment at a time. Only establishments without a linked vendor appear.</p>
              </div>
            </div>
            <div className="field-officer-fields">
              <div className="admin-search-field">
                <Search size={17} aria-hidden="true" />
                <input type="search" aria-label="Search establishments" placeholder="Search establishment name or address" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              {loadError && <p role="alert" className="admin-feedback error">{loadError}</p>}
              {stores === null && !loadError && <p role="status">Loading establishments…</p>}
              {stores !== null && (
                <fieldset className="vendor-store-options">
                  <legend className="sr-only">Establishment to invite a vendor for</legend>
                  {unlinked.map((store) => (
                    <label key={store.id} className={selected?.id === store.id ? 'selected' : ''}>
                      <input type="radio" name="vendor-store" checked={selected?.id === store.id} onChange={() => setSelected(store)} />
                      <img
                        className="vendor-store-thumb"
                        src={store.image_path || STORE_PLACEHOLDER_IMAGE}
                        alt=""
                        loading="lazy"
                        onError={(event) => { if (event.currentTarget.getAttribute('src') !== STORE_PLACEHOLDER_IMAGE) event.currentTarget.src = STORE_PLACEHOLDER_IMAGE }}
                      />
                      <span><strong>{store.store_name}</strong><small>{store.address}</small></span>
                    </label>
                  ))}
                  {unlinked.length === 0 && <p className="field-helper-text">No unlinked establishment matches. Register a new one below.</p>}
                </fieldset>
              )}
              <button type="button" className="admin-button secondary" onClick={() => setRegistering(true)}><Plus size={16} />Register new establishment</button>
            </div>
          </div>

          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon"><MailPlus size={22} /></div>
              <div>
                <h3>2. Invitation</h3>
                <p>{selected ? `Invite the vendor for ${selected.store_name}.` : 'Choose an establishment first.'}</p>
              </div>
            </div>
            <div className="field-officer-fields">
              {selected
                ? <VendorInviteForm key={selected.id} store={selected} onCancel={() => setSelected(null)} onInvited={(url, email, deliveryStatus) => onInvited(selected, email, url, deliveryStatus)} />
                : <p className="field-helper-text">The invitation link opens the Vendor Portal, where the vendor sets their own password.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function PendingInvitations({ invitations, onResent, onChanged }: {
  invitations: VendorInvitationRecord[]
  onResent: (invitation: VendorInvitationRecord, invitationUrl: string, deliveryStatus: VendorInvitationDeliveryStatus) => void
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const formatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

  const resend = async (invitation: VendorInvitationRecord) => {
    if (!invitation.store) return
    setBusyId(invitation.id)
    try {
      const result = await adminApi.inviteVendor(invitation.store.id, invitation.email)
      onResent(invitation, result.invitation_url, result.delivery_status)
    } catch (requestError) {
      adminToast.error(errorMessage(requestError, 'A new invitation could not be created.'), { id: `invitation-resend-${invitation.id}` })
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (invitation: VendorInvitationRecord) => {
    setBusyId(invitation.id)
    try {
      await adminApi.cancelVendorInvitation(invitation.id)
      adminToast.success(`Invitation for ${invitation.email} was cancelled.`, { id: `invitation-cancel-${invitation.id}` })
    } catch (requestError) {
      adminToast.error(errorMessage(requestError, 'The invitation could not be cancelled.'), { id: `invitation-cancel-error-${invitation.id}` })
    } finally {
      setBusyId(null)
      onChanged()
    }
  }

  return (
    <section className="admin-table-card vendor-invitations-card" aria-labelledby="pending-vendor-invitations-title">
      <header className="vendor-invitations-header">
        <h3 id="pending-vendor-invitations-title">Pending vendor invitations</h3>
        <small>Vendors appear in the table after accepting.</small>
      </header>
      <div className="admin-table-wrap">
        <table className="admin-data-table">
          <thead><tr><th>Email</th><th>Establishment</th><th>Expires</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td data-label="Email">{invitation.email}</td>
                <td data-label="Establishment">{invitation.store?.store_name ?? 'Establishment removed'}</td>
                <td data-label="Expires">{invitation.is_expired ? <span className="admin-status-badge history">Expired</span> : formatter.format(new Date(invitation.expires_at))}</td>
                <td data-label="Actions" className="vendor-invitation-actions">
                  <button type="button" className="admin-button secondary" disabled={busyId === invitation.id || !invitation.store} onClick={() => void resend(invitation)} aria-label={`Resend invitation to ${invitation.email}`}>Resend</button>
                  <button type="button" className="admin-button secondary" disabled={busyId === invitation.id} onClick={() => void cancel(invitation)} aria-label={`Cancel invitation to ${invitation.email}`}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function VendorInvitationHandoff({ storeName, email, invitationUrl, deliveryStatus, onClose }: { storeName: string; email: string; invitationUrl: string; deliveryStatus: VendorInvitationDeliveryStatus; onClose: () => void }) {
  const copy = (value: string) => void navigator.clipboard?.writeText(value)
  return <div className="admin-modal-backdrop"><section className="admin-modal field-officer-handoff" role="dialog" aria-modal="true" aria-labelledby="vendor-invitation-handoff-title"><header><div><h2 id="vendor-invitation-handoff-title">Vendor invitation created</h2><p>{deliveryStatus === 'queued' ? 'Email accepted by the queue; delivery is not confirmed.' : 'Email could not be queued.'} Copy the link to share it securely if needed. It works once and expires in 24 hours.</p></div><button type="button" className="admin-icon-button" aria-label="Close invitation handoff" onClick={onClose}><X size={18} /></button></header><div className="handoff-person"><Store size={20} /><span><strong>{storeName}</strong><small>{email}</small></span></div><dl><div><dt>Invitation link</dt><dd><code>{invitationUrl}</code><button type="button" aria-label="Copy vendor invitation link" onClick={() => copy(invitationUrl)}><Copy size={16} />Copy</button></dd></div>{vendorPwaUrl && <div><dt>Vendor Portal</dt><dd><span>{vendorPwaUrl}</span><button type="button" aria-label="Copy Vendor Portal link" onClick={() => copy(vendorPwaUrl)}><Copy size={16} />Copy</button></dd></div>}</dl><div className="handoff-warning"><KeyRound size={18} /><span><strong>The vendor sets their own password</strong><small>DTI never sees it. Resending cancels this link and issues a new one.</small></span></div><footer><button type="button" className="admin-button primary" onClick={onClose}>Done</button></footer></section></div>
}

function AccountCount({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="user-account-count"><span className="user-account-count-icon">{icon}</span><span><strong>{value}</strong><small>{label}</small></span></div>
}

function CreateFieldOfficer({ onBack, onCreated }: { onBack: () => void; onCreated: (account: ManagedUserRecord, temporaryPassword: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 12 || password !== confirmation) {
      setError(password.length < 12 ? 'Password must contain at least 12 characters.' : 'Password confirmation does not match.')
      return
    }
    setSubmitting(true); setError('')
    try {
      const created = await adminApi.createFieldOfficer({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        password_confirmation: confirmation,
        is_active: true,
      })
      onCreated(created, password)
    } catch (requestError) {
      setError(errorMessage(requestError, 'The field officer account could not be created.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="field-officer-create-page">
      <header className="admin-form-header-bar">
        <button
          type="button"
          className="admin-header-back-button"
          aria-label="Back to User Management"
          title="Back to User Management"
          onClick={onBack}
        >
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <h2 className="admin-form-page-title">Create field monitoring officer</h2>
      </header>

      <form className="field-officer-create-card" onSubmit={submit}>
        <div className="field-officer-card-body">
          {/* Left Column: Identity */}
          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon"><Users size={22} /></div>
              <div>
                <h3>Officer identity</h3>
                <p>Official profile details and authorized DTI email address</p>
              </div>
            </div>
            <div className="field-officer-fields">
              <div className="admin-field-group">
                <label htmlFor="field-officer-fullname" className="required-field">
                  Full name
                </label>
                <input
                  id="field-officer-fullname"
                  required
                  autoFocus
                  autoComplete="name"
                  placeholder="e.g. Juan Dela Cruz"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="admin-field-group">
                <label htmlFor="field-officer-email" className="required-field">
                  DTI email address
                </label>
                <input
                  id="field-officer-email"
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. officer@dti.gov.ph"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <small className="field-helper-text">Official government-issued @dti.gov.ph address.</small>
              </div>
            </div>
          </div>

          {/* Right Column: Credentials */}
          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon"><KeyRound size={22} /></div>
              <div>
                <h3>Admin-issued login credentials</h3>
                <p>Final account password for the first online sign-in</p>
              </div>
            </div>
            <div className="field-officer-fields">
              <div className="admin-field-group">
                <label htmlFor="field-officer-password" className="required-field">
                  Password
                </label>
                <span className="password-field">
                  <input
                    id="field-officer-password"
                    required
                    type={visible ? 'text' : 'password'}
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <small className="field-helper-text">At least 12 characters. Replaced upon first sign-in.</small>
              </div>
              <div className="admin-field-group">
                <label htmlFor="field-officer-confirm" className="required-field">
                  Confirm password
                </label>
                <span className="password-field">
                  <input
                    id="field-officer-confirm"
                    required
                    type={visible ? 'text' : 'password'}
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <small className="field-helper-text">Must match the password entered above.</small>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="admin-feedback error" role="alert">{error}</p>}

        <footer className="field-officer-card-footer">
          <div className="field-officer-card-notice">
            <ShieldCheck size={18} />
            <span>Account activates immediately with full cryptographic offline vault access.</span>
          </div>
          <div className="field-officer-card-actions">
            <button type="button" className="admin-button secondary" onClick={onBack}>
              Cancel
            </button>
            <button type="submit" className="admin-button primary" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create field officer'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

function FieldOfficerHandoff({ account, temporaryPassword, onClose }: { account: ManagedUserRecord; temporaryPassword: string; onClose: () => void }) {
  const copy = (value: string) => void navigator.clipboard?.writeText(value)
  return <div className="admin-modal-backdrop"><section className="admin-modal field-officer-handoff" role="dialog" aria-modal="true" aria-labelledby="field-officer-handoff-title"><header><div><h2 id="field-officer-handoff-title">Field officer access is ready</h2><p>Copy these details now. This password is not stored for later display.</p></div><button type="button" className="admin-icon-button" aria-label="Close access handoff" onClick={onClose}><X size={18} /></button></header><div className="handoff-person"><ShieldCheck size={20} /><span><strong>{account.name}</strong><small>Active Field Monitoring account</small></span></div><dl><div><dt>Email</dt><dd><span>{account.email}</span><button type="button" aria-label="Copy officer email" onClick={() => copy(account.email)}><Copy size={16} />Copy</button></dd></div><div><dt>Admin-issued password</dt><dd><code>{temporaryPassword}</code><button type="button" aria-label="Copy Admin-issued password" onClick={() => copy(temporaryPassword)}><Copy size={16} />Copy</button></dd></div>{fieldPwaUrl && <div><dt>Application</dt><dd><span>{fieldPwaUrl}</span><button type="button" aria-label="Copy Field Monitoring PWA link" onClick={() => copy(fieldPwaUrl)}><Copy size={16} />Copy</button></dd></div>}</dl><div className="handoff-warning"><KeyRound size={18} /><span><strong>First sign-in must be online</strong><small>This password remains the officer's account credential. After sign-in, the officer creates a four-digit device PIN and may enable biometric unlock.</small></span></div>{!fieldPwaUrl && <p role="alert">Field Monitoring PWA address is not configured. Add VITE_FIELD_PWA_URL before sharing an application link.</p>}<footer><button type="button" className="admin-button secondary" onClick={onClose}>Done</button>{fieldPwaUrl && <a className="admin-button primary" href={fieldPwaUrl} target="_blank" rel="noreferrer">Open Field Monitoring PWA<ExternalLink size={16} /></a>}</footer></section></div>
}

function Pagination({ page, perPage, onPerPage, onPage }: { page: ManagedUserPage; perPage: 10 | 25 | 50; onPerPage: (value: 10 | 25 | 50) => void; onPage: (value: number) => void }) {
  const pages = useMemo(() => {
    const start = Math.max(1, Math.min(page.pagination.current_page - 2, page.pagination.last_page - 4))
    return Array.from({ length: Math.min(5, page.pagination.last_page) }, (_, index) => start + index)
  }, [page.pagination.current_page, page.pagination.last_page])
  return <nav className="admin-pagination user-pagination" aria-label="User pagination"><span>Showing <strong>{page.pagination.from ?? 0}–{page.pagination.to ?? 0}</strong> of <strong>{page.pagination.total}</strong></span><div><label>Rows per page<select value={perPage} onChange={(event) => onPerPage(Number(event.target.value) as 10 | 25 | 50)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button type="button" aria-label="Previous page" disabled={page.pagination.current_page <= 1} onClick={() => onPage(page.pagination.current_page - 1)}><ChevronLeft size={16} /></button>{pages.map((number) => <button type="button" key={number} className={number === page.pagination.current_page ? 'active' : ''} aria-current={number === page.pagination.current_page ? 'page' : undefined} onClick={() => onPage(number)}>{number}</button>)}<button type="button" aria-label="Next page" disabled={page.pagination.current_page >= page.pagination.last_page} onClick={() => onPage(page.pagination.current_page + 1)}><ChevronRight size={16} /></button></div></nav>
}

function EditUserDialog({ account, onClose, onSaved }: { account: ManagedUserRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(account.name); const [email, setEmail] = useState(account.email); const [error, setError] = useState('')
  return <div className="admin-modal-backdrop"><form className="admin-modal user-action-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" onSubmit={async (event) => { event.preventDefault(); try { await adminApi.updateManagedUser(account.id, { name: name.trim(), email: email.trim().toLowerCase() }); onSaved() } catch (requestError) { setError(errorMessage(requestError, 'Account details could not be updated.')) } }}><header><h2 id="edit-user-title">Edit account</h2></header><label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error && <p role="alert" className="admin-feedback error">{error}</p>}<footer><button type="button" className="admin-button secondary" onClick={onClose}>Cancel</button><button type="submit" className="admin-button primary">Save changes</button></footer></form></div>
}

function PasswordDialog({ account, onClose, onSaved }: { account: ManagedUserRecord; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [error, setError] = useState('')
  return <div className="admin-modal-backdrop"><form className="admin-modal user-action-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-user-title" onSubmit={async (event) => { event.preventDefault(); if (password.length < 12 || password !== confirmation) { setError(password.length < 12 ? 'Password must contain at least 12 characters.' : 'Password confirmation does not match.'); return } try { await adminApi.resetManagedUserPassword(account.id, { password, password_confirmation: confirmation }); onSaved() } catch (requestError) { setError(errorMessage(requestError, 'Password could not be updated. Confirm your Admin password and try again.')) } }}><header><h2 id="reset-user-title">Set a new password</h2><p>This signs {account.name} out of every active session.</p></header><label>New password<input required type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input required type="password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <p role="alert" className="admin-feedback error">{error}</p>}<footer><button type="button" className="admin-button secondary" onClick={onClose}>Cancel</button><button type="submit" className="admin-button primary">Update password</button></footer></form></div>
}

function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return <div className="admin-modal-backdrop"><section className="admin-modal user-action-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-user-action-title"><header><h2 id="confirm-user-action-title">{title}</h2><p>{message}</p></header><footer><button type="button" className="admin-button secondary" onClick={onClose}>Cancel</button><button type="button" className="admin-button danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false) }}>{busy ? 'Updating…' : confirmLabel}</button></footer></section></div>
}
