import type { CurrentRepresentative } from '../../types/admin'

export function CurrentRepresentativeDetails({ representative }: { representative?: CurrentRepresentative | null }) {
  return <section className="current-representative-details" aria-label="Current establishment representative">
    <h3>Current establishment representative</h3>
    <p>{representative ? `${representative.name} · ${representative.title}` : 'Not configured. Monitoring visits use the registered owner when available.'}</p>
    {representative && <small>Updated {new Date(representative.updated_at).toLocaleString()}</small>}
  </section>
}
