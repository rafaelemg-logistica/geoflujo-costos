"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, Polyline } from "leaflet";
import {
  DEFAULT_CONFIG,
  DEFAULT_VEHICLES,
  ROLE_LABELS,
  type LogisticsNode,
  type NodeRole,
  type OptimizationResult,
  type PlannedRoute,
  type RoadFeature,
  type Scenario,
  type ScenarioConfig,
  type TollFeature,
  type Vehicle,
} from "../lib/domain";
import { calculateQuickRoute, optimizeScenario } from "../lib/logistics";
import { downloadFile, parseGeoJson, parseNodesCsv, resultGeoJson, resultsCsv, scenarioJson, scenarioTemplateCsv } from "../lib/io";

type Mode = "quick" | "scenario";

const ROLE_COLORS: Record<NodeRole, string> = { producer: "#2d8a67", center: "#f2a33c", hub: "#614ea6", customer: "#d45438" };
const STAGE_COLORS: Record<PlannedRoute["stage"], string> = { collection: "#2d8a67", trunk: "#614ea6", lastMile: "#e26734", quick: "#e26734" };

function newNode(lat: number, lng: number, role: NodeRole, index: number): LogisticsNode {
  const defaults = { producer: { quantityKg: 3000, capacityKg: 0 }, center: { quantityKg: 0, capacityKg: 12000 }, hub: { quantityKg: 0, capacityKg: 0 }, customer: { quantityKg: 1000, capacityKg: 0 } }[role];
  return { id: crypto.randomUUID(), name: `${ROLE_LABELS[role]} ${index + 1}`, role, lat, lng, quantityKg: defaults.quantityKg, capacityKg: defaults.capacityKg, fixedCost: role === "center" ? 500000 : 0, serviceMin: role === "customer" ? 20 : 0, forcedOpen: false };
}

function demoNodes(): LogisticsNode[] {
  return [
    { ...newNode(4.91, -74.12, "producer", 0), id: "P1", name: "Productor norte", quantityKg: 3000 },
    { ...newNode(4.79, -74.04, "producer", 1), id: "P2", name: "Productor oriente", quantityKg: 2200 },
    { ...newNode(4.73, -74.08, "center", 0), id: "C1", name: "Centro regional", capacityKg: 8000, forcedOpen: true },
    { ...newNode(4.66, -74.09, "hub", 0), id: "H1", name: "Nodo de distribucion" },
    { ...newNode(4.61, -74.13, "customer", 0), id: "D1", name: "Cliente occidente", quantityKg: 2600 },
    { ...newNode(4.64, -74.02, "customer", 1), id: "D2", name: "Cliente oriente", quantityKg: 2600 },
  ];
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits }).format(value);
}

