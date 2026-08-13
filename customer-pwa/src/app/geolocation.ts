import { safeSessionStorage } from './safeStorage';

const GEO_CACHE_KEY = 'price_watch_geo_cache';
const GEO_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)}km away`;
}

export async function getCurrentPosition(): Promise<GeoPosition> {
  // Check session cache first
  const cached = safeSessionStorage.getItem(GEO_CACHE_KEY);
  if (cached) {
    try {
      const pos: GeoPosition = JSON.parse(cached);
      if (Date.now() - pos.timestamp < GEO_CACHE_DURATION_MS) return pos;
    } catch {
      // ignore parse error
    }
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geo: GeoPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now()
        };
        safeSessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
        resolve(geo);
      },
      (err) => {
        reject(new Error(
          err.code === 1
            ? 'Location access denied. Please enable location in your device settings to use the Nearby filter.'
            : 'Unable to determine your location. Please try again.'
        ));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}
