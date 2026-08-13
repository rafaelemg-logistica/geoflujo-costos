import assert from "node:assert/strict";
import test from "node:test";
import { parseGeoJson, parseNodesCsv, scenarioTemplateCsv } from "../lib/io.ts";

test("importa la plantilla CSV publica", () => {
  const nodes = parseNodesCsv(scenarioTemplateCsv());
  assert.equal(nodes.length, 4);
  assert.deepEqual(nodes.map((node) => node.role), ["producer", "center", "hub", "customer"]);
});

test("distingue nodos, peajes y vias en GeoJSON", () => {
  const parsed = parseGeoJson(JSON.stringify({ type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "P1", role: "producer", quantity_kg: 100 }, geometry: { type: "Point", coordinates: [-74, 4] } },
    { type: "Feature", properties: { name: "Peaje", rate_II: 22000 }, geometry: { type: "Point", coordinates: [-74.1, 4.1] } },
    { type: "Feature", properties: { road_class: "principal", cost_per_km: 1800 }, geometry: { type: "LineString", coordinates: [[-74, 4], [-74.2, 4.2]] } },
  ] }));
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.tolls[0].rates.II, 22000);
  assert.equal(parsed.roads[0].roadClass, "primary");
});
