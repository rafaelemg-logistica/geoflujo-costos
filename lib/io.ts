import { DEFAULT_CONFIG, DEFAULT_VEHICLES, type LogisticsNode, type NodeRole, type OptimizationResult, type RoadCategory, type RoadFeature, type Scenario, type TollFeature } from "./domain";
import { classifyHighway } from "./road-analysis";

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown) {
  return ["1", "true", "si", "sí", "yes", "x"].includes(String(value ?? "").trim().toLowerCase());
}

function roadCategory(value: unknown): RoadCategory {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["primary", "principal", "primaria", "1"].includes(normalized)) return "primary";
  if (["secondary", "secundaria", "2"].includes(normalized)) return "secondary";
  if (["tertiary", "terciaria", "3"].includes(normalized)) return "tertiary";
  if (["local", "4"].includes(normalized)) return "local";
  if (["rural", "rural_baja", "5"].includes(normalized)) return "rural";
  return classifyHighway(normalized);
}

export function parseNodesCsv(text: string): LogisticsNode[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("El CSV no contiene filas de datos");
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value])));
  const nodes = rows.map((row, index) => ({
    id: row.id || `N${index + 1}`,
    name: row.name || row.nombre || `Nodo ${index + 1}`,
    role: row.role || row.rol,
    lat: numberValue(row.lat ?? row.latitud, Number.NaN),
    lng: numberValue(row.lng ?? row.lon ?? row.longitud, Number.NaN),
    quantityKg: numberValue(row.quantity_kg ?? row.cantidad_kg ?? row.quantitykg),
    capacityKg: numberValue(row.capacity_kg ?? row.capacidad_kg ?? row.capacitykg),
    fixedCost: numberValue(row.fixed_cost ?? row.costo_fijo ?? row.fixedcost),
    serviceMin: numberValue(row.service_min ?? row.tiempo_servicio_min ?? row.servicemin, 20),
    forcedOpen: booleanValue(row.forced_open ?? row.apertura_forzada ?? row.forcedopen),
  })) as LogisticsNode[];
  const roles = new Set(["producer", "center", "hub", "customer"]);
  if (nodes.some((node) => !roles.has(node.role))) throw new Error("Cada fila debe usar role: producer, center, hub o customer");
  if (nodes.some((node) => !Number.isFinite(node.lat) || !Number.isFinite(node.lng))) throw new Error("Cada fila debe incluir lat y lng válidos");
  return nodes;
}

export function parseGeoJson(text: string) {
  type GeoJsonFeature = { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } };
  const collection = JSON.parse(text) as { type?: string; features?: GeoJsonFeature[] };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) throw new Error("Se esperaba un GeoJSON FeatureCollection");
  const nodes: LogisticsNode[] = [];
  const roads: RoadFeature[] = [];
  const tolls: TollFeature[] = [];
  collection.features.forEach((feature, index: number) => {
    const properties = feature.properties ?? {};
    const geometry = feature.geometry;
    if (!geometry) return;
    if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      const [lng, lat] = geometry.coordinates as [number, number];
      if (properties.role || properties.rol) {
        nodes.push({
          id: String(properties.id ?? `N${index + 1}`), name: String(properties.name ?? properties.nombre ?? `Nodo ${index + 1}`), role: String(properties.role ?? properties.rol) as NodeRole,
          lat: numberValue(lat), lng: numberValue(lng), quantityKg: numberValue(properties.quantity_kg ?? properties.cantidad_kg), capacityKg: numberValue(properties.capacity_kg ?? properties.capacidad_kg),
          fixedCost: numberValue(properties.fixed_cost ?? properties.costo_fijo), serviceMin: numberValue(properties.service_min ?? properties.tiempo_servicio_min, 20), forcedOpen: booleanValue(properties.forced_open ?? properties.apertura_forzada),
        });
      } else {
        const rates: Record<string, number> = {};
        Object.entries(properties).forEach(([key, value]) => {
          if (key.startsWith("rate_") || key.startsWith("tarifa_") || key.startsWith("categoria_")) rates[key.split("_").slice(1).join("_").toUpperCase()] = numberValue(value);
        });
        if (properties.rate != null || properties.tarifa != null) rates.default = numberValue(properties.rate ?? properties.tarifa);
        tolls.push({
          id: String(properties.id ?? `P${index + 1}`), name: String(properties.name ?? properties.nombre ?? properties.nombre_peaje ?? `Peaje ${index + 1}`), lat, lng, rates,
          sector: String(properties.sector ?? ""), direction: String(properties.direction ?? properties.sentido ?? ""), operator: String(properties.operator ?? properties.responsable ?? ""),
        });
      }
    }
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) roads.push({
      id: String(properties.id ?? `V${index + 1}`), roadClass: roadCategory(properties.road_class ?? properties.clase_vial ?? properties.highway), highway: String(properties.highway ?? "") || undefined,
      costPerKm: properties.cost_per_km == null && properties.costo_km == null ? undefined : numberValue(properties.cost_per_km ?? properties.costo_km),
      coordinates: (geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
    });
  });
  return { nodes, roads, tolls };
}

