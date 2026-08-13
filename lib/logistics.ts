import type {
  Assignment,
  CostBreakdown,
  LogisticsNode,
  MetricMatrix,
  OptimizationResult,
  PlannedRoute,
  RoadCategory,
  RoadFeature,
  RoadLoadSegment,
  ScenarioConfig,
  StageSummary,
  TollFeature,
  Vehicle,
} from "./domain";
import { getMetricMatrix, getRoute, haversineKm } from "./routing";
import { getRoadFeaturesForRoute } from "./road-analysis";

type VehicleChoice = { vehicle: Vehicle; trips: number; cost: number };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function tripsRequired(loadKg: number, capacityKg: number) {
  if (capacityKg <= 0) throw new Error("La capacidad vehicular debe ser mayor que cero");
  return Math.max(1, Math.ceil(Math.max(0, loadKg) / capacityKg));
}

export function chooseVehicle(loadKg: number, distanceKm: number, durationMin: number, vehicles: Vehicle[], roundTrip = false): VehicleChoice {
  if (!vehicles.length) throw new Error("El escenario no tiene vehiculos");
  const passMultiplier = roundTrip ? 2 : 1;
  const choices = vehicles.filter((vehicle) => vehicle.capacityKg > 0).map((vehicle) => {
    const trips = tripsRequired(loadKg, vehicle.capacityKg);
    const cost = trips * (distanceKm * vehicle.costPerKm * passMultiplier + durationMin / 60 * vehicle.costPerHour * passMultiplier + vehicle.fixedCost);
    return { vehicle, trips, cost };
  });
  if (!choices.length) throw new Error("Ningun vehiculo tiene capacidad valida");
  return choices.sort((a, b) => a.cost - b.cost)[0];
}

function pairCost(from: LogisticsNode, to: LogisticsNode, loadKg: number, matrix: MetricMatrix, vehicles: Vehicle[], config: ScenarioConfig) {
  const metric = matrix[from.id][to.id];
  return chooseVehicle(loadKg, metric.distanceKm, metric.durationMin, vehicles, config.roundTrip).cost;
}

export function solveCenterAssignments(nodes: LogisticsNode[], vehicles: Vehicle[], matrix: MetricMatrix, config: ScenarioConfig) {
  const producers = nodes.filter((node) => node.role === "producer").sort((a, b) => b.quantityKg - a.quantityKg);
  const centers = nodes.filter((node) => node.role === "center");
  const forced = centers.filter((center) => center.forcedOpen).map((center) => center.id);
  if (forced.length > config.maxCenters) throw new Error("Hay mas centros forzados que el maximo permitido");

  let bestCost = Number.POSITIVE_INFINITY;
  let bestAssignments: Assignment[] = [];
  let bestOpen = new Set<string>();

  const visit = (index: number, cost: number, remaining: Record<string, number>, open: Set<string>, assignments: Assignment[]) => {
    if (cost >= bestCost) return;
    if (index === producers.length) {
      const requiredForced = forced.every((id) => open.has(id));
      if (!requiredForced) return;
      bestCost = cost;
      bestAssignments = assignments.map((item) => ({ ...item }));
      bestOpen = new Set(open);
      return;
    }
    const producer = producers[index];
    const candidates = centers
      .filter((center) => remaining[center.id] >= producer.quantityKg && (open.has(center.id) || open.size < config.maxCenters))
      .map((center) => ({ center, transport: pairCost(producer, center, producer.quantityKg, matrix, vehicles, config) }))
      .sort((a, b) => a.transport - b.transport);

    for (const { center, transport } of candidates) {
      const opening = open.has(center.id) ? 0 : center.fixedCost;
      remaining[center.id] -= producer.quantityKg;
      const nextOpen = new Set(open).add(center.id);
      assignments.push({ producerId: producer.id, centerId: center.id, supplyKg: producer.quantityKg, assignmentCost: money(transport) });
      visit(index + 1, cost + transport + opening, remaining, nextOpen, assignments);
      assignments.pop();
      remaining[center.id] += producer.quantityKg;
    }
  };

  const initialOpen = new Set(forced);
  const initialCost = centers.filter((center) => initialOpen.has(center.id)).reduce((sum, center) => sum + center.fixedCost, 0);
  visit(0, initialCost, Object.fromEntries(centers.map((center) => [center.id, center.capacityKg])), initialOpen, []);
  if (!Number.isFinite(bestCost)) throw new Error("No existe una asignacion factible con las capacidades y el maximo de centros definidos");
  return { assignments: bestAssignments, openCenterIds: [...bestOpen], objectiveCost: money(bestCost) };
}

