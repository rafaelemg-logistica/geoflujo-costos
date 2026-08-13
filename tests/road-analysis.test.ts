import assert from "node:assert/strict";
import test from "node:test";
import { classifyHighway } from "../lib/road-analysis.ts";

test("homologa las categorías viales OSM", () => {
  assert.equal(classifyHighway("primary_link"), "primary");
  assert.equal(classifyHighway("secondary"), "secondary");
  assert.equal(classifyHighway("tertiary"), "tertiary");
  assert.equal(classifyHighway("residential"), "local");
  assert.equal(classifyHighway("track"), "rural");
  assert.equal(classifyHighway("footway"), "unclassified");
});