export function scenarioTemplateCsv() {
  return [
    "id,name,role,lat,lng,quantity_kg,capacity_kg,fixed_cost,service_min,forced_open",
    "P1,Productor norte,producer,4.90,-74.10,3000,0,0,0,false",
    "C1,Centro regional,center,4.75,-74.05,0,12000,500000,0,true",
    "H1,Nodo de distribución,hub,4.66,-74.08,0,0,0,0,false",
    "D1,Cliente urbano,customer,4.62,-74.12,3000,0,0,20,false",
  ].join("\n");
}

export function downloadFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultsCsv(result: OptimizationResult) {
  const headers = ["route_id", "stage", "vehicle_id", "node_ids", "load_kg", "trips", "distance_km", "duration_min", "source", "road_source", "tolls_detected", "distance_cost", "time_cost", "fixed_cost", "tolls", "node_cost", "overhead", "total_cost"];
  const rows = result.routes.map((route) => [route.id, route.stage, route.vehicleId, route.nodeIds.join(" > "), route.loadKg, route.trips, route.distanceKm.toFixed(2), route.durationMin.toFixed(2), route.source, route.roadDataSource, route.tollNames.join(" | "), route.cost.distance, route.cost.time, route.cost.fixed, route.cost.tolls, route.cost.node, route.cost.overhead, route.cost.total]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function resultGeoJson(nodes: LogisticsNode[], result: OptimizationResult) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      ...nodes.map((node) => ({ type: "Feature", properties: { ...node }, geometry: { type: "Point", coordinates: [node.lng, node.lat] } })),
      ...result.routes.map((route) => ({ type: "Feature", properties: { id: route.id, stage: route.stage, vehicle_id: route.vehicleId, load_kg: route.loadKg, total_cost: route.cost.total, source: route.source, road_source: route.roadDataSource, tolls: route.tollNames.join(" | ") }, geometry: { type: "LineString", coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]) } })),
      ...result.roadLoads.map((segment) => ({ type: "Feature", properties: { id: segment.id, feature_type: "road_load", road_class: segment.roadClass, load_kg: segment.loadKg, vehicle_passes: segment.vehiclePasses, route_ids: segment.routeIds.join(",") }, geometry: { type: "LineString", coordinates: segment.coordinates.map(([lat, lng]) => [lng, lat]) } })),
    ],
  }, null, 2);
}

export function scenarioJson(scenario: Scenario) {
  return JSON.stringify(scenario, null, 2);
}

export function normalizeScenario(value: Scenario): Scenario {
  return {
    ...value,
    config: { ...DEFAULT_CONFIG, ...value.config, nodeCosts: { ...DEFAULT_CONFIG.nodeCosts, ...value.config?.nodeCosts } },
    vehicles: (value.vehicles?.length ? value.vehicles : DEFAULT_VEHICLES).map((vehicle) => {
      const fallback = DEFAULT_VEHICLES.find((item) => item.id === vehicle.id) ?? DEFAULT_VEHICLES[0];
      return { ...fallback, ...vehicle, roadCostPerKm: { ...fallback.roadCostPerKm, ...vehicle.roadCostPerKm } };
    }),
  };
}
