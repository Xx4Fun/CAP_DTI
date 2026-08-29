import type { StoreRecord } from '../../types/admin'

export function getStoreStatusInfo(store: StoreRecord): {
  status: 'green' | 'yellow' | 'red'
  label: string
  bg: string
  color: string
  border: string
} {
  const recidivism = store.recidivism_index || 0
  if (recidivism > 0 || !store.is_active) {
    return {
      status: 'red',
      label: recidivism > 0 ? `${recidivism} Confirmed Finding${recidivism > 1 ? 's' : ''}` : 'Account Inactive',
      bg: '#fef2f2', color: '#dc2626', border: '#fecaca',
    }
  }
  if (!store.is_verified) {
    return { status: 'yellow', label: 'Verification Pending', bg: '#fffbeb', color: '#d97706', border: '#fde68a' }
  }
  return { status: 'green', label: 'No Confirmed Findings', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' }
}

export function buildStorePopupContent(
  store: StoreRecord,
  statusInfo: ReturnType<typeof getStoreStatusInfo>,
  latitude: number,
  longitude: number,
): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'leaflet-store-popup'
  const title = document.createElement('h4')
  title.textContent = store.store_name
  container.appendChild(title)
  const registration = document.createElement('p')
  const registrationLabel = document.createElement('strong')
  registrationLabel.textContent = 'SEC #: '
  registration.append(registrationLabel, document.createTextNode(store.dti_sec_number || 'N/A'))
  container.appendChild(registration)
  const status = document.createElement('span')
  status.className = `leaflet-store-status status-${statusInfo.status}`
  status.textContent = statusInfo.label
  container.appendChild(status)
  const coordinates = document.createElement('p')
  coordinates.className = 'leaflet-store-coordinates'
  coordinates.textContent = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`
  container.appendChild(coordinates)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'leaflet-open-info-btn'
  button.dataset.storeId = String(store.id)
  button.textContent = 'Open Store Info'
  container.appendChild(button)
  return container
}
