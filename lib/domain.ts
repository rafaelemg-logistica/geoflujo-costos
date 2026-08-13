export type NodeRole = "producer" | "center" | "hub" | "customer";

export type RoadCategory = "primary" | "secondary" | "tertiary" | "local" | "rural" | "unclassified";

export const ROAD_CATEGORY_LABELS: Record<RoadCategory, string> = {
  primary: "Vía primaria",
  secondary: "Vía secundaria",
  tertiary: "Vía terciaria",
  local: "Vía local",
  rural: "Vía rural de baja especificación",
  unclassified: "Sin clasificar",
};

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
  roadCostPerKm: Record<RoadCategory, number>;
}

export interface NodeCosts {
  loadingPerKg: number;
  unloadingPerKg: number;
  consolidationPerKg: number;
  deconsolidationPerKg: number;
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
  osmNodeIds?: number[];
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
  sector?: string;
  direction?: string;
  operator?: string;
}

export interface RoadFeature {
  id: string;
  roadClass: RoadCategory;
  highway?: string;
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
  roadDataSource: "overpass" | "uploaded" | "fallback";
  tollNames: string[];
  roadClassKm: Record<RoadCategory, number>;
  segmentRoadClasses: RoadCategory[];
  cost: CostBreakdown;
}

export interface RoadLoadSegment {
  id: string;
  coordinates: [[number, number], [number, number]];
  roadClass: RoadCategory;
  loadKg: number;
  vehiclePasses: number;
  routeIds: string[];
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
  roadLoads: RoadLoadSegment[];
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
  roundTrip: false,
  roadMatchToleranceM: 100,
  tollMatchToleranceM: 500,
  nodeCosts: {
    loadingPerKg: 25,
    unloadingPerKg: 20,
    consolidationPerKg: 35,
    deconsolidationPerKg: 55,
    storagePerKg: 0,
    preparationPerKg: 50,
    overheadPercent: 0,
  },
};

const roadRates = (primary: number, secondary: number, tertiary: number, local: number, rural: number): Record<RoadCategory, number> => ({
  primary,
  secondary,
  tertiary,
  local,
  rural,
  unclassified: tertiary,
});

export const DEFAULT_VEHICLES: Vehicle[] = [
  { id: "luv", name: "Camioneta LUV / pickup", capacityKg: 1300, costPerKm: 958, costPerHour: 0, fixedCost: 0, tollCategory: "I", roadCostPerKm: roadRates(958, 1073, 1227, 1390, 1629) },
  { id: "liviano-2", name: "Camión liviano 2 ejes", capacityKg: 3500, costPerKm: 1817, costPerHour: 0, fixedCost: 0, tollCategory: "III", roadCostPerKm: roadRates(1817, 2035, 2325, 2634, 3088) },
  { id: "c2", name: "Camión C2 mediano", capacityKg: 7000, costPerKm: 2443, costPerHour: 0, fixedCost: 0, tollCategory: "IV", roadCostPerKm: roadRates(2443, 2736, 3127, 3543, 4153) },
  { id: "c3", name: "Camión C3 doble troque", capacityKg: 14000, costPerKm: 3453, costPerHour: 0, fixedCost: 0, tollCategory: "V", roadCostPerKm: roadRates(3453, 3868, 4420, 5007, 5871) },
  { id: "c2s2", name: "Tractocamión C2S2", capacityKg: 18000, costPerKm: 3786, costPerHour: 0, fixedCost: 0, tollCategory: "V", roadCostPerKm: roadRates(3786, 4240, 4845, 5489, 6435) },
  { id: "c3s2", name: "Tractocamión C3S2", capacityKg: 30000, costPerKm: 4322, costPerHour: 0, fixedCost: 0, tollCategory: "VI", roadCostPerKm: roadRates(4322, 4841, 5533, 6268, 7348) },
];

export const ROLE_LABELS: Record<NodeRole, string> = {
  producer: "Productor",
  center: "Centro",
  hub: "Nodo de distribución",
  customer: "Cliente",
};