export function clarkeWright(depot: LogisticsNode, customers: LogisticsNode[], matrix: MetricMatrix, capacityKg: number) {
  const routes = new Map<string, string[]>();
  const loads = new Map<string, number>();
  const routeOf = new Map<string, string>();
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  customers.forEach((customer) => {
    routes.set(customer.id, [customer.id]);
    loads.set(customer.id, customer.quantityKg);
    routeOf.set(customer.id, customer.id);
  });
  const savings: { value: number; left: string; right: string }[] = [];
  for (let i = 0; i < customers.length; i += 1) {
    for (let j = i + 1; j < customers.length; j += 1) {
      const left = customers[i].id;
      const right = customers[j].id;
      savings.push({ value: matrix[depot.id][left].distanceKm + matrix[depot.id][right].distanceKm - matrix[left][right].distanceKm, left, right });
    }
  }
  savings.sort((a, b) => b.value - a.value);
  for (const saving of savings) {
    const leftRouteId = routeOf.get(saving.left)!;
    const rightRouteId = routeOf.get(saving.right)!;
    if (leftRouteId === rightRouteId) continue;
    const leftRoute = routes.get(leftRouteId)!;
    const rightRoute = routes.get(rightRouteId)!;
    const newLoad = loads.get(leftRouteId)! + loads.get(rightRouteId)!;
    if (newLoad > capacityKg) continue;
    let merged: string[] | null = null;
    if (leftRoute.at(-1) === saving.left && rightRoute[0] === saving.right) merged = [...leftRoute, ...rightRoute];
    else if (rightRoute.at(-1) === saving.right && leftRoute[0] === saving.left) merged = [...rightRoute, ...leftRoute];
    if (!merged) continue;
    routes.set(leftRouteId, merged);
    loads.set(leftRouteId, newLoad);
    rightRoute.forEach((id) => routeOf.set(id, leftRouteId));
    routes.delete(rightRouteId);
    loads.delete(rightRouteId);
  }
  return [...routes.values()].map((route) => ({ nodeIds: [depot.id, ...route, depot.id], loadKg: route.reduce((sum, id) => sum + customerById.get(id)!.quantityKg, 0) }));
}

function pointSegmentDistanceM(point: [number, number], start: [number, number], end: [number, number]) {
  const latitude = (start[0] + end[0] + point[0]) / 3 * Math.PI / 180;
  const scaleX = 111320 * Math.cos(latitude);
  const scaleY = 110540;
  const px = (point[1] - start[1]) * scaleX;
  const py = (point[0] - start[0]) * scaleY;
  const ex = (end[1] - start[1]) * scaleX;
  const ey = (end[0] - start[0]) * scaleY;
  const lengthSquared = ex * ex + ey * ey;
  const t = lengthSquared ? Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared)) : 0;
  return Math.hypot(px - t * ex, py - t * ey);
}

function pointLineDistanceM(point: [number, number], line: [number, number][]) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) minimum = Math.min(minimum, pointSegmentDistanceM(point, line[index - 1], line[index]));
  return minimum;
}

const EMPTY_ROAD_KM: Record<RoadCategory, number> = { primary: 0, secondary: 0, tertiary: 0, local: 0, rural: 0, unclassified: 0 };

function spatialProfile(coordinates: [number, number][], roads: RoadFeature[], tolls: TollFeature[], config: ScenarioConfig) {
  const roadClassKm: Record<RoadCategory, number> = { ...EMPTY_ROAD_KM };
  const segmentRoadClasses: RoadCategory[] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentKm = haversineKm({ lat: start[0], lng: start[1] }, { lat: end[0], lng: end[1] });
    const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    let match: RoadFeature | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const road of roads) {
      const candidateDistance = pointLineDistanceM(midpoint, road.coordinates);
      if (candidateDistance < distance) { distance = candidateDistance; match = road; }
    }
    const roadClass: RoadCategory = match && distance <= config.roadMatchToleranceM ? match.roadClass : "unclassified";
    roadClassKm[roadClass] += segmentKm;
    segmentRoadClasses.push(roadClass);
  }
  const matchedTolls = tolls.filter((toll) => pointLineDistanceM([toll.lat, toll.lng], coordinates) <= config.tollMatchToleranceM);
  return { roadClassKm, segmentRoadClasses, matchedTolls };
}

