import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, DEFAULT_VEHICLES, type LogisticsNode, type MetricMatrix } from "../lib/domain.ts";
import { chooseVehicle, clarkeWright, solveCenterAssignments, tripsRequired, validateScenario } from "../lib/logistics.ts";

const node = (id: string, role: LogisticsNode["role"], quantityKg = 0, capacityKg = 0): LogisticsNode => ({ id, name: id, role, lat: 4.6, lng: -74.1, quantityKg, capacityKg, fixedCost: role === "center" ? 100 : 0, serviceMin: 20, forcedOpen: false });

function matrix(ids: string[]): MetricMatrix {
  return Object.fromEntries(ids.map((from, i) => [from, Object.fromEntries(ids.map((to, j) => [to, { distanceKm: Math.abs(i - j) * 10, durationMin: Math.abs(i - j) * 12, source: "osrm" }]))]));
}

test("calcula viajes y selecciona el vehiculo de menor costo", () => {
  assert.equal(tripsRequired(6001, 6000), 2);
  const choice = chooseVehicle(1200, 20, 30, DEFAULT_VEHICLES, false);
  assert.equal(choice.vehicle.id, "van");
  assert.equal(choice.trips, 1);
});

test("asigna productores respetando capacidad y apertura forzada", () => {
  const nodes = [node("P1", "producer", 3000), node("P2", "producer", 2500), node("C1", "center", 0, 6000), node("C2", "center", 0, 3000)];
  nodes[2].forcedOpen = true;
  const result = solveCenterAssignments(nodes, DEFAULT_VEHICLES, matrix(nodes.map((item) => item.id)), { ...DEFAULT_CONFIG, maxCenters: 1 });
  assert.deepEqual(result.openCenterIds, ["C1"]);
  assert.equal(result.assignments.length, 2);
});

test("Clarke-Wright nunca excede la capacidad", () => {
  const depot = node("H", "hub");
  const customers = [node("A", "customer", 700), node("B", "customer", 700), node("C", "customer", 400)];
  const routes = clarkeWright(depot, customers, matrix(["H", "A", "B", "C"]), 1000);
  assert.ok(routes.every((route) => route.loadKg <= 1000));
  assert.equal(routes.reduce((sum, route) => sum + route.loadKg, 0), 1800);
});

test("valida la topologia minima del escenario", () => {
  assert.ok(validateScenario([node("P", "producer", 100)], DEFAULT_VEHICLES).length >= 3);
});
