export type HomePlace = { label: string; latitude: number; longitude: number };

// Distances stay on the device: no coordinates are sent to a routing service.
export const distanceKm = (from: HomePlace, to: HomePlace) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(to.latitude - from.latitude) / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
};

export const hasLongJourney = (from: HomePlace, to: HomePlace) => distanceKm(from, to) > 100;

export async function findHomePlaces(query: string, signal: AbortSignal): Promise<HomePlace[]> {
  const params = new URLSearchParams({ q: query, lang: 'de', limit: '5' });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!response.ok) throw new Error('Die Ortssuche ist gerade nicht erreichbar. Bitte erneut versuchen.');
  const data = await response.json();
  const places: HomePlace[] = [];
  for (const feature of data.features || []) {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const p = feature.properties || {};
    const label = [...new Set([p.name, p.street, p.housenumber, p.postcode, p.city, p.state, p.country].filter(Boolean))].join(', ');
    if (label && !places.some(place => place.label === label)) places.push({ label, latitude, longitude });
  }
  return places;
}
