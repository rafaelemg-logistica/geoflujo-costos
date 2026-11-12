/**
 * Calculadora agropecuaria: implementación declarativa del libro de trabajo.
 * Los datos iniciales son un ejercicio de calibración, NO tarifas vigentes.
 */
export type Iteration = "optimista" | "base" | "conservador";
export const ITERATIONS: Iteration[] = ["optimista", "base", "conservador"];
export type GeoPoint = { name: string; lat: number; lng: number };
export type SourceState = "manual" | "osrm" | "estimada";
export interface Operation {
  id: string; name: string; costPerKg: number; fixedCost: number;
  fixedMinutes: number; minutesPerKg: number; source: string; note: string;
}
export interface AgroVehicle {
  id: string; name: string; capacityKg: number; capacityM3: number; costPerKm: number; source: string;
}
export type Profile = Record<Iteration, number>;
export type AgroStep =
  | { id: string; kind: "operation"; label: string; operationId: string }
  | { id: string; kind: "loss"; label: string; rates: Profile }
  | { id: string; kind: "transform"; label: string; yields: Profile; operationId: string }
  | { id: string; kind: "transport"; label: string; from: GeoPoint; to: GeoPoint;
      distanceKm: number; hours: number; tolls: number; manualCost: number; surcharge: number;
      useManualCost: boolean; vehicleId: string; source: SourceState;
      path?: [number, number][] };
export interface AgroScenario {
  id: string; name: string; market: string; status: "REVISAR" | "PENDIENTE";
  pending: number; note: string; initialKg: number; packageKg: number;
  packageVolumeM3: number | null; packageCost: number; extraCost: number;
  steps: AgroStep[];
}
export interface AgroModel {
  version: 1; product: string; variety: string; productSource: string;
  operations: Operation[]; vehicles: AgroVehicle[]; scenarios: AgroScenario[];
  transportFactors: Profile; acondSensitivity: Profile; transformCapacityKgH: Profile;
}
export interface StepResult {
  id: string; kind: AgroStep["kind"]; label: string; inputKg: number; outputKg: number;
  logisticLossKg: number; conversionKg: number; costCOP: number; hours: number;
  distanceKm: number; trips: number; warning: string;
}
export interface AgroResult {
  scenarioId: string; iteration: Iteration; initialKg: number; deliveredKg: number;
  lossKg: number; conversionKg: number; transportCost: number; operationCost: number;
  packagingCost: number; otherCost: number; totalCost: number; costPerDeliveredKg: number | null;
  totalKm: number; totalHours: number; totalTrips: number; volumeM3: number | null;
  massBalanceErrorKg: number; warnings: string[]; details: StepResult[];
}
const p=(optimista:number,base:number,conservador:number):Profile=>({optimista,base,conservador});
const ESPINAL:GeoPoint={name:"Espinal (referencia urbana)",lat:4.1496,lng:-74.8840};
const TUNJA:GeoPoint={name:"Tunja (referencia urbana)",lat:5.5353,lng:-73.3678};
const ACOPIO:GeoPoint={name:"Acopio Espinal (referencial)",lat:4.153,lng:-74.881};
const CD:GeoPoint={name:"CD Tunja (referencial)",lat:5.541,lng:-73.369};
const BOYACA:GeoPoint={name:"Distribución Boyacá (referencial)",lat:5.570,lng:-73.225};
const op=(id:string,name:string,costPerKg:number,source:string,note:string="",fixedMinutes:number=0):Operation=>({
  id,name,costPerKg,fixedCost:0,fixedMinutes,minutesPerKg:0,source,note
});
const oper=(id:string,label:string,operationId:string):AgroStep=>({id,kind:"operation",label,operationId});
const loss=(id:string,label:string,a:number,b:number,c:number):AgroStep=>({
  id,kind:"loss",label,rates:p(a,b,c)
});
const transform=(id:string,label:string):AgroStep=>({
  id,kind:"transform",label,operationId:"OP_DESPULP",yields:p(.75,.675,.60)
});
const trans=(id:string,label:string,from:GeoPoint,to:GeoPoint,distanceKm:number,hours:number,tolls:number,manualCost:number,surcharge:number=0):AgroStep=>({
  id,kind:"transport",label,from,to,distanceKm,hours,tolls,manualCost,surcharge,
  useManualCost:true,vehicleId:"V3",source:"manual"
});
const trunk=(id:string="troncal",surcharge:number=0):AgroStep=>
  trans(id,"Troncal Espinal → Tunja",ESPINAL,TUNJA,276.934,4.93,132700,726932.564,surcharge);