function vehicleSpatialCost(vehicle: Vehicle, profile: ReturnType<typeof spatialProfile>, durationMin: number, loadKg: number, config: ScenarioConfig) {
  const trips = tripsRequired(loadKg, vehicle.capacityKg);
  const returnMultiplier = config.roundTrip ? 2 : 1;
  const distanceCost = (Object.entries(profile.roadClassKm) as [RoadCategory, number][])
    .reduce((sum, [roadClass, km]) => sum + km * (vehicle.roadCostPerKm?.[roadClass] ?? vehicle.costPerKm), 0);
  const tollCost = profile.matchedTolls.reduce((sum, toll) => sum + (toll.rates[vehicle.tollCategory] ?? toll.rates.default ?? 0), 0);
  const total = trips * (returnMultiplier * (distanceCost + tollCost + durationMin / 60 * vehicle.costPerHour) + vehicle.fixedCost);
  return { vehicle, trips, distanceCost, tollCost, total };
}

async function materializeRoute(id: string, stage: PlannedRoute["stage"], routeNodes: LogisticsNode[], loadKg: number, vehicles: Vehicle[], config: ScenarioConfig, roads: RoadFeature[], tolls: TollFeature[], nodeCostPerKg: number) {
  const metric = await getRoute(routeNodes, config);
  const routeRoads = roads.length ? roads : await getRoadFeaturesForRoute(metric.osmNodeIds);
  const roadDataSource: PlannedRoute["roadDataSource"] = roads.length ? "uploaded" : routeRoads.length ? "overpass" : "fallback";
  const spatial = spatialProfile(metric.coordinates, routeRoads, tolls, config);
  const choices = vehicles.filter((vehicle) => vehicle.capacityKg > 0)
    .map((vehicle) => vehicleSpatialCost(vehicle, spatial, metric.durationMin, loadKg, config))
    .sort((a, b) => a.total - b.total);
  if (!choices.length) throw new Error("Ningún vehículo tiene capacidad válida");
  const choice = choices[0];
  const passMultiplier = choice.trips * (config.roundTrip && routeNodes[0].id !== routeNodes.at(-1)?.id ? 2 : 1);
  const distance = choice.distanceCost * passMultiplier;
  const time = metric.durationMin / 60 * choice.vehicle.costPerHour * passMultiplier;
  const fixed = choice.vehicle.fixedCost * choice.trips;
  const tollCost = choice.tollCost * passMultiplier;
  const node = loadKg * nodeCostPerKg;
  const overhead = (distance + time + fixed + tollCost + node) * config.nodeCosts.overheadPercent / 100;
  const cost: CostBreakdown = { distance: money(distance), time: money(time), fixed: money(fixed), tolls: money(tollCost), node: money(node), overhead: money(overhead), total: money(distance + time + fixed + tollCost + node + overhead) };
  return {
    id, stage, nodeIds: routeNodes.map((node) => node.id), vehicleId: choice.vehicle.id, loadKg, trips: choice.trips,
    distanceKm: metric.distanceKm, durationMin: metric.durationMin, coordinates: metric.coordinates, source: metric.source, roadDataSource,
    tollNames: spatial.matchedTolls.map((toll) => toll.name),
    roadClassKm: Object.fromEntries(Object.entries(spatial.roadClassKm).map(([key, value]) => [key, money(value)])) as Record<RoadCategory, number>,
    segmentRoadClasses: spatial.segmentRoadClasses,
    cost,
  } satisfies PlannedRoute;
}

