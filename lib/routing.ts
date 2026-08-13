import type { LogisticsNode, MetricMatrix, RouteMetric, ScenarioConfig } from "./domain";

const matrixCache = new Map<string, MetricMatrix>();
const routeCache = new Map<string, RouteMetric>();

export function haversineKm(a: Pick<LogisticsNode, "lat" | "lng">, b: Pick<LogisticsNode, "lat" | "lng">) {
  const radius = 6371.0088;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function matrixKey(nodes: LogisticsNode[]) {
  return nodes.map((node) => `${node.id}:${node.lat.toFixed(5)},${node.lng.toFixed(5)}`).join("|");
}

function estimateMatrix(nodes: LogisticsNode[], config: ScenarioConfig): MetricMatrix {
  return Object.fromEntries(nodes.map((from) => [from.id, Object.fromEntries(nodes.map((to) => {
    const distanceKm = from.id === to.id ? 0 : haversineKm(from, to) * config.fallbackDistanceFactor;
    return [to.id, { distanceKm, durationMin: config.fallbackSpeedKmh > 0 ? distanceKm / config.fallbackSpeedKmh * 60 : 0, source: "estimate" }];
  }))]));
}

export async function getMetricMatrix(nodes: LogisticsNode[], config: ScenarioConfig): Promise<MetricMatrix> {
  const key = matrixKey(nodes);
  const cached = matrixCache.get(key);
  if (cached) return cached;
  const estimated = estimateMatrix(nodes, config);
  if (nodes.length < 2) return estimated;
  try {
    const coordinates = nodes.map((node) => `${node.lng},${node.lat}`).join(";");
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance,duration`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("OSRM table unavailable");
    const payload = await response.json();
    if (payload.code !== "Ok" || !payload.distances || !payload.durations) throw new Error("OSRM table invalid");
    const matrix: MetricMatrix = {};
    nodes.forEach((from, i) => {
      matrix[from.id] = {};
      nodes.forEach((to, j) => {
        const distance = payload.distances[i]?.[j];
        const duration = payload.durations[i]?.[j];
        matrix[from.id][to.id] = distance == null || duration == null
          ? estimated[from.id][to.id]
          : { distanceKm: distance / 1000, durationMin: duration / 60, source: "osrm" };
      });
    });
    matrixCache.set(key, matrix);
    return matrix;
  } catch {
    matrixCache.set(key, estimated);
    return estimated;
  }
}

export async function getRoute(nodes: LogisticsNode[], config: ScenarioConfig): Promise<RouteMetric> {
  if (nodes.length < 2) throw new Error("Se requieren al menos dos puntos");
  const key = `${matrixKey(nodes)}|route`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  try {
    const coordinates = nodes.map((node) => `${node.lng},${node.lat}`).join(";");
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&annotations=nodes`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("OSRM route unavailable");
    const payload = await response.json();
    const best = payload.routes?.[0];
    if (!best) throw new Error("No route");
    const osmNodeIds = [...new Set<number>((best.legs ?? []).flatMap((leg: { annotation?: { nodes?: number[] } }) => leg.annotation?.nodes ?? []))];
    const result: RouteMetric = {
      fromId: nodes[0].id,
      toId: nodes[nodes.length - 1].id,
      distanceKm: best.distance / 1000,
      durationMin: best.duration / 60,
      coordinates: best.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      osmNodeIds,
      source: "osrm",
      confidence: "high",
    };
    routeCache.set(key, result);
    return result;
  } catch {
    let distanceKm = 0;
    for (let index = 1; index < nodes.length; index += 1) distanceKm += haversineKm(nodes[index - 1], nodes[index]) * config.fallbackDistanceFactor;
    const result: RouteMetric = {
      fromId: nodes[0].id,
      toId: nodes[nodes.length - 1].id,
      distanceKm,
      durationMin: config.fallbackSpeedKmh > 0 ? distanceKm / config.fallbackSpeedKmh * 60 : 0,
      coordinates: nodes.map((node) => [node.lat, node.lng]),
      source: "estimate",
      confidence: "estimated",
    };
    routeCache.set(key, result);
    return result;
  }
}

export function clearRoutingCache() {
  matrixCache.clear();
  routeCache.clear();
}
