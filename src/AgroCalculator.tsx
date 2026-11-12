import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { calculateAgro, copyStarterModel, ITERATIONS, validateAgroModel,
  type AgroModel, type AgroScenario, type AgroStep, type GeoPoint, type Iteration } from "../lib/agro-calculator";
import { getRoute } from "../lib/routing";
import { DEFAULT_CONFIG, type LogisticsNode } from "../lib/domain";
import "./agro.css";

const fmt=(v:number,digits=0)=>new Intl.NumberFormat("es-CO",{maximumFractionDigits:digits}).format(Number.isFinite(v)?v:0);
const cop=(v:number)=>"$ "+fmt(v);
const number=(v:number)=>Number.isFinite(v)?v:0;
const colors=["#1d7555","#db8b31","#5678a6","#9654a6","#bb5541"];
type TStep=Extract<AgroStep,{kind:"transport"}>;
function PointFields({point,onUpdate}:{point:GeoPoint;onUpdate:(p:GeoPoint)=>void}){
 return <div className="agro-grid agro-3">
  <label>Nombre del punto<input value={point.name} onChange={e=>onUpdate({...point,name:e.target.value})}/></label>
  <label>Latitud<input type="number" step=".0001" value={point.lat} onChange={e=>onUpdate({...point,lat:number(+e.target.value)})}/></label>
  <label>Longitud<input type="number" step=".0001" value={point.lng} onChange={e=>onUpdate({...point,lng:number(+e.target.value)})}/></label>
 </div>;
}
const numInput=(label:string,value:number,onChange:(v:number)=>void,step=1)=><label>{label}<input type="number" min="0" step={step} value={value} onChange={e=>onChange(number(+e.target.value))}/></label>;