export function buildAccumulatedRoadLoads(routes: PlannedRoute[]): RoadLoadSegment[] {
  const segments = new Map<string, RoadLoadSegment>();
  routes.forEach((route) => {
    const passes = route.trips;
    for (let index = 1; index < route.coordinates.length; index += 1) {
      const start = route.coordinates[index - 1];
      const end = route.coordinates[index];
      const startKey = `${start[0].toFixed(5)},${start[1].toFixed(5)}`;
      const endKey = `${end[0].toFixed(5)},${end[1].toFixed(5)}`;
      const key = [startKey, endKey].sort().join("|");
      const current = segments.get(key);
      if (current) {
        current.loadKg += route.loadKg * passes;
        current.vehiclePasses += passes;
        if (!current.routeIds.includes(route.id)) current.routeIds.push(route.id);
      } else {
        segments.set(key, {
          id: `CV-${segments.size + 1}`,
          coordinates: [start, end],
          roadClass: route.segmentRoadClasses[index - 1] ?? "unclassified",
          loadKg: route.loadKg * passes,
          vehiclePasses: passes,
          routeIds: [route.id],
        });
      }
    }
  });
  return [...segments.values()].map((segment) => ({ ...segment, loadKg: money(segment.loadKg) }));
}

function summarize(routes: PlannedRoute[]): StageSummary[] {
  const stages: PlannedRoute["stage"][] = ["collection", "trunk", "lastMile"];
  const rows: StageSummary[] = stages.map((stage) => {
    const selected = routes.filter((route) => route.stage === stage);
    return { stage, routes: selected.length, loadKg: selected.reduce((sum, route) => sum + route.loadKg, 0), distanceKm: selected.reduce((sum, route) => sum + route.distanceKm, 0), durationMin: selected.reduce((sum, route) => sum + route.durationMin, 0), cost: selected.reduce((sum, route) => sum + route.cost.total, 0) } satisfies StageSummary;
  });
  rows.push({ stage: "all", routes: routes.length, loadKg: routes.reduce((sum, route) => sum + route.loadKg, 0), distanceKm: routes.reduce((sum, route) => sum + route.distanceKm, 0), durationMin: routes.reduce((sum, route) => sum + route.durationMin, 0), cost: routes.reduce((sum, route) => sum + route.cost.total, 0) });
  return rows.map((row) => ({ ...row, distanceKm: money(row.distanceKm), durationMin: money(row.durationMin), cost: money(row.cost) }));
}

export function validateScenario(nodes: LogisticsNode[], vehicles: Vehicle[]) {
  const errors: string[] = [];
  if (nodes.length > 30) errors.push("El modo publico admite hasta 30 nodos por escenario.");
  if (!nodes.some((node) => node.role === "producer")) errors.push("Agrega al menos un productor.");
  if (!nodes.some((node) => node.role === "center")) errors.push("Agrega al menos un centro.");
  if (!nodes.some((node) => node.role === "hub")) errors.push("Agrega al menos un nodo de distribucion.");
  if (!nodes.some((node) => node.role === "customer")) errors.push("Agrega al menos un cliente de ultima milla.");
  if (nodes.some((node) => !Number.isFinite(node.lat) || !Number.isFinite(node.lng) || Math.abs(node.lat) > 90 || Math.abs(node.lng) > 180)) errors.push("Hay coordenadas invalidas.");
  if (nodes.filter((node) => node.role === "producer" || node.role === "customer").some((node) => node.quantityKg <= 0)) errors.push("Productores y clientes deben tener una cantidad mayor que cero.");
  if (nodes.filter((node) => node.role === "center").some((node) => node.capacityKg <= 0)) errors.push("Los centros deben tener capacidad mayor que cero.");
  if (!vehicles.length || vehicles.some((vehicle) => vehicle.capacityKg <= 0)) errors.push("Configura al menos un vehiculo con capacidad valida.");
  return errors;
}