const s=(id:string,name:string,market:string,status:"REVISAR"|"PENDIENTE",pending:number,note:string,packageKg:number,steps:AgroStep[]):AgroScenario=>({
  id,name,market,status,pending,note,initialKg:5500,packageKg,
  packageVolumeM3:null,packageCost:0,extraCost:0,steps
});
export const STARTER_MODEL:AgroModel={
  version:1,product:"Mango",variety:"Tommy",productSource:"Libro de cálculo y documento conceptual aportados; parámetros de ensayo.",
  transportFactors:p(.90,1,1.10),acondSensitivity:p(60,74,90),transformCapacityKgH:p(150,50,50),
  operations:[
    op("OP_CARGA","Cargue",25,"SRC_COSTOS"),
    op("OP_DESCARGA","Descargue",20,"SRC_COSTOS"),
    op("OP_ALIST","Alistamiento de pedido",50,"SRC_COSTOS"),
    op("OP_CONSOL","Consolidación",35,"SRC_COSTOS"),
    op("OP_RECEP","Recepción, pesaje y registro",0,"SRC_AGROSAVIA_MANGO_2025","Costo sin validar"),
    op("OP_ACOND","Selección y acondicionamiento manual",74,"SRC_CAL_LAB_2026","Proxy por validar"),
    op("OP_LAVADO","Lavado",0,"SRC_AGROSAVIA_MANGO_2025","Costo sin validar"),
    op("OP_CLASIF","Clasificación",0,"SRC_AGROSAVIA_MANGO_2025","Costo sin validar"),
    op("OP_ALM_TEMP","Almacenamiento temporal",0,"SRC_SUPUESTO","Tarifa pendiente"),
    op("OP_ESCALD","Escaldado",0,"SRC_AGROSAVIA_MANGO_2025","Energía y equipo pendientes",12.5),
    op("OP_DESPULP","Despulpado semiindustrial",193,"SRC_CAL_DESP_2026","Costo parcial; no incluye planta/energía"),
    op("OP_TAMIZ","Tamizado",0,"SRC_AGROSAVIA_MANGO_2025","Costo sin validar"),
    op("OP_PASTEUR","Pasteurización",0,"SRC_AGROSAVIA_MANGO_2025","Energía y equipo pendientes",2),
    op("OP_EMPAQ_PULPA","Empaque hermético de pulpa",0,"SRC_AGROSAVIA_MANGO_2025","Material pendiente"),
    op("OP_ALM_CONG","Congelación / almacenamiento",0,"SRC_INVIMA_2674","Frío pendiente de cotización")
  ],
  vehicles:[
    {id:"V1",name:"LUV / pickup",capacityKg:1300,capacityM3:4.5,costPerKm:958,source:"SRC_COSTOS"},
    {id:"V2",name:"Camión liviano 2 ejes",capacityKg:3500,capacityM3:18,costPerKm:1817,source:"SRC_COSTOS"},
    {id:"V3",name:"C2 mediano",capacityKg:7000,capacityM3:34,costPerKm:2443,source:"SRC_COSTOS"},
    {id:"V4",name:"C3 doble troque",capacityKg:14000,capacityM3:50,costPerKm:3453,source:"SRC_COSTOS"},
    {id:"V5",name:"Minimula C2S2",capacityKg:18000,capacityM3:53,costPerKm:3786,source:"SRC_COSTOS"},
    {id:"V6",name:"Tractomula C3S2",capacityKg:30000,capacityM3:67,costPerKm:4322,source:"SRC_COSTOS"}
  ],
  scenarios:[
    s("E1","Circuito corto","Pedido directo agregado · Tunja","REVISAR",3,
      "Validar escala del pedido, pérdida y costo/retorno de canastillas.",20,[
        oper("e1a","Selección y acondicionamiento","OP_ACOND"),
        oper("e1b","Cargue","OP_CARGA"),trunk("e1c"),
        oper("e1d","Descargue","OP_DESCARGA"),
        loss("e1e","Merma a la entrega",.01,.0244,.0521)
      ]),
    s("E2","Canal tradicional","Mercado mayorista · Tunja","REVISAR",3,
      "Pérdida basada en referencia histórica de SIPSA 2019; validar condiciones actuales.",22,[
        oper("e2a","Selección y acondicionamiento","OP_ACOND"),
        oper("e2b","Cargue","OP_CARGA"),trunk("e2c"),
        oper("e2d","Descargue mayorista","OP_DESCARGA"),
        loss("e2e","Merma mayorista",.0244,.0521,.06)
      ]),
    s("E3","Agregación de oferta","Acopio → mayorista Tunja","PENDIENTE",6,
      "La primera milla de cinco orígenes del Excel es un costo agregado: no hay desglose vial multiproductor.",20,[
        trans("e3a","Primera milla agregada",ESPINAL,ACOPIO,173.642,3,0,239905.698),
        oper("e3b","Descargue en acopio","OP_DESCARGA"),
        oper("e3c","Recepción y pesaje","OP_RECEP"),
        oper("e3d","Consolidación","OP_CONSOL"),
        loss("e3e","Merma en acopio",0,.01,.02),
        oper("e3f","Cargue en acopio","OP_CARGA"),
        trunk("e3g"),
        oper("e3h","Descargue mayorista","OP_DESCARGA"),
        loss("e3i","Merma final",.0244,.0521,.06)
      ]),
    s("E4","Distribución organizada","Retail / HORECA / institucional · Boyacá","PENDIENTE",9,
      "Pendientes requisitos del comprador, lavado, almacenamiento y distribución.",20,[
        oper("e4a","Recepción","OP_RECEP"),oper("e4b","Acondicionamiento","OP_ACOND"),
        oper("e4c","Lavado","OP_LAVADO"),oper("e4d","Clasificación","OP_CLASIF"),
        oper("e4e","Almacenamiento temporal","OP_ALM_TEMP"),
        oper("e4f","Cargue troncal","OP_CARGA"),
        trans("e4g","Transporte al centro de distribución",ESPINAL,CD,276.934,4.93,132700,726932.564),
        oper("e4h","Descargue CD","OP_DESCARGA"),
        oper("e4i","Alistamiento","OP_ALIST"),
        oper("e4j","Cargue última milla","OP_CARGA"),
        trans("e4k","Última milla Boyacá",CD,BOYACA,63.914,1.5,0,78197.479),
        oper("e4l","Descargue comprador","OP_DESCARGA"),
        loss("e4m","Merma del canal organizado",.01,.0244,.0521)
      ]),
    s("E5","Transformación","Pulpa congelada · Tunja","PENDIENTE",12,
      "El costo industrial es incompleto y debe verificarse capacidad, frío y requisitos sanitarios.",1,[
        oper("e5a","Recepción planta","OP_RECEP"),
        oper("e5b","Acondicionamiento","OP_ACOND"),
        loss("e5c","Descarte antes de transformación",0,.02,.0521),
        oper("e5d","Lavado","OP_LAVADO"),
        oper("e5e","Escaldado","OP_ESCALD"),
        transform("e5f","Despulpado y cambio de estado"),
        oper("e5g","Tamizado","OP_TAMIZ"),
        oper("e5h","Pasteurización","OP_PASTEUR"),
        oper("e5i","Empaque pulpa","OP_EMPAQ_PULPA"),
        oper("e5j","Almacenamiento congelado","OP_ALM_CONG"),
        oper("e5k","Cargue pulpa","OP_CARGA"),
        trunk("e5l",.15),
        oper("e5m","Descargue","OP_DESCARGA"),
        loss("e5n","Merma final pulpa",0,.01,.02)
      ])
  ]
};
export function copyStarterModel():AgroModel {
  return JSON.parse(JSON.stringify(STARTER_MODEL)) as AgroModel;
}
const finite=(x:number)=>Number.isFinite(x)?x:0;
const safePositive=(x:number)=>Number.isFinite(x)&&x>0?x:0;
const validRate=(x:number)=>Number.isFinite(x) ? Math.min(1,Math.max(0,x)) : 0;
export function calculateAgro(model:AgroModel, scenario:AgroScenario, iteration:Iteration):AgroResult {
  if(!Number.isFinite(scenario.initialKg)||scenario.initialKg<=0) throw new Error("La cantidad inicial debe ser mayor que cero");
  let mass=scenario.initialKg, lossKg=0, conversionKg=0, operationCost=0, transportCost=0;
  let totalKm=0,totalHours=0,totalTrips=0;
  const warnings:string[]=[];const details:StepResult[]=[];
  if(scenario.packageVolumeM3===null || scenario.packageVolumeM3<=0) warnings.push("Volumen del empaque no parametrizado; viajes calculados solo por peso.");
  if(scenario.packageCost===0) warnings.push("Costo de empaque sin monetizar; el resultado puede estar incompleto.");
  if(scenario.status==="PENDIENTE") warnings.push("Configuración pendiente de validación técnica/comercial.");
  for(const step of scenario.steps) {
    const before=mass;let cost=0,hours=0,travelKm=0,trips=0,removed=0,converted=0,warning="";
    if(step.kind==="loss") {
      const rate=validRate(step.rates[iteration]);
      removed=before*rate;mass=before-removed;lossKg+=removed;
    } else if(step.kind==="transform") {
      const yieldRate=validRate(step.yields[iteration]);
      mass=before*yieldRate;converted=before-mass;conversionKg+=converted;
      const operation=model.operations.find(v=>v.id===step.operationId);
      if(operation) {
        cost=operation.fixedCost+before*operation.costPerKg;
        const cap=safePositive(model.transformCapacityKgH[iteration]);
        hours=cap ? before/cap : 0;
        if(!cap) warning="Capacidad de transformación no parametrizada.";
      } else warning="Operación de transformación no encontrada.";
      operationCost+=cost;
    } else if(step.kind==="operation") {
      const operation=model.operations.find(v=>v.id===step.operationId);
      if(operation){
        const perKg=operation.id==="OP_ACOND"&&iteration!=="base"?model.acondSensitivity[iteration]:operation.costPerKg;
        cost=operation.fixedCost+before*perKg;
        hours=(operation.fixedMinutes+before*operation.minutesPerKg)/60;
        operationCost+=cost;
        if(operation.note) warning=operation.note;
      }else warning="Operación sin parámetro: "+step.operationId;
    } else {
      const vehicle=model.vehicles.find(v=>v.id===step.vehicleId);
      if(!vehicle || vehicle.capacityKg<=0){warning="Vehículo sin capacidad válida.";trips=0;}
      else {
        const weightTrips=Math.ceil(before/vehicle.capacityKg);
        const volume= scenario.packageVolumeM3 && scenario.packageKg>0 ?
          Math.ceil(before/scenario.packageKg)*scenario.packageVolumeM3 : 0;
        const volumeTrips=volume&&vehicle.capacityM3>0?Math.ceil(volume/vehicle.capacityM3):1;
        trips=Math.max(weightTrips,volumeTrips,1);
        const baseCost=step.useManualCost?step.manualCost:step.distanceKm*vehicle.costPerKm;
        cost=trips*(Math.max(0,baseCost)*(1+step.surcharge)*model.transportFactors[iteration]+Math.max(0,step.tolls));
        hours=trips*Math.max(0,step.hours);
        travelKm=trips*Math.max(0,step.distanceKm);
        if(step.source==="estimada") warning="Ruta estimada, no validada contra la red vial.";
        if(step.useManualCost) warning=(warning?warning+" ":"")+"Costo manual preservado: distancia y tarifa vial no determinan el importe.";
        transportCost+=cost;totalKm+=travelKm;totalTrips+=trips;
      }
    }
    totalHours+=hours;
    if(warning) warnings.push(step.label+": "+warning);
    details.push({id:step.id,kind:step.kind,label:step.label,inputKg:finite(before),outputKg:finite(mass),
      logisticLossKg:finite(removed),conversionKg:finite(converted),costCOP:finite(cost),
      hours:finite(hours),distanceKm:finite(travelKm),trips,warning});
  }
  const packagingUnits=scenario.packageKg>0?Math.ceil(mass/scenario.packageKg):0;
  const packagingCost=packagingUnits*Math.max(0,scenario.packageCost);
  const otherCost=Math.max(0,scenario.extraCost);
  const totalCost=transportCost+operationCost+packagingCost+otherCost;
  const volumeM3=scenario.packageVolumeM3&&scenario.packageKg>0?packagingUnits*scenario.packageVolumeM3:null;
  const massBalanceErrorKg=scenario.initialKg-mass-lossKg-conversionKg;
  if(Math.abs(massBalanceErrorKg)>0.000001)warnings.push("Balance de masa inconsistente.");
  return {
    scenarioId:scenario.id,iteration,initialKg:scenario.initialKg,deliveredKg:mass,
    lossKg,conversionKg,transportCost,operationCost,packagingCost,otherCost,totalCost,
    costPerDeliveredKg:mass>0?totalCost/mass:null,totalKm,totalHours,totalTrips,volumeM3,
    massBalanceErrorKg,warnings,details
  };
}
export function validateAgroModel(value:unknown):value is AgroModel {
  if(!value||typeof value!=="object")return false;
  const m=value as Partial<AgroModel>;
  return m.version===1&&Array.isArray(m.scenarios)&&Array.isArray(m.operations)&&Array.isArray(m.vehicles)
    && m.scenarios.every(s=>typeof s.id==="string"&&Array.isArray(s.steps)&&Number.isFinite(s.initialKg))
    &&!!m.transportFactors&&!!m.acondSensitivity&&!!m.transformCapacityKgH;
}
