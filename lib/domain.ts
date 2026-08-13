export type NodeRole = "producer" | "center" | "hub" | "customer";

export interface LogisticsNode {
  id: string;
  name: string;
  role: NodeRole;
  lat: number;
  lng: number;
  quantityKg: number;
  capacityKg: number;
  fixedCost: number;
  serviceMin: number;
  forcedOpen: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  capacityKg: number;
  costPerKm: number;
  costPerHour: number;
  fixedCost: number;
  tollCategory: string;
}

export interface NodeCosts {
  loadingPerKg: number;
  unloadingPerKg: number;
  consolidationPerKg: number;
  storagePerKg: number;
  preparationPerKg: number;
  overheadPercent: number;
}

export interface ScenarioConfig {
  currency: string;
  locale: string;
  maxCenters: number;
  fallbackSpeedKmh: number;
  fallbackDistanceFactor: number;
  manualTolls: number;
  roundTrip: boolean;
  roadMatchToleranceM: number;
  tollMatchToleranceM: number;
  nodeCosts: NodeCosts;
}

export interface RouteMetric {
  fromId: string;
  toId: string;
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
  source: "osrm" | "estimate";
  confidence: "high" | "estimated";
}

export interface MatrixMetric {
  distanceKm: number;
  durationMin: number;
  source: "osrm" | "estimate";
}

export type MetricMatrix = Record<string, Record<string, MatrixMetric>>;

export interface TollFeature {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rates: Record<string, number>;
}

export interface RoadFeature {
  id: string;
  roadClass: string;
  costPerKm?: number;
  coordinates: [number, number][];
}

export interface CostBreakdown {
  distance: number;
  time: number;
  fixed: number;
  tolls: number;
  node: number;
  overhead: number;
  total: number;
}

export interface PlannedRoute {
  id: string;
  stage: "collection" | "trunk" | "lastMile" | "quick";
  nodeIds: string[];
  vehicleId: string;
  loadKg: number;
  trips: number;
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
  source: "osrm" | "estimate";
  tollNames: string[];
  roadClassKm: Record<string, number>;
  cost: CostBreakdown;
}

export interface Assignment {
  producerId: string;
  centerId: string;
  supplyKg: number;
  assignmentCost: number;
}

export interface StageSummary {
  stage: PlannedRoute["stage"] | "all";
  routes: number;
  loadKg: number;
  distanceKm: number;
  durationMin: number;
  cost: number;
}

export interface OptimizationResult {
  assignments: Assignment[];
  openCenterIds: string[];
  routes: PlannedRoute[];
  stages: StageSummary[];
  totalCost: number;
  costPerKg: number;
  validations: string[];
}

export interface Scenario {
  version: 1;
  name: string;
  nodes: LogisticsNode[];
  vehicles: Vehicle[];
  config: ScenarioConfig;
}

export const DEFAULT_CONFIG: ScenarioConfig = {
  currency: "COP",
  locale: "es-CO",
  maxCenters: 2,
  fallbackSpeedKmh: 42,
  fallbackDistanceFactor: 1.25,
  manualTolls: 0,
  roundTrip: false,
  roadMatchToleranceM: 75,
  tollMatchToleranceM: 500,
  nodeCosts: {
    loadingPerKg: 35,
    unloadingPerKg: 28,
    consolidationPerKg: 45,
    storagePerKg: 60,
    preparationPerKg: 18,
    overheadPercent: 5,
  },
};

export const DEFAULT_VEHICLES: Vehicle[] = [
  { id: "van", name: "Camioneta", capacityKg: 1500, costPerKm: 1250, costPerHour: 28000, fixedCost: 22000, tollCategory: "I" },
  { id: "truck-2", name: "Camion 2 ejes", capacityKg: 6000, costPerKm: 2600, costPerHour: 44000, fixedCost: 55000, tollCategory: "II" },
  { id: "truck-3", name: "Camion 3 ejes", capacityKg: 10000, costPerKm: 3400, costPerHour: 54000, fixedCost: 76000, tollCategory: "III" },
  { id: "tractor", name: "Tractocamion", capacityKg: 28000, costPerKm: 4200, costPerHour: 62000, fixedCost: 98000, tollCategory: "V" },
];

export const ROLE_LABELS: Record<NodeRole, string> = {
  producer: "Productor",
  center: "Centro",
  hub: "Nodo de distribucion",
  customer: "Cliente",
};
