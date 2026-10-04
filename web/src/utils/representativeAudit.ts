export function representativeAuditDetails(metadata: Record<string, unknown>): string {
  const person = (value: unknown) => {
    const details = value as { name?: string; title?: string } | null
    return details?.name ? `${details.name} (${details.title ?? 'Role not recorded'})` : 'Not configured'
  }
  const store = typeof metadata.store_name === 'string' ? `${metadata.store_name}: ` : ''
  return `${store}${person(metadata.previous)} → ${person(metadata.current)}`
}