function updateAt<T>(items: T[], index: number, patch: Partial<T>) {
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const routesRef = useRef<Polyline[]>([]);
  const modeRef = useRef<Mode>("quick");
  const selectedRoleRef = useRef<NodeRole>("producer");
  const [mode, setMode] = useState<Mode>("quick");
  const [nodes, setNodes] = useState<LogisticsNode[]>([]);
  const [selectedRole, setSelectedRole] = useState<NodeRole>("producer");
  const [vehicles, setVehicles] = useState<Vehicle[]>(DEFAULT_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState(DEFAULT_VEHICLES[1].id);
  const [config, setConfig] = useState<ScenarioConfig>(DEFAULT_CONFIG);
  const [quickLoadKg, setQuickLoadKg] = useState(3000);
  const [quickResult, setQuickResult] = useState<PlannedRoute | null>(null);
  const [scenarioResult, setScenarioResult] = useState<OptimizationResult | null>(null);
  const [roads, setRoads] = useState<RoadFeature[]>([]);
  const [tolls, setTolls] = useState<TollFeature[]>([]);
  const [status, setStatus] = useState("Haz clic sobre el mapa para agregar el primer punto.");
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);

  const visibleRoutes = useMemo(() => mode === "quick" ? (quickResult ? [quickResult] : []) : (scenarioResult?.routes ?? []), [mode, quickResult, scenarioResult]);
  const currency = useMemo(() => {
    try { return new Intl.NumberFormat(config.locale || "es-CO", { style: "currency", currency: config.currency || "COP", maximumFractionDigits: 0 }); }
    catch { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
  }, [config.currency, config.locale]);

  const invalidate = useCallback((message = "Datos actualizados. Ejecuta de nuevo el calculo.") => {
    setQuickResult(null);
    setScenarioResult(null);
    setStatus(message);
  }, []);

  useEffect(() => {
    let active = true;
    import("leaflet").then((module) => {
      if (!active || !mapNode.current || mapRef.current) return;
      const L = module.default;
      const map = L.map(mapNode.current, { zoomControl: false, minZoom: 2 }).setView([4.65, -74.08], 8);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        setNodes((current) => {
          if (current.length >= 30) { setStatus("El modo publico admite hasta 30 nodos."); return current; }
          const role = modeRef.current === "quick" ? "producer" : selectedRoleRef.current;
          const node = newNode(event.latlng.lat, event.latlng.lng, role, current.length);
          if (modeRef.current === "quick") node.name = current.length === 0 ? "Origen" : `Parada ${current.length}`;
          return [...current, node];
        });
        setQuickResult(null);
        setScenarioResult(null);
        setStatus("Punto agregado. Puedes arrastrarlo o editar sus datos.");
      });
      mapRef.current = map;
      setMapReady(true);
    });
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    import("leaflet").then((module) => {
      if (cancelled || !mapRef.current || !markersRef.current) return;
      const L = module.default;
      markersRef.current.clearLayers();
      routesRef.current.forEach((route) => route.remove());
      routesRef.current = [];
      nodes.forEach((node, index) => {
        const color = mode === "quick" ? "#e26734" : ROLE_COLORS[node.role];
        const marker = L.marker([node.lat, node.lng], {
          draggable: true,
          icon: L.divIcon({ className: "map-marker-shell", html: `<span class="map-marker" style="--marker:${color}">${index + 1}</span>`, iconSize: [34, 42], iconAnchor: [17, 38] }),
        }).bindTooltip(node.name, { direction: "top", offset: [0, -28] });
        marker.on("dragend", (event) => {
          const point = event.target.getLatLng();
          setNodes((current) => current.map((item) => item.id === node.id ? { ...item, lat: point.lat, lng: point.lng } : item));
          invalidate("Punto movido. Ejecuta de nuevo el calculo.");
        });
        marker.addTo(markersRef.current!);
      });
      visibleRoutes.forEach((route) => {
        routesRef.current.push(L.polyline(route.coordinates, { color: STAGE_COLORS[route.stage], weight: route.stage === "trunk" ? 7 : 5, opacity: 0.86, lineCap: "round" }).bindTooltip(`${route.id} · ${currency.format(route.cost.total)}`).addTo(mapRef.current!));
      });
      if (visibleRoutes.length) {
        const coordinates = visibleRoutes.flatMap((route) => route.coordinates);
        if (coordinates.length) mapRef.current.fitBounds(L.latLngBounds(coordinates).pad(0.12));
      } else if (nodes.length > 1) mapRef.current.fitBounds(L.latLngBounds(nodes.map((node) => [node.lat, node.lng])).pad(0.18));
    });
    return () => { cancelled = true; };
  }, [currency, invalidate, mapReady, mode, nodes, visibleRoutes]);

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setNodes([]);
    setQuickResult(null);
    setScenarioResult(null);
    setStatus(nextMode === "quick" ? "Marca un origen y un destino sobre el mapa." : "Selecciona un rol y agrega los nodos del escenario.");
  };

  const calculate = async () => {
    setLoading(true);
    try {
      if (mode === "quick") {
        if (nodes.length < 2) throw new Error("Selecciona al menos un origen y un destino.");
        const vehicle = vehicles.find((item) => item.id === selectedVehicleId) ?? vehicles[0];
        const result = await calculateQuickRoute(nodes, vehicle, config, quickLoadKg, roads, tolls);
        setQuickResult(result);
        setStatus(result.source === "osrm" ? "Ruta calculada con la red vial abierta." : "OSRM no respondio; se uso la estimacion geodesica de contingencia.");
      } else {
        const result = await optimizeScenario(nodes, vehicles, config, roads, tolls);
        setScenarioResult(result);
        setStatus(`Escenario optimizado: ${result.routes.length} rutas y ${result.openCenterIds.length} centros abiertos.`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "No fue posible completar el calculo."); }
    finally { setLoading(false); }
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".csv")) {
        const imported = parseNodesCsv(text);
        if (imported.length > 30) throw new Error("El archivo supera el limite de 30 nodos");
        setNodes(imported);
        invalidate(`${imported.length} nodos importados desde CSV.`);
        return;
      }
      const json = JSON.parse(text);
      if (json.version === 1 && Array.isArray(json.nodes)) {
        const scenario = json as Scenario;
        setNodes(scenario.nodes.slice(0, 30));
        setVehicles(scenario.vehicles);
        setConfig(scenario.config);
        invalidate("Escenario JSON restaurado.");
        return;
      }
      const parsed = parseGeoJson(text);
      if (parsed.nodes.length) setNodes(parsed.nodes.slice(0, 30));
      if (parsed.roads.length) setRoads(parsed.roads);
      if (parsed.tolls.length) setTolls(parsed.tolls);
      invalidate(`GeoJSON importado: ${parsed.nodes.length} nodos, ${parsed.roads.length} vias y ${parsed.tolls.length} peajes.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Archivo no valido."); }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return setStatus("El navegador no permite consultar la ubicacion.");
    setStatus("Buscando tu ubicacion...");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setNodes((current) => [...current, newNode(coords.latitude, coords.longitude, mode === "quick" ? "producer" : selectedRole, current.length)]);
      mapRef.current?.setView([coords.latitude, coords.longitude], 13);
      invalidate("Ubicacion agregada al mapa.");
    }, () => setStatus("No se pudo obtener tu ubicacion; marca el punto manualmente."), { enableHighAccuracy: true, timeout: 10000 });
  };

  const setNode = (index: number, patch: Partial<LogisticsNode>) => { setNodes((current) => updateAt(current, index, patch)); invalidate(); };
  const setVehicle = (index: number, patch: Partial<Vehicle>) => { setVehicles((current) => updateAt(current, index, patch)); invalidate(); };
  const moveNode = (index: number, delta: number) => {
    setNodes((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
    invalidate("Orden de paradas actualizado.");
  };

  const scenario: Scenario = { version: 1, name: "Escenario GeoFlujo", nodes, vehicles, config };
  const total = mode === "quick" ? quickResult?.cost.total : scenarioResult?.totalCost;

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="GeoFlujo Costos, inicio"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>GeoFlujo</strong> Costos</span></a>
        <nav className="mode-switch" aria-label="Modo de calculo">
          <button className={mode === "quick" ? "active" : ""} onClick={() => switchMode("quick")}>Ruta rapida</button>
          <button className={mode === "scenario" ? "active" : ""} onClick={() => switchMode("scenario")}>Escenario logistico</button>
        </nav>
        <a className="github-link" href="https://github.com/rafaelemg-logistica/geoflujo-costos" target="_blank" rel="noreferrer">Codigo abierto ↗</a>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <div className="intro-block">
            <span className="eyebrow">{mode === "quick" ? "Calculo inmediato" : "Modelo multietapa"}</span>
            <h1>{mode === "quick" ? "Dibuja el recorrido. Entiende el costo." : "Modela el flujo completo en un mapa abierto."}</h1>
            <p>{mode === "quick" ? "Marca puntos en orden, ajusta el vehiculo y calcula una ruta vial sin licencias propietarias." : "Configura productores, centros, nodos de distribucion y clientes; GeoFlujo asigna capacidades y planea la ultima milla."}</p>
          </div>

          {mode === "scenario" && <section className="panel-section role-picker">
            <div className="section-heading"><div><span className="step">01</span><h2>Agregar nodos</h2></div><button className="text-button" onClick={() => { setNodes(demoNodes()); invalidate("Escenario demostrativo cargado."); }}>Cargar demo</button></div>
            <div className="role-grid">{(Object.keys(ROLE_LABELS) as NodeRole[]).map((role) => <button key={role} className={selectedRole === role ? "selected" : ""} style={{ "--role": ROLE_COLORS[role] } as React.CSSProperties} onClick={() => setSelectedRole(role)}><i />{ROLE_LABELS[role]}</button>)}</div>
          </section>}

          <section className="panel-section">
            <div className="section-heading"><div><span className="step">{mode === "quick" ? "01" : "02"}</span><h2>{mode === "quick" ? "Paradas" : `Nodos (${nodes.length}/30)`}</h2></div><button className="icon-button" onClick={locateMe} title="Usar mi ubicacion">◎</button></div>
            {!nodes.length && <div className="empty-state"><span>＋</span><p>Haz clic en el mapa o importa un archivo.</p></div>}
            <div className="node-list">{nodes.map((node, index) => <article className="node-card" key={node.id} style={{ "--role": mode === "quick" ? "#e26734" : ROLE_COLORS[node.role] } as React.CSSProperties}>
              <div className="node-row"><span className="node-index">{index + 1}</span><input aria-label={`Nombre del punto ${index + 1}`} value={node.name} onChange={(event) => setNode(index, { name: event.target.value })} /><button className="remove-button" onClick={() => { setNodes((current) => current.filter((_, itemIndex) => itemIndex !== index)); invalidate("Punto eliminado."); }} aria-label={`Eliminar ${node.name}`}>×</button></div>
              {mode === "quick" ? <div className="node-meta"><span>{node.lat.toFixed(5)}, {node.lng.toFixed(5)}</span><div><button onClick={() => moveNode(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveNode(index, 1)} disabled={index === nodes.length - 1}>↓</button></div></div> : <div className="node-fields">
                <label>Rol<select value={node.role} onChange={(event) => setNode(index, { role: event.target.value as NodeRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {(node.role === "producer" || node.role === "customer") && <label>{node.role === "producer" ? "Oferta kg" : "Demanda kg"}<input type="number" min="0" value={node.quantityKg} onChange={(event) => setNode(index, { quantityKg: Number(event.target.value) })} /></label>}
                {node.role === "center" && <><label>Capacidad kg<input type="number" min="0" value={node.capacityKg} onChange={(event) => setNode(index, { capacityKg: Number(event.target.value) })} /></label><label>Costo fijo<input type="number" min="0" value={node.fixedCost} onChange={(event) => setNode(index, { fixedCost: Number(event.target.value) })} /></label><label className="check-field"><input type="checkbox" checked={node.forcedOpen} onChange={(event) => setNode(index, { forcedOpen: event.target.checked })} /> Apertura forzada</label></>}
                {node.role === "customer" && <label>Servicio min<input type="number" min="0" value={node.serviceMin} onChange={(event) => setNode(index, { serviceMin: Number(event.target.value) })} /></label>}
              </div>}
            </article>)}</div>
            <div className="file-actions"><label className="secondary-button">Importar CSV/GeoJSON/JSON<input type="file" accept=".csv,.json,.geojson" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label><button className="text-button" onClick={() => downloadFile("plantilla_geoflujo_nodos.csv", scenarioTemplateCsv(), "text/csv;charset=utf-8")}>Descargar plantilla</button></div>
          </section>

          <section className="panel-section">
            <div className="section-heading"><div><span className="step">{mode === "quick" ? "02" : "03"}</span><h2>Vehiculos y costos</h2></div></div>
            {mode === "quick" ? <div className="form-grid">
              <label className="wide">Vehiculo<select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {formatNumber(vehicle.capacityKg, 0)} kg</option>)}</select></label>
              <label>Carga (kg)<input type="number" min="0" value={quickLoadKg} onChange={(event) => { setQuickLoadKg(Number(event.target.value)); invalidate(); }} /></label>
              <label>Peajes por trayecto<input type="number" min="0" value={config.manualTolls} onChange={(event) => { setConfig({ ...config, manualTolls: Number(event.target.value) }); invalidate(); }} /></label>
              <label className="check-field wide"><input type="checkbox" checked={config.roundTrip} onChange={(event) => { setConfig({ ...config, roundTrip: event.target.checked }); invalidate(); }} /> Incluir regreso</label>
            </div> : <>
              <div className="vehicle-list">{vehicles.map((vehicle, index) => <details key={vehicle.id} className="vehicle-card" open={index === 0}><summary>{vehicle.name}<span>{formatNumber(vehicle.capacityKg, 0)} kg</span></summary><div className="form-grid"><label>Nombre<input value={vehicle.name} onChange={(event) => setVehicle(index, { name: event.target.value })} /></label><label>Capacidad kg<input type="number" min="1" value={vehicle.capacityKg} onChange={(event) => setVehicle(index, { capacityKg: Number(event.target.value) })} /></label><label>Costo/km<input type="number" min="0" value={vehicle.costPerKm} onChange={(event) => setVehicle(index, { costPerKm: Number(event.target.value) })} /></label><label>Costo/hora<input type="number" min="0" value={vehicle.costPerHour} onChange={(event) => setVehicle(index, { costPerHour: Number(event.target.value) })} /></label><label>Costo fijo<input type="number" min="0" value={vehicle.fixedCost} onChange={(event) => setVehicle(index, { fixedCost: Number(event.target.value) })} /></label><label>Categoria peaje<input value={vehicle.tollCategory} onChange={(event) => setVehicle(index, { tollCategory: event.target.value })} /></label></div></details>)}</div>
              <details className="advanced-card"><summary>Parametros del escenario</summary><div className="form-grid"><label>Moneda<input maxLength={3} value={config.currency} onChange={(event) => setConfig({ ...config, currency: event.target.value.toUpperCase() })} /></label><label>Max. centros<input type="number" min="1" value={config.maxCenters} onChange={(event) => setConfig({ ...config, maxCenters: Number(event.target.value) })} /></label><label>Factor contingencia<input type="number" min="1" step="0.05" value={config.fallbackDistanceFactor} onChange={(event) => setConfig({ ...config, fallbackDistanceFactor: Number(event.target.value) })} /></label><label>Velocidad contingencia<input type="number" min="1" value={config.fallbackSpeedKmh} onChange={(event) => setConfig({ ...config, fallbackSpeedKmh: Number(event.target.value) })} /></label><label>Peajes manuales<input type="number" min="0" value={config.manualTolls} onChange={(event) => setConfig({ ...config, manualTolls: Number(event.target.value) })} /></label><label>Overhead %<input type="number" min="0" value={config.nodeCosts.overheadPercent} onChange={(event) => setConfig({ ...config, nodeCosts: { ...config.nodeCosts, overheadPercent: Number(event.target.value) } })} /></label></div></details>
            </>}
          </section>

          <div className="calculate-dock"><button className="primary-button" onClick={calculate} disabled={loading}>{loading ? <><span className="spinner" />Calculando...</> : <>Calcular <span>→</span></>}</button><button className="clear-button" onClick={() => { setNodes([]); setQuickResult(null); setScenarioResult(null); setStatus("Mapa limpio. Agrega nuevos puntos."); }}>Limpiar</button></div>
        </aside>

        <section className="map-area" aria-label="Mapa interactivo">
          <div ref={mapNode} className="map-canvas" />
          <div className="map-hint"><span>＋</span> Clic para agregar · arrastra para ajustar</div>
          {mode === "scenario" && <div className="map-legend">{Object.entries(ROLE_LABELS).map(([role, label]) => <span key={role}><i style={{ background: ROLE_COLORS[role as NodeRole] }} />{label}</span>)}</div>}
          <div className={`status-toast ${status.toLowerCase().includes("no ") || status.toLowerCase().includes("requiere") ? "warning" : ""}`} role="status">{status}</div>
        </section>

        <aside className="results-panel">
          <div className="results-header"><span className="eyebrow">Resultado</span><h2>{total != null ? currency.format(total) : "Aun sin calcular"}</h2><p>{mode === "quick" ? "Costo total estimado del recorrido" : "Costo total del escenario"}</p></div>
          {mode === "quick" && quickResult && <ResultRoute route={quickResult} currency={currency} />}
          {mode === "scenario" && scenarioResult && <ScenarioResults result={scenarioResult} currency={currency} />}
          {!quickResult && !scenarioResult && <div className="result-placeholder"><div className="placeholder-route"><i /><span /><i /></div><h3>Tu analisis aparecera aqui</h3><p>Completa los puntos y parametros, luego ejecuta el calculo.</p></div>}
          {(quickResult || scenarioResult) && <div className="export-grid">
            {scenarioResult && <button onClick={() => downloadFile("geoflujo-resultados.csv", resultsCsv(scenarioResult), "text/csv;charset=utf-8")}>CSV</button>}
            {scenarioResult && <button onClick={() => downloadFile("geoflujo-rutas.geojson", resultGeoJson(nodes, scenarioResult), "application/geo+json")}>GeoJSON</button>}
            <button onClick={() => downloadFile("geoflujo-escenario.json", scenarioJson(scenario), "application/json")}>Escenario JSON</button>
          </div>}
          <footer className="data-note"><strong>Datos abiertos, calculo local.</strong><p>OSRM y OpenStreetMap son servicios comunitarios sin garantia operativa. GeoFlujo identifica cuando usa una estimacion.</p></footer>
        </aside>
      </section>
    </main>
  );
}

function ResultRoute({ route, currency }: { route: PlannedRoute; currency: Intl.NumberFormat }) {
  return <div className="result-content"><div className="metric-grid"><Metric label="Distancia" value={`${formatNumber(route.distanceKm)} km`} /><Metric label="Tiempo" value={`${formatNumber(route.durationMin, 0)} min`} /><Metric label="Viajes" value={String(route.trips)} /><Metric label="Fuente" value={route.source === "osrm" ? "Red vial" : "Estimada"} /></div><CostList route={route} currency={currency} /></div>;
}

function ScenarioResults({ result, currency }: { result: OptimizationResult; currency: Intl.NumberFormat }) {
  return <div className="result-content"><div className="metric-grid"><Metric label="Rutas" value={String(result.routes.length)} /><Metric label="Centros" value={String(result.openCenterIds.length)} /><Metric label="Costo/kg" value={currency.format(result.costPerKg)} /><Metric label="Estimadas" value={String(result.routes.filter((route) => route.source === "estimate").length)} /></div><div className="stage-list">{result.stages.filter((stage) => stage.stage !== "all").map((stage) => <div key={stage.stage}><span>{stage.stage === "collection" ? "Recoleccion" : stage.stage === "trunk" ? "Troncal" : "Ultima milla"}<small>{stage.routes} rutas · {formatNumber(stage.distanceKm)} km</small></span><strong>{currency.format(stage.cost)}</strong></div>)}</div><details className="validation-list"><summary>Validaciones ({result.validations.length})</summary>{result.validations.map((message, index) => <p key={`${message}-${index}`}>• {message}</p>)}</details></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function CostList({ route, currency }: { route: PlannedRoute; currency: Intl.NumberFormat }) {
  const labels: [keyof PlannedRoute["cost"], string][] = [["distance", "Distancia"], ["time", "Tiempo"], ["fixed", "Costo fijo"], ["tolls", "Peajes"], ["node", "Operacion en nodos"], ["overhead", "Overhead"]];
  return <div className="cost-list">{labels.map(([key, label]) => <div key={key}><span>{label}</span><strong>{currency.format(route.cost[key])}</strong></div>)}</div>;
}
