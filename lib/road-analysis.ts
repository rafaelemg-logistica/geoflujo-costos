import type { RoadCategory, RoadFeature } from "./domain";

const cache = new Map<string, RoadFeature[]>();

export function classifyHighway(highway: string | undefined): RoadCategory {
  const value = (highway ?? "").toLowerCase();
  if (["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"].includes(value)) return "primary";
  if (["secondary", "secondary_link"].includes(value)) return "secondary";
  if (["tertiary", "tertiary_link"].includes(value)) return "tertiary";
  if (["unclassified", "residential", "living_street", "service", "services", "road"].includes(value)) return "local";
  if (["track", "byway"].includes(value)) return "rural";
  return "unclassified";
}

function sampleNodeIds(ids: number[], maximum = 100) {
  const unique = [...new Set(ids.filter(Number.isFinite))];
  if (unique.length <= maximum) return unique;
  const step = (unique.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => unique[Math.round(index * step)]);
}

export async function getRoadFeaturesForRoute(osmNodeIds: number[] | undefined): Promise<RoadFeature[]> {
  if (!osmNodeIds?.length) return [];
  const selected = sampleNodeIds(osmNodeIds);
  const key = selected.join(",");
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const query = `[out:json][timeout:20];node(id:${key});way(bn)["highway"];out tags geom;`;
    const endpoints = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
    let payload: { elements?: Array<{ id: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }> } | undefined;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "GeoFlujo-Region-Central/1.0" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(18000),
        });
        if (response.ok && response.headers.get("content-type")?.includes("json")) { payload = await response.json(); break; }
      } catch { /* intenta el siguiente servidor comunitario */ }
    }
    if (!payload) throw new Error("Overpass no disponible");
    const roads = (payload.elements ?? [])
      .filter((element) => Array.isArray(element.geometry) && element.geometry.length > 1)
      .map((element) => ({
        id: `osm-${element.id}`,
        highway: element.tags?.highway,
        roadClass: classifyHighway(element.tags?.highway),
        coordinates: element.geometry!.map((point) => [point.lat, point.lon] as [number, number]),
      } satisfies RoadFeature));
    if (roads.length) cache.set(key, roads);
    return roads;
  } catch {
    return [];
  }
}

export function clearRoadAnalysisCache() {
  cache.clear();
}