export async function optimizeScenario(nodes: LogisticsNode[], vehicles: Vehicle[], config: ScenarioConfig, roads: RoadFeature[] = [], tolls: TollFeature[] = []): Promise<OptimizationResult> {
  const errors = validateScenario(nodes, vehicles);
  if (errors.length) throw new Error(errors.join(" "));
  const matrix = await getMetricMatrix(nodes, config);
  const assignmentSolution = solveCenterAssignments(nodes, vehicles, matrix, config);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const routes: PlannedRoute[] = [];
  const validations: string[] = [];
  if (Object.values(matrix).some((row) => Object.values(row).some((metric) => metric.source === "estimate"))) validations.push("Parte o toda la matriz usa estimacion geodesica por indisponibilidad de OSRM.");

  for (const assignment of assignmentSolution.assignments) {
    routes.push(await materializeRoute(`REC-${routes.length + 1}`, "collection", [byId.get(assignment.producerId)!, byId.get(assignment.centerId)!], assignment.supplyKg, vehicles, config, roads, tolls, config.nodeCosts.loadingPerKg + config.nodeCosts.unloadingPerKg + config.nodeCosts.consolidationPerKg + config.nodeCosts.storagePerKg));
  }

  const hubs = nodes.filter((node) => node.role === "hub");
  for (const centerId of assignmentSolution.openCenterIds) {
    const center = byId.get(centerId)!;
    const loadKg = assignmentSolution.assignments.filter((assignment) => assignment.centerId === centerId).reduce((sum, assignment) => sum + assignment.supplyKg, 0);
    if (loadKg <= 0) continue;
    const hub = hubs.map((candidate) => ({ candidate, cost: pairCost(center, candidate, loadKg, matrix, vehicles, config) })).sort((a, b) => a.cost - b.cost)[0].candidate;
    routes.push(await materializeRoute(`TRON-${routes.length + 1}`, "trunk", [center, hub], loadKg, vehicles, config, roads, tolls, config.nodeCosts.unloadingPerKg + config.nodeCosts.preparationPerKg));
  }

  const customers = nodes.filter((node) => node.role === "customer");
  const customerGroups = new Map<string, LogisticsNode[]>();
  customers.forEach((customer) => {
    const hub = hubs.map((candidate) => ({ candidate, distance: matrix[candidate.id][customer.id].distanceKm })).sort((a, b) => a.distance - b.distance)[0].candidate;
    customerGroups.set(hub.id, [...(customerGroups.get(hub.id) ?? []), customer]);
  });
  const lastMileCapacity = Math.max(...vehicles.map((vehicle) => vehicle.capacityKg));
  for (const [hubId, group] of customerGroups) {
    const hub = byId.get(hubId)!;
    const plans = clarkeWright(hub, group, matrix, lastMileCapacity);
    for (const plan of plans) {
      routes.push(await materializeRoute(`UM-${routes.length + 1}`, "lastMile", plan.nodeIds.map((id) => byId.get(id)!), plan.loadKg, vehicles, { ...config, roundTrip: false }, roads, tolls, config.nodeCosts.preparationPerKg + config.nodeCosts.unloadingPerKg));
    }
  }

  routes.filter((route) => route.source === "estimate").forEach((route) => validations.push(`${route.id}: geometria y costo calculados con estimacion de contingencia.`));
  if (routes.some((route) => route.roadDataSource === "fallback")) validations.push("En algunas rutas no fue posible consultar la categoría vial; se aplicó la tarifa de contingencia del vehículo.");
  if (!tolls.length) validations.push("No fue posible cargar la capa regional de peajes; el componente de peajes es cero.");
  const producerSupply = nodes.filter((node) => node.role === "producer").reduce((sum, node) => sum + node.quantityKg, 0);
  const customerDemand = customers.reduce((sum, node) => sum + node.quantityKg, 0);
  if (Math.abs(producerSupply - customerDemand) > 0.01) validations.push(`La oferta (${producerSupply} kg) y la demanda (${customerDemand} kg) no coinciden.`);
  const stages = summarize(routes);
  const totalCost = stages.find((stage) => stage.stage === "all")?.cost ?? 0;
  return { assignments: assignmentSolution.assignments, openCenterIds: assignmentSolution.openCenterIds, routes, roadLoads: buildAccumulatedRoadLoads(routes), stages, totalCost, costPerKg: producerSupply > 0 ? money(totalCost / producerSupply) : 0, validations };
}

export async function calculateQuickRoute(nodes: LogisticsNode[], vehicle: Vehicle, config: ScenarioConfig, loadKg: number, roads: RoadFeature[] = [], tolls: TollFeature[] = []) {
  return materializeRoute("RUTA-1", "quick", nodes, loadKg, [vehicle], config, roads, tolls, config.nodeCosts.loadingPerKg + config.nodeCosts.unloadingPerKg);
}