export default function AgroCalculator(){
 const [model,setModel]=useState<AgroModel>(()=>{try{const stored=localStorage.getItem("geoflujo-agro-v1");if(stored){const x:unknown=JSON.parse(stored);if(validateAgroModel(x))return x;}}catch{}return copyStarterModel();});
 const [selectedId,setSelectedId]=useState("E1");
 const [iteration,setIteration]=useState<Iteration>("base");
 const [compare,setCompare]=useState(true);
 const [tab,setTab]=useState<"scenario"|"parameters"|"sources">("scenario");
 const [routing,setRouting]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const upload=useRef<HTMLInputElement>(null);
 const scenario=model.scenarios.find(s=>s.id===selectedId)??model.scenarios[0];
 const results=useMemo(()=>model.scenarios.map(s=>({scenario:s,result:calculateAgro(model,s,iteration)})),[model,iteration]);
 const active=results.find(r=>r.scenario.id===scenario.id)!.result;
 const money=(v:number)=>cop(v);
 const persist=(next:AgroModel)=>{setModel(next);try{localStorage.setItem("geoflujo-agro-v1",JSON.stringify(next));}catch{setNotice("No se pudieron guardar los cambios en este navegador.");}};
 const updateScenario=(patch:Partial<AgroScenario>)=>persist({...model,scenarios:model.scenarios.map(s=>s.id===scenario.id?{...s,...patch}:s)});
 const updateStep=(id:string,update:(s:AgroStep)=>AgroStep)=>updateScenario({steps:scenario.steps.map(s=>s.id===id?update(s):s)});
 const updateOperation=(id:string,field:"costPerKg"|"fixedCost"|"fixedMinutes"|"minutesPerKg"|"source"|"note",value:string|number)=>
   persist({...model,operations:model.operations.map(op=>op.id===id?{...op,[field]:value}:op)});
 const updateVehicle=(id:string,field:"capacityKg"|"capacityM3"|"costPerKm"|"source",value:string|number)=>
   persist({...model,vehicles:model.vehicles.map(v=>v.id===id?{...v,[field]:value}:v)});
 const updateProfile=(key:"transportFactors"|"acondSensitivity"|"transformCapacityKgH",it:Iteration,value:number)=>
   persist({...model,[key]:{...model[key],[it]:value}});
 const download=()=>{const a=document.createElement("a");const b=new Blob([JSON.stringify(model,null,2)],{type:"application/json"});a.href=URL.createObjectURL(b);a.download="geoflujo-escenarios-agropecuarios.json";a.click();URL.revokeObjectURL(a.href);};
 const readUpload=async(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;try{
  const value:unknown=JSON.parse(await f.text());if(!validateAgroModel(value))throw Error("No corresponde al formato de escenarios GeoFlujo.");
  persist(value);setSelectedId(value.scenarios[0]?.id??"E1");setNotice("Archivo de escenarios cargado.");
 }catch(err){setNotice(err instanceof Error?err.message:"Archivo no válido.");} e.target.value="";};
 const clone=()=>{const newId="E"+(Math.max(0,...model.scenarios.map(s=>Number(s.id.replace(/\D/g,""))||0))+1);
 const fresh={...scenario,id:newId,name:scenario.name+" (copia)",steps:scenario.steps.map(s=>({...s,id:newId+"-"+s.id}))};
 persist({...model,scenarios:[...model.scenarios,fresh]});setSelectedId(newId);setNotice("Nueva configuración creada. Edita sus parámetros.");};
 const recalc=async(step:TStep)=>{setRouting(step.id);setNotice("");
 try{
  const makeNode=(point:GeoPoint,id:string):LogisticsNode=>({id,name:point.name,lat:point.lat,lng:point.lng,role:id==="origen"?"producer":"customer",quantityKg:0,capacityKg:0,fixedCost:0,serviceMin:0,forcedOpen:false});
  const result=await getRoute([makeNode(step.from,"origen"),makeNode(step.to,"destino")],DEFAULT_CONFIG);
  updateStep(step.id,s=>s.kind==="transport"?{...s,distanceKm:result.distanceKm,hours:result.durationMin/60,source:result.source==="osrm"?"osrm":"estimada",path:result.coordinates}:s);
  setNotice(result.source==="osrm"?"Ruta vial recalculada con OSRM. El costo manual se conserva hasta que lo desactives.":"OSRM no respondió. Distancia estimada marcada como tal.");
 }catch(err){setNotice(err instanceof Error?err.message:"No se pudo calcular ruta.");}finally{setRouting(null);}};
 const makeStep=(kind:AgroStep["kind"])=>{const id="paso-"+Date.now();
 const item:AgroStep=kind==="operation"?{id,kind,label:"Nueva operación",operationId:model.operations[0].id}:
 kind==="loss"?{id,kind,label:"Nueva merma",rates:{optimista:0,base:0,conservador:0}}:
 kind==="transform"?{id,kind,label:"Nueva transformación",operationId:"OP_DESPULP",yields:{optimista:.75,base:.675,conservador:.60}}:
 {id,kind,label:"Nuevo transporte",from:{name:"Origen",lat:4.15,lng:-74.88},to:{name:"Destino",lat:5.53,lng:-73.37},distanceKm:0,hours:0,tolls:0,manualCost:0,surcharge:0,useManualCost:false,vehicleId:"V3",source:"manual"};
 updateScenario({steps:[...scenario.steps,item]});};
 const stepsMap=(s:AgroStep)=>s.kind==="transport"?s.label+" · "+fmt(s.distanceKm,1)+" km":s.label;
 return <div className="agro-shell">
  <header className="agro-head"><div><a href="./" className="agro-back">← GeoFlujo · mapa y rutas</a><h1>Calculadora de escenarios agrologísticos</h1><p>Región Central · modelo editable por producto, mercado, operación y tramo.</p></div>
   <div className="agro-head-actions"><button onClick={download}>Exportar JSON</button><input ref={upload} type="file" hidden accept=".json,application/json" onChange={readUpload}/><button onClick={()=>upload.current?.click()}>Importar JSON</button><button onClick={()=>{if(window.confirm("¿Restablecer el caso inicial de mango?")){persist(copyStarterModel());setSelectedId("E1");}}}>Restablecer</button></div>
  </header>
  <div className="agro-banner"><strong>Prototipo metodológico · no es una cotización</strong><span>Datos de calibración tomados del Excel: Espinal–Tunja, mango Tommy. Revisa fuentes, tarifas, mermas y viabilidad antes de usar para decisiones.</span></div>
  {notice&&<div className="agro-notice" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Cerrar aviso">×</button></div>}
  <div className="agro-grid agro-main">
   <aside className="agro-card agro-sidebar">
    <div className="agro-section-title"><h2>Configuraciones</h2><button onClick={clone}>+ Duplicar</button></div>
    {model.scenarios.map((s,index)=><button key={s.id} className={"agro-scenario "+(scenario.id===s.id?"selected":"")} onClick={()=>{setSelectedId(s.id);setTab("scenario");}}>
     <span className="agro-swatch" style={{background:colors[index%colors.length]}}/><span><strong>{s.id} · {s.name}</strong><small>{s.market}</small></span>
    </button>)}
    <hr/>
    <h3>Iteración</h3><div className="agro-segments">{ITERATIONS.map(it=><button key={it} className={iteration===it?"selected":""} onClick={()=>setIteration(it)}>{it}</button>)}</div>
    <label className="agro-check"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/> Comparar todas las configuraciones</label>
    <div className="agro-model-info"><strong>Producto: {model.product} · {model.variety}</strong><p>{model.productSource}</p><p>Los cambios se guardan solo en este navegador. Usa JSON para transferirlos o versionarlos.</p></div>
   </aside>
   <main className="agro-content">
    <div className="agro-card">
     <div className="agro-section-title"><div><small className="agro-eyebrow">{scenario.id} / {scenario.status} · {scenario.pending} pendientes de origen</small><h2>{scenario.name}</h2><p>{scenario.note}</p></div></div>
     <div className="agro-kpis">
      <div><small>Costo del escenario</small><strong>{money(active.totalCost)}</strong></div>
      <div><small>Costo / kg entregado</small><strong>{active.costPerDeliveredKg===null?"No definido":money(active.costPerDeliveredKg)}</strong></div>
      <div><small>Cantidad entregada</small><strong>{fmt(active.deliveredKg,1)} kg</strong></div>
      <div><small>Merma logística</small><strong>{fmt(active.lossKg,1)} kg</strong></div>
      <div><small>Conversión / otras salidas</small><strong>{fmt(active.conversionKg,1)} kg</strong></div>
      <div><small>Distancia recorrida</small><strong>{fmt(active.totalKm,1)} km</strong></div>
     </div>
     <div className="agro-mini">Tiempo acumulado {fmt(active.totalHours,2)} h · Viajes contabilizados {fmt(active.totalTrips)} · Error del balance de masa {fmt(active.massBalanceErrorKg,6)} kg</div>
    </div>
    <div className="agro-tabs"><button className={tab==="scenario"?"active":""} onClick={()=>setTab("scenario")}>Secuencia y costos</button><button className={tab==="parameters"?"active":""} onClick={()=>setTab("parameters")}>Parámetros comunes</button><button className={tab==="sources"?"active":""} onClick={()=>setTab("sources")}>Fuentes y alertas</button></div>
    {tab==="scenario"&&<div className="agro-card">
     <div className="agro-grid agro-3">{numInput("Cantidad inicial (kg)",scenario.initialKg,v=>updateScenario({initialKg:v}))}{numInput("Capacidad del empaque (kg)",scenario.packageKg,v=>updateScenario({packageKg:v}))}{numInput("Costo empaque (COP / unidad)",scenario.packageCost,v=>updateScenario({packageCost:v}))}{numInput("Volumen externo empaque (m³/unidad; 0 = desconocido)",scenario.packageVolumeM3??0,v=>updateScenario({packageVolumeM3:v||null}),.001)}{numInput("Otros costos (COP)",scenario.extraCost,v=>updateScenario({extraCost:v}))}<label>Nombre de configuración<input value={scenario.name} onChange={e=>updateScenario({name:e.target.value})}/></label></div>
     <label>Perfil del mercado<input value={scenario.market} onChange={e=>updateScenario({market:e.target.value})}/></label>
     <div className="agro-section-title"><h3>Secuencia de operaciones, transformación y transporte</h3><small>Los pasos se calculan en orden. Los costos se acumulan; solo mermas y transformaciones cambian masa.</small></div>
     {scenario.steps.map((step,index)=>{const detail=active.details[index];return <details className="agro-step" key={step.id}>
      <summary><span className="agro-step-index">{index+1}</span><span className="agro-step-text"><strong>{stepsMap(step)}</strong><small>{step.kind==="operation"?"Operación":step.kind==="transport"?"Transporte":step.kind==="loss"?"Merma logística":"Conversión de materia prima"} · {fmt(detail?.outputKg??0,1)} kg de salida</small></span><strong>{money(detail?.costCOP??0)}</strong></summary>
      <div className="agro-step-edit">
       <label>Nombre del paso<input value={step.label} onChange={e=>updateStep(step.id,v=>({...v,label:e.target.value}))}/></label>
       {step.kind==="operation"&&<label>Operación<select value={step.operationId} onChange={e=>updateStep(step.id,v=>v.kind==="operation"?{...v,operationId:e.target.value}:v)}>{model.operations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
       {step.kind==="transport"&&<>
        <h4>Origen</h4><PointFields point={step.from} onUpdate={from=>updateStep(step.id,v=>v.kind==="transport"?{...v,from}:v)}/>
        <h4>Destino</h4><PointFields point={step.to} onUpdate={to=>updateStep(step.id,v=>v.kind==="transport"?{...v,to}:v)}/>
        <div className="agro-grid agro-3">
         {numInput("Distancia km",step.distanceKm,x=>updateStep(step.id,v=>v.kind==="transport"?{...v,distanceKm:x,source:"manual",path:undefined}:v),.001)}
         {numInput("Duración viaje horas",step.hours,x=>updateStep(step.id,v=>v.kind==="transport"?{...v,hours:x,source:"manual"}:v),.01)}
         {numInput("Peajes COP / viaje",step.tolls,x=>updateStep(step.id,v=>v.kind==="transport"?{...v,tolls:x}:v))}
         {numInput("Costo manual COP / viaje",step.manualCost,x=>updateStep(step.id,v=>v.kind==="transport"?{...v,manualCost:x}:v))}
         {numInput("Recargo transporte (%)",step.surcharge*100,x=>updateStep(step.id,v=>v.kind==="transport"?{...v,surcharge:x/100}:v),.1)}
         <label>Vehículo<select value={step.vehicleId} onChange={e=>updateStep(step.id,v=>v.kind==="transport"?{...v,vehicleId:e.target.value}:v)}>{model.vehicles.map(vehicle=><option value={vehicle.id} key={vehicle.id}>{vehicle.name}</option>)}</select></label>
        </div><label className="agro-check"><input type="checkbox" checked={step.useManualCost} onChange={e=>updateStep(step.id,v=>v.kind==="transport"?{...v,useManualCost:e.target.checked}:v)}/> Utilizar costo manual del Excel (si se desactiva: distancia × tarifa COP/km × viajes)</label>
        <div className="agro-actions"><button onClick={()=>void recalc(step)} disabled={routing!==null}>{routing===step.id?"Consultando OSRM…":"Actualizar distancia/tiempo con OSRM"}</button><small>Fuente ruta: {step.source}. OSRM puede usar localizaciones referenciales; no sustituye validación de nodos.</small></div>
       </>}
       {(step.kind==="loss"||step.kind==="transform")&&<div className="agro-grid agro-3">{ITERATIONS.map(it=>numInput(it+" (%)",100*(step.kind==="loss"?step.rates[it]:step.yields[it]),x=>updateStep(step.id,v=>v.kind==="loss"?{...v,rates:{...v.rates,[it]:Math.min(1,x/100)}}:v.kind==="transform"?{...v,yields:{...v.yields,[it]:Math.min(1,x/100)}}:v),.01))}</div>}
       {step.kind==="transform"&&<p>El rendimiento transforma masa de materia prima en producto; la diferencia no se reporta automáticamente como pérdida logística.</p>}
       {detail?.warning&&<p className="agro-warning">{detail.warning}</p>}
       <div className="agro-actions">
        <button onClick={()=>{if(index>0){const next=[...scenario.steps];[next[index-1],next[index]]=[next[index],next[index-1]];updateScenario({steps:next});}}} disabled={index===0}>↑ Mover</button>
        <button onClick={()=>{if(index<scenario.steps.length-1){const next=[...scenario.steps];[next[index],next[index+1]]=[next[index+1],next[index]];updateScenario({steps:next});}}} disabled={index===scenario.steps.length-1}>↓ Mover</button>
        <button onClick={()=>updateScenario({steps:scenario.steps.filter(v=>v.id!==step.id)})}>Eliminar paso</button>
       </div>
      </div>
     </details>})}
     <div className="agro-actions agro-add"><button onClick={()=>makeStep("operation")}>+ Operación</button><button onClick={()=>makeStep("transport")}>+ Transporte</button><button onClick={()=>makeStep("loss")}>+ Merma</button><button onClick={()=>makeStep("transform")}>+ Transformación</button></div>
    </div>}
    {tab==="parameters"&&<div className="agro-card">
     <h3>Parámetros por iteración</h3><div className="agro-table-wrap"><table><thead><tr><th>Parámetro</th>{ITERATIONS.map(it=><th key={it}>{it}</th>)}</tr></thead><tbody>
      {(["transportFactors","acondSensitivity","transformCapacityKgH"] as const).map(key=><tr key={key}><th>{({transportFactors:"Factor transporte",acondSensitivity:"Acondicionamiento (COP/kg)",transformCapacityKgH:"Capacidad de transformación (kg/h)"})[key]}</th>{ITERATIONS.map(it=><td key={it}><input type="number" min="0" step=".01" value={model[key][it]} onChange={e=>updateProfile(key,it,+e.target.value)}/></td>)}</tr>)}
     </tbody></table></div>
     <h3>Catálogo editable de operaciones</h3><div className="agro-table-wrap"><table><thead><tr><th>Operación</th><th>COP/kg</th><th>Costo fijo</th><th>Tiempo fijo (min)</th><th>Min/kg</th><th>Fuente</th><th>Observación</th></tr></thead><tbody>{model.operations.map(op=><tr key={op.id}><th>{op.name}</th>{(["costPerKg","fixedCost","fixedMinutes","minutesPerKg"] as const).map(key=><td key={key}><input type="number" step=".01" min="0" value={op[key]} onChange={e=>updateOperation(op.id,key,+e.target.value)}/></td>)}<td><input value={op.source} onChange={e=>updateOperation(op.id,"source",e.target.value)}/></td><td><input value={op.note} onChange={e=>updateOperation(op.id,"note",e.target.value)}/></td></tr>)}</tbody></table></div>
     <h3>Vehículos: capacidad por peso y volumen</h3><div className="agro-table-wrap"><table><thead><tr><th>Vehículo</th><th>Capacidad kg</th><th>Capacidad m³</th><th>COP/km</th><th>Fuente</th></tr></thead><tbody>{model.vehicles.map(v=><tr key={v.id}><th>{v.name}</th>{(["capacityKg","capacityM3","costPerKm"] as const).map(key=><td key={key}><input type="number" min="0" step=".01" value={v[key]} onChange={e=>updateVehicle(v.id,key,+e.target.value)}/></td>)}<td><input value={v.source} onChange={e=>updateVehicle(v.id,"source",e.target.value)}/></td></tr>)}</tbody></table></div>
    </div>}
    {tab==="sources"&&<div className="agro-card">
     <h3>Alertas y cobertura de este escenario</h3><p>El cálculo distingue merma, conversión, costos operacionales, empaque y transporte. No demuestra viabilidad comercial, sanitaria ni regulatoria.</p>
     <ul>{[...new Set(active.warnings)].map((msg,i)=><li key={i}>{msg}</li>)}</ul>
     <h3>Fuentes identificadas en el libro inicial</h3><p>Las claves SRC_COSTOS, SRC_ESC_TOLIMA y SRC_SUPUESTO son referencias internas o supuestos de trabajo. SRC_DANE_MANGO_TUNJA_2019 es un dato histórico; SRC_CAL_LAB_2026 y SRC_CAL_DESP_2026 son aproximaciones, no cotizaciones.</p>
     <p>Para contrastar datos del piloto: DANE/SIPSA, AGROSAVIA, SICE-TAC, ICA/INVIMA y los anexos operativos del proyecto. Debe anotarse fuente, fecha y vigencia de cada actualización.</p>
     <p>El escenario E3 conserva la primera milla agregada del Excel: la geometría referencial no representa las rutas de sus cinco productores. En E5 el rendimiento de pulpa se informa como conversión, no como merma.</p>
    </div>}
   </main>
   <aside className="agro-side-results">
    <div className="agro-card"><h2>Composición del costo</h2>
     {([{name:"Transporte y peajes",value:active.transportCost},{name:"Operaciones",value:active.operationCost},{name:"Empaque",value:active.packagingCost},{name:"Otros costos",value:active.otherCost}]).map((item,index)=><div key={item.name} className="agro-cost-row"><div><span>{item.name}</span><strong>{money(item.value)}</strong></div><div className="agro-bar"><i style={{width:(active.totalCost?item.value/active.totalCost*100:0)+"%",background:colors[index]}}/></div></div>)}
     <div className="agro-outcome"><small>Balance de la materia prima</small><p>Inicial: {fmt(active.initialKg,1)} kg</p><p>Final: {fmt(active.deliveredKg,1)} kg</p><p>Merma: {fmt(active.lossKg,1)} kg</p><p>Conversión: {fmt(active.conversionKg,1)} kg</p></div>
    </div>
    {compare&&<div className="agro-card"><h2>Comparador · {iteration}</h2>{results.map((r,index)=><button key={r.scenario.id} onClick={()=>setSelectedId(r.scenario.id)} className="agro-compare">
      <span className="agro-swatch" style={{background:colors[index%colors.length]}}/>
      <span><strong>{r.scenario.id} · {r.scenario.name}</strong><small>{fmt(r.result.deliveredKg,1)} kg entregados · {r.scenario.status}</small></span>
      <strong>{money(r.result.costPerDeliveredKg??0)}<small>/kg</small></strong>
     </button>)}<small>No compara productos transformados como si un kg final equivaliera a un kg fresco. Revisar rendimiento y mercado antes de concluir.</small></div>}
   </aside>
  </div>
 </div>;
}
