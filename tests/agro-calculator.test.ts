import assert from "node:assert/strict";
import test from "node:test";
import {calculateAgro,copyStarterModel,validateAgroModel} from "../lib/agro-calculator.ts";

test("mango E1 base replica costeo del tablero Excel",()=>{
 const model=copyStarterModel();const s=model.scenarios.find(s=>s.id==="E1")!;
 const r=calculateAgro(model,s,"base");
 assert.ok(Math.abs(r.deliveredKg-5365.8)<1e-8);
 assert.ok(Math.abs(r.totalCost-1514132.564)<1e-6);
 assert.ok(Math.abs(r.costPerDeliveredKg!-282.18207238436)<1e-7);
 assert.equal(r.totalTrips,1);
 assert.ok(Math.abs(r.massBalanceErrorKg)<1e-7);
});
test("canal tradicional E2 conserva la pérdida SIPSA de referencia",()=>{
 const model=copyStarterModel();
 const r=calculateAgro(model,model.scenarios[1],"base");
 assert.ok(Math.abs(r.deliveredKg-5213.45)<1e-6);
 assert.ok(Math.abs(r.lossKg-286.55)<1e-6);
});
test("transformación diferencia conversión y merma real",()=>{
 const model=copyStarterModel();
 const r=calculateAgro(model,model.scenarios[4],"base");
 assert.ok(Math.abs(r.deliveredKg-3601.8675)<1e-5);
 assert.ok(Math.abs(r.lossKg-146.3825)<1e-5);
 assert.ok(Math.abs(r.conversionKg-1751.75)<1e-5);
 assert.ok(Math.abs(r.massBalanceErrorKg)<1e-6);
});
test("edición de tarifas y costos se refleja en el recálculo",()=>{
 const model=copyStarterModel();const s=model.scenarios[0];
 const base=calculateAgro(model,s,"base");
 model.operations.find(o=>o.id==="OP_CARGA")!.costPerKg+=10;
 const modified=calculateAgro(model,s,"base");
 assert.equal(Math.round(modified.totalCost-base.totalCost),55000);
});
test("vehículo sensible a viajes por peso y volumen",()=>{
 const model=copyStarterModel();const s=model.scenarios[0];
 s.packageVolumeM3=0.2;
 const result=calculateAgro(model,s,"base");
 assert.ok(result.totalTrips>1);
});
test("validación de importación identifica el modelo esperado",()=>{
 assert.ok(validateAgroModel(copyStarterModel()));
 assert.ok(!validateAgroModel({version:1,scenarios:[]}));
});
