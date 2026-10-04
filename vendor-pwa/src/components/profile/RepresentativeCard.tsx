import { useState } from 'react';
import { UserRound } from 'lucide-react';
import type { CurrentRepresentative, VendorStore } from '../../app/types';
import { formatDate } from '../../app/rules';
import { apiError } from '../../services/vendorApi';

export type SaveRepresentative = (storeId: number, details: Pick<CurrentRepresentative, 'name' | 'title'>) => Promise<void>;

export function RepresentativeCard({ store, onSave }: { store: VendorStore; onSave: SaveRepresentative }) {
  return <RepresentativeEditor key={store.id} store={store} onSave={onSave} />;
}

function RepresentativeEditor({ store, onSave }: { store: VendorStore; onSave: SaveRepresentative }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState<'Owner' | 'Manager'>('Owner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = store.current_representative;

  return <section className="profile-card" aria-labelledby="representative-title">
    <div className="profile-card-heading"><span><UserRound size={20} /></span><div>
      <h2 id="representative-title">Current establishment representative</h2>
      <p>Used to prefill monitoring visits. The field officer confirms who is present.</p>
    </div></div>
    <p>{store.store_name}</p>
    {editing ? <form className="profile-password-form" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      if (!name.trim() || name.trim().length > 255) return setError('Enter a full name of up to 255 characters.');
      if (!navigator.onLine) return setError('Connect to the internet to save the representative. Your entered details are kept.');
      setError(''); setSaving(true);
      try { await onSave(store.id, { name: name.trim(), title }); setEditing(false); }
      catch (reason) { setError(apiError(reason, 'The representative could not be saved. Check your connection and try again.')); }
      finally { setSaving(false); }
    }}>
      {error && <p role="alert" className="portal-error">{error}</p>}
      <div className="form-group"><label className="form-label" htmlFor="representative-name">Full name</label>
        <input id="representative-name" className="form-control" value={name} maxLength={255} required disabled={saving} onChange={(event) => setName(event.target.value)} /></div>
      <div className="form-group"><label className="form-label" htmlFor="representative-role">Role</label>
        <select id="representative-role" className="form-control" value={title} disabled={saving} onChange={(event) => setTitle(event.target.value as 'Owner' | 'Manager')}><option>Owner</option><option>Manager</option></select></div>
      <div className="representative-actions"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { setEditing(false); setError(''); }}>Cancel</button></div>
    </form> : <>
      <dl><div><dt>Full name</dt><dd>{current?.name ?? 'Not configured'}</dd></div><div><dt>Role</dt><dd>{current?.title ?? 'Not configured'}</dd></div><div><dt>Last updated</dt><dd>{current ? formatDate(current.updated_at, true) : 'Not yet updated'}</dd></div></dl>
      <button type="button" className="btn btn-secondary profile-card-action" onClick={() => { setName(current?.name ?? ''); setTitle(current?.title ?? 'Owner'); setEditing(true); }}>Change representative</button>
    </>}
  </section>;
}
