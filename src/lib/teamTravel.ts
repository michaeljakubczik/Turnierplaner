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

export type RoadDistances = { placesKey: string; km: Record<string, Record<string, number>> };
export type ManualDistances = Record<string,{placesKey:string;km:number}>;
export const travelPairKey = (a: {id:string},b:{id:string}) => JSON.stringify([a.id,b.id].sort());
export const travelPairPlacesKey = (a: {id:string;homePlace?:HomePlace},b:{id:string;homePlace?:HomePlace}) => JSON.stringify([a,b].sort((x,y)=>x.id.localeCompare(y.id)).map(t=>[t.id,t.homePlace?.latitude,t.homePlace?.longitude]));
export const manualKm = (a: TravelInput['teams'][number],b:TravelInput['teams'][number],input:TravelInput) => {const entry=input.manualDistances?.[travelPairKey(a,b)];return entry&&entry.placesKey===travelPairPlacesKey(a,b)?entry.km:null;};
export type TravelInput = { manualDistances?:ManualDistances; distanceMode?: 'air' | 'road'; roadDistances?: RoadDistances; teams: { id: string; homePlace?: HomePlace }[] };
export const roadPlacesKey = (teams: TravelInput['teams']) => JSON.stringify(teams.map(t=>[t.id,t.homePlace?.longitude,t.homePlace?.latitude]));
export function journeyKm(from: TravelInput['teams'][number], to: TravelInput['teams'][number], input: TravelInput): number | null {
  if(from.id===to.id)return 0;
  const manual=manualKm(from,to,input);if(manual!==null)return manual;
  if(input.distanceMode==='road')return input.roadDistances?.placesKey===roadPlacesKey(input.teams) ? input.roadDistances.km[from.id]?.[to.id] ?? null : null;
  return from.homePlace&&to.homePlace?distanceKm(from.homePlace,to.homePlace):null;
}
// Called only after the user explicitly chooses to send home-place coordinates to FOSSGIS.
export async function fetchRoadDistances(teams: TravelInput['teams'], signal: AbortSignal): Promise<RoadDistances> {
  if(teams.length>25)throw new Error('Straßenabfrage unterstützt höchstens 25 Teams. Für größere Projekte bitte Luftlinie verwenden.');
  if(teams.some(t=>!t.homePlace))throw new Error('Bitte zuerst alle Heimspielorte bestätigen.');
  const coordinates=teams.map(t=>`${t.homePlace!.longitude},${t.homePlace!.latitude}`).join(';');
  const response=await fetch(`https://routing.openstreetmap.de/routed-car/table/v1/driving/${coordinates}?annotations=distance`,{signal});
  if(!response.ok)throw new Error('Straßenentfernungen konnten nicht abgerufen werden. Bitte erneut versuchen oder Luftlinie auswählen.');
  const data=await response.json();
  if(data.code!=='Ok'||!Array.isArray(data.distances)||data.distances.length!==teams.length||data.distances.some((row:unknown)=>!Array.isArray(row)||row.length!==teams.length||row.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)))throw new Error('Keine vollständigen Straßenentfernungen verfügbar. Bitte Luftlinie wählen oder Orte prüfen.');
  return {placesKey:roadPlacesKey(teams),km:Object.fromEntries(teams.map((t,i)=>[t.id,Object.fromEntries(teams.map((other,j)=>[other.id,data.distances[i][j]/1000]))]))};
}
