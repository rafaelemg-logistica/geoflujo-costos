import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layer, LayerGroup, Map as LeafletMap } from "leaflet";
import {
  DEFAULT_CONFIG,
  DEFAULT_VEHICLES,
  ROAD_CATEGORY_LABELS,
  ROLE_LABELS,
  type LogisticsNode,
  type NodeRole,
  type OptimizationResult,
  type PlannedRoute,
  type RoadCategory,
  type RoadFeature,
  type Scenario,
  type ScenarioConfig,
  type TollFeature,
  type Vehicle,
} from "../lib/domain";
import { buildAccumulatedRoadLoads, calculateQuickRoute, optimizeScenario } from "../lib/logistics";
import { downloadFile, normalizeScenario, parseGeoJson, parseNodesCsv, resultGeoJson, resultsCsv, scenarioJson, scenarioTemplateCsv } from "../lib/io";

type Mode = "quick" | "scenario";
const ROLE_COLORS: Record<NodeRole, string> = { producer: "#167454", center: "#e9a23b", hub: "#4d5fa8", customer: "#cb5137" };
const STAGE_COLORS: Record<PlannedRoute["stage"], string> = { collection: "#167454", trunk: "#4d5fa8", lastMile: "#e26734", quick: "#e26734" };
const ROAD_KEYS = Object.keys(ROAD_CATEGORY_LABELS) as RoadCategory[];

function newNode(lat: number, lng: number, role: NodeRole, index: number): LogisticsNode {
  const defaults = { producer: { quantityKg: 3000, capacityKg: 0 }, center: { quantityKg: 0, capacityKg: 12000 }, hub: { quantityKg: 0, capacityKg: 0 }, customer: { quantityKg: 1000, capacityKg: 0 } }[role];
  return { id: crypto.randomUUID(), name: `${ROLE_LABELS[role]} ${index + 1}`, role, lat, lng, quantityKg: defaults.quantityKg, capacityKg: defaults.capacityKg, fixedCost: role === "center" ? 500000 : 0, serviceMin: role === "customer" ? 20 : 0, forcedOpen: false };
}

function demoNodes(): LogisticsNode[] {
  return [
    { ...newNode(4.142, -73.626, "producer", 0), id: "P1", name: "Productor Villavicencio", quantityKg: 3500 },
    { ...newNode(3.551, -73.706, "producer", 1), id: "P2", name: "Productor Granada", quantityKg: 2500 },
    { ...newNode(4.122, -73.637, "center", 0), id: "C1", name: "Centro de consolidación", capacityKg: 9000, forcedOpen: true },
    { ...newNode(4.657, -74.094, "hub", 0), id: "H1", name: "Nodo de distribución Bogotá" },
    { ...newNode(4.711, -74.072, "customer", 0), id: "D1", name: "Cliente norte", quantityKg: 3000 },
    { ...newNode(4.600, -74.116, "customer", 1), id: "D2", name: "Cliente occidente", quantityKg: 3000 },
  ];
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits }).format(value);
}

function updateAt<T>(items: T[], index: number, patch: Partial<T>) {
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
}

function loadColor(value: number, maximum: number) {
  const ratio = maximum ? value / maximum : 0;
  if (ratio >= 0.67) return "#bd2d2d";
  if (ratio >= 0.34) return "#e39a24";
  return "#2b9069";
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const analysisLayersRef = useRef<Layer[]>([]);
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
  const [showRoutes, setShowRoutes] = useState(true);
  const [showTolls, setShowTolls] = useState(true);
  const [showLoads, setShowLoads] = useState(false);
  const [status, setStatus] = useState("Haz clic sobre el mapa para agregar el primer punto.");
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedRoleRef.current = selectedRole; }, [selectedRole]);

  const visibleRoutes = useMemo(() => mode === "quick" ? (quickResult ? [quickResult] : []) : (scenarioResult?.routes ?? []), [mode, quickResult, scenarioResult]);
  const roadLoads = useMemo(() => scenarioResult?.roadLoads ?? (quickResult ? buildAccumulatedRoadLoads([quickResult]) : []), [quickResult, scenarioResult]);
  const currency = useMemo(() => {
    try { return new Intl.NumberFormat(config.locale || "es-CO", { style: "currency", currency: config.currency || "COP", maximumFractionDigits: 0 }); }
    catch { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
  }, [config.currency, config.locale]);

  const invalidate = useCallback((message = "Datos actualizados. Ejecuta de nuevo el cálculo.") => {
    setQuickResult(null); setScenarioResult(null); setStatus(message);
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/peajes-region-central.geojson`)
      .then((response) => { if (!response.ok) throw new Error(); return response.text(); })
      .then((text) => { const parsed = parseGeoJson(text); setTolls(parsed.tolls); setStatus(`Capa regional cargada: ${parsed.tolls.length} peajes disponibles.`); })
      .catch(() => setStatus("No se pudo cargar la capa regional de peajes."));
  }, []);

  useEffect(() => {
    let active = true;
    import("leaflet").then((module) => {
      if (!active || !mapNode.current || mapRef.current) return;
      const L = module.default;
      const map = L.map(mapNode.current, { zoomControl: false, minZoom: 2 }).setView([4.55, -74.05], 7);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        setNodes((current) => {
          if (current.length >= 30) { setStatus("El modo público admite hasta 30 nodos."); return current; }
          const role = modeRef.current === "quick" ? "producer" : selectedRoleRef.current;
          const node = newNode(event.latlng.lat, event.latlng.lng, role, current.length);
          if (modeRef.current === "quick") node.name = current.length === 0 ? "Origen" : `Parada ${current.length}`;
          return [...current, node];
        });
        setQuickResult(null); setScenarioResult(null); setStatus("Punto agregado. Puedes arrastrarlo o editar sus datos.");
      });
      mapRef.current = map; setMapReady(true);
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
      analysisLayersRef.current.forEach((layer) => layer.remove());
      analysisLayersRef.current = [];
      nodes.forEach((node, index) => {
        const color = mode === "quick" ? "#e26734" : ROLE_COLORS[node.role];
        const marker = L.marker([node.lat, node.lng], { draggable: true, icon: L.divIcon({ className: "map-marker-shell", html: `<span class="map-marker" style="--marker:${color}">${index + 1}</span>`, iconSize: [34, 42], iconAnchor: [17, 38] }) }).bindTooltip(node.name, { direction: "top", offset: [0, -28] });
        marker.on("dragend", (event) => { const point = event.target.getLatLng(); setNodes((current) => current.map((item) => item.id === node.id ? { ...item, lat: point.lat, lng: point.lng } : item)); invalidate("Punto movido. Ejecuta de nuevo el cálculo."); });
        marker.addTo(markersRef.current!);
      });
      if (showTolls) tolls.forEach((toll) => {
        const marker = L.circleMarker([toll.lat, toll.lng], { radius: 4, color: "#6f541d", weight: 1, fillColor: "#f0bf3c", fillOpacity: 0.9 })
          .bindTooltip(`<strong>${toll.name}</strong><br>${toll.sector ?? "Peaje regional"}`);
        marker.addTo(mapRef.current!); analysisLayersRef.current.push(marker);
      });
      if (showRoutes) visibleRoutes.forEach((route) => {
        const line = L.polyline(route.coordinates, { color: STAGE_COLORS[route.stage], weight: route.stage === "trunk" ? 7 : 5, opacity: 0.84, lineCap: "round" }).bindTooltip(`${route.id} · ${currency.format(route.cost.total)}`).addTo(mapRef.current!);
        analysisLayersRef.current.push(line);
      });
      if (showLoads && roadLoads.length) {
        const maximum = Math.max(...roadLoads.map((segment) => segment.loadKg));
        roadLoads.forEach((segment) => {
          const line = L.polyline(segment.coordinates, { color: loadColor(segment.loadKg, maximum), weight: 4 + 7 * Math.sqrt(segment.loadKg / maximum), opacity: 0.88, lineCap: "round" })
            .bindTooltip(`<strong>${formatNumber(segment.loadKg, 0)} kg acumulados</strong><br>${ROAD_CATEGORY_LABELS[segment.roadClass]} · ${segment.vehiclePasses} pasada(s)`)
            .addTo(mapRef.current!);
          analysisLayersRef.current.push(line);
        });
      }
      if (visibleRoutes.length) { const coordinates = visibleRoutes.flatMap((route) => route.coordinates); if (coordinates.length) mapRef.current.fitBounds(L.latLngBounds(coordinates).pad(0.12)); }
      else if (nodes.length > 1) mapRef.current.fitBounds(L.latLngBounds(nodes.map((node) => [node.lat, node.lng])).pad(0.18));
    });
    return () => { cancelled = true; };
  }, [currency, invalidate, mapReady, mode, nodes, roadLoads, showLoads, showRoutes, showTolls, tolls, visibleRoutes]);

  const switchMode = (nextMode: Mode) => { setMode(nextMode); setNodes([]); setQuickResult(null); setScenarioResult(null); setStatus(nextMode === "quick" ? "Marca un origen y un destino sobre el mapa." : "Selecciona un rol y agrega los nodos del escenario."); };

  const calculate = async () => {
    setLoading(true);
    try {
      if (mode === "quick") {
        if (nodes.length < 2) throw new Error("Selecciona al menos un origen y un destino.");
        const vehicle = vehicles.find((item) => item.id === selectedVehicleId) ?? vehicles[0];
        const result = await calculateQuickRoute(nodes, vehicle, config, quickLoadKg, roads, tolls);
        setQuickResult(result); setShowLoads(true);
        setStatus(result.source === "osrm" ? `Ruta calculada. Se detectaron ${result.tollNames.length} peajes en el corredor.` : "OSRM no respondió; se usó la estimación geodésica de contingencia.");
      } else {
        const result = await optimizeScenario(nodes, vehicles, config, roads, tolls);
        setScenarioResult(result); setShowLoads(true);
        setStatus(`Escenario optimizado: ${result.routes.length} rutas, ${result.openCenterIds.length} centros y ${result.roadLoads.length} tramos de carga vial.`);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "No fue posible completar el cálculo."); }
    finally { setLoading(false); }
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".csv")) { const imported = parseNodesCsv(text); if (imported.length > 30) throw new Error("El archivo supera el límite de 30 nodos"); setNodes(imported); invalidate(`${imported.length} nodos importados desde CSV.`); return; }
      const json = JSON.parse(text);
      if (json.version === 1 && Array.isArray(json.nodes)) { const scenario = normalizeScenario(json as Scenario); setNodes(scenario.nodes.slice(0, 30)); setVehicles(scenario.vehicles); setConfig(scenario.config); invalidate("Escenario JSON restaurado."); return; }
      const parsed = parseGeoJson(text);
      if (parsed.nodes.length) setNodes(parsed.nodes.slice(0, 30));
      if (parsed.roads.length) setRoads(parsed.roads);
      if (parsed.tolls.length) setTolls(parsed.tolls);
      invalidate(`GeoJSON importado: ${parsed.nodes.length} nodos, ${parsed.roads.length} vías y ${parsed.tolls.length} peajes.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Archivo no válido."); }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return setStatus("El navegador no permite consultar la ubicación.");
    setStatus("Buscando tu ubicación...");
    navigator.geolocation.getCurrentPosition(({ coords }) => { setNodes((current) => [...current, newNode(coords.latitude, coords.longitude, mode === "quick" ? "producer" : selectedRole, current.length)]); mapRef.current?.setView([coords.latitude, coords.longitude], 13); invalidate("Ubicación agregada al mapa."); }, () => setStatus("No se pudo obtener tu ubicación; marca el punto manualmente."), { enableHighAccuracy: true, timeout: 10000 });
  };

  const setNode = (index: number, patch: Partial<LogisticsNode>) => { setNodes((current) => updateAt(current, index, patch)); invalidate(); };
  const setVehicle = (index: number, patch: Partial<Vehicle>) => { setVehicles((current) => updateAt(current, index, patch)); invalidate(); };
  const moveNode = (index: number, delta: number) => { setNodes((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; }); invalidate("Orden de paradas actualizado."); };
  const scenario: Scenario = { version: 1, name: "Escenario GeoFlujo Región Central", nodes, vehicles, config };
  const total = mode === "quick" ? quickResult?.cost.total : scenarioResult?.totalCost;

  return <main className="app-shell" id="top">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="GeoFlujo Región Central, inicio"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>GeoFlujo</strong> Región Central</span></a>
      <nav className="mode-switch" aria-label="Modo de cálculo"><button className={mode === "quick" ? "active" : ""} onClick={() => switchMode("quick")}>Ruta rápida</button><button className={mode === "scenario" ? "active" : ""} onClick={() => switchMode("scenario")}>Escenario logístico</button></nav>
      <a className="github-link" href="https://github.com/rafaelemg-logistica/geoflujo-costos" target="_blank" rel="noreferrer">Código abierto ↗</a>
    </header>

    <section className="workspace">
      <aside className="control-panel">
        <div className="intro-block"><span className="eyebrow">RAP-E Región Central</span><h1>{mode === "quick" ? "Calcula costos, peajes y carga sobre la vía." : "Modela el flujo logístico completo."}</h1><p>{mode === "quick" ? "Marca el recorrido: la aplicación identifica los peajes atravesados y clasifica la red vial sin depender de ArcGIS." : "Configura productores, centros, distribución y última milla con costos detallados por categoría vial."}</p></div>
        {mode === "scenario" && <section className="panel-section role-picker"><div className="section-heading"><div><span className="step">01</span><h2>Agregar nodos</h2></div><button className="text-button" onClick={() => { setNodes(demoNodes()); invalidate("Escenario demostrativo cargado."); }}>Cargar demo regional</button></div><div className="role-grid">{(Object.keys(ROLE_LABELS) as NodeRole[]).map((role) => <button key={role} className={selectedRole === role ? "selected" : ""} style={{ "--role": ROLE_COLORS[role] } as React.CSSProperties} onClick={() => setSelectedRole(role)}><i />{ROLE_LABELS[role]}</button>)}</div></section>}
        <section className="panel-section"><div className="section-heading"><div><span className="step">{mode === "quick" ? "01" : "02"}</span><h2>{mode === "quick" ? "Paradas" : `Nodos (${nodes.length}/30)`}</h2></div><button className="icon-button" onClick={locateMe} title="Usar mi ubicación">◎</button></div>
          {!nodes.length && <div className="empty-state"><span>＋</span><p>Haz clic en el mapa o importa un archivo.</p></div>}
          <div className="node-list">{nodes.map((node, index) => <article className="node-card" key={node.id} style={{ "--role": mode === "quick" ? "#e26734" : ROLE_COLORS[node.role] } as React.CSSProperties}><div className="node-row"><span className="node-index">{index + 1}</span><input aria-label={`Nombre del punto ${index + 1}`} value={node.name} onChange={(event) => setNode(index, { name: event.target.value })} /><button className="remove-button" onClick={() => { setNodes((current) => current.filter((_, itemIndex) => itemIndex !== index)); invalidate("Punto eliminado."); }} aria-label={`Eliminar ${node.name}`}>×</button></div>
            {mode === "quick" ? <div className="node-meta"><span>{node.lat.toFixed(5)}, {node.lng.toFixed(5)}</span><div><button onClick={() => moveNode(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveNode(index, 1)} disabled={index === nodes.length - 1}>↓</button></div></div> : <div className="node-fields"><label>Rol<select value={node.role} onChange={(event) => setNode(index, { role: event.target.value as NodeRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{(node.role === "producer" || node.role === "customer") && <label>{node.role === "producer" ? "Oferta kg" : "Demanda kg"}<input type="number" min="0" value={node.quantityKg} onChange={(event) => setNode(index, { quantityKg: Number(event.target.value) })} /></label>}{node.role === "center" && <><label>Capacidad kg<input type="number" min="0" value={node.capacityKg} onChange={(event) => setNode(index, { capacityKg: Number(event.target.value) })} /></label><label>Costo fijo<input type="number" min="0" value={node.fixedCost} onChange={(event) => setNode(index, { fixedCost: Number(event.target.value) })} /></label><label className="check-field"><input type="checkbox" checked={node.forcedOpen} onChange={(event) => setNode(index, { forcedOpen: event.target.checked })} /> Apertura forzada</label></>}</div>}
          </article>)}</div>
          <div className="file-actions"><label className="secondary-button">Importar CSV / GeoJSON / JSON<input type="file" accept=".csv,.json,.geojson" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label><button className="text-button" onClick={() => downloadFile("plantilla_nodos_region_central.csv", scenarioTemplateCsv(), "text/csv;charset=utf-8")}>Descargar plantilla</button></div>
        </section>

        <section className="panel-section"><div className="section-heading"><div><span className="step">{mode === "quick" ? "02" : "03"}</span><h2>Vehículos y costos viales</h2></div></div>
          <div className="auto-data"><strong>{tolls.length} peajes regionales activos</strong><span>Detección espacial automática · tolerancia {config.tollMatchToleranceM} m</span></div>
          {mode === "quick" ? <div className="form-grid"><label className="wide">Vehículo<select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name} · {formatNumber(vehicle.capacityKg, 0)} kg · categoría {vehicle.tollCategory}</option>)}</select></label><label>Carga (kg)<input type="number" min="0" value={quickLoadKg} onChange={(event) => { setQuickLoadKg(Number(event.target.value)); invalidate(); }} /></label><label className="check-field"><input type="checkbox" checked={config.roundTrip} onChange={(event) => { setConfig({ ...config, roundTrip: event.target.checked }); invalidate(); }} /> Incluir regreso</label></div> : <div className="vehicle-list">{vehicles.map((vehicle, index) => <details key={vehicle.id} className="vehicle-card" open={index === 0}><summary>{vehicle.name}<span>{formatNumber(vehicle.capacityKg, 0)} kg</span></summary><div className="form-grid"><label>Nombre<input value={vehicle.name} onChange={(event) => setVehicle(index, { name: event.target.value })} /></label><label>Capacidad kg<input type="number" min="1" value={vehicle.capacityKg} onChange={(event) => setVehicle(index, { capacityKg: Number(event.target.value) })} /></label><label>Categoría peaje<input value={vehicle.tollCategory} onChange={(event) => setVehicle(index, { tollCategory: event.target.value.toUpperCase() })} /></label><label>Costo fijo<input type="number" min="0" value={vehicle.fixedCost} onChange={(event) => setVehicle(index, { fixedCost: Number(event.target.value) })} /></label>{ROAD_KEYS.filter((key) => key !== "unclassified").map((key) => <label key={key}>{ROAD_CATEGORY_LABELS[key]} / km<input type="number" min="0" value={vehicle.roadCostPerKm[key]} onChange={(event) => setVehicle(index, { roadCostPerKm: { ...vehicle.roadCostPerKm, [key]: Number(event.target.value) } })} /></label>)}</div></details>)}</div>}
          <details className="advanced-card"><summary>Parámetros operativos</summary><div className="form-grid"><label>Moneda<input maxLength={3} value={config.currency} onChange={(event) => setConfig({ ...config, currency: event.target.value.toUpperCase() })} /></label><label>Máx. centros<input type="number" min="1" value={config.maxCenters} onChange={(event) => setConfig({ ...config, maxCenters: Number(event.target.value) })} /></label><label>Cargue / kg<input type="number" min="0" value={config.nodeCosts.loadingPerKg} onChange={(event) => setConfig({ ...config, nodeCosts: { ...config.nodeCosts, loadingPerKg: Number(event.target.value) } })} /></label><label>Descargue / kg<input type="number" min="0" value={config.nodeCosts.unloadingPerKg} onChange={(event) => setConfig({ ...config, nodeCosts: { ...config.nodeCosts, unloadingPerKg: Number(event.target.value) } })} /></label><label>Consolidación / kg<input type="number" min="0" value={config.nodeCosts.consolidationPerKg} onChange={(event) => setConfig({ ...config, nodeCosts: { ...config.nodeCosts, consolidationPerKg: Number(event.target.value) } })} /></label><label>Alistamiento / kg<input type="number" min="0" value={config.nodeCosts.preparationPerKg} onChange={(event) => setConfig({ ...config, nodeCosts: { ...config.nodeCosts, preparationPerKg: Number(event.target.value) } })} /></label></div></details>
        </section>
        <div className="calculate-dock"><button className="primary-button" onClick={calculate} disabled={loading}>{loading ? <><span className="spinner" />Calculando red vial...</> : <>Calcular análisis <span>→</span></>}</button><button className="clear-button" onClick={() => { setNodes([]); setQuickResult(null); setScenarioResult(null); setStatus("Mapa limpio. Agrega nuevos puntos."); }}>Limpiar</button></div>
      </aside>

      <section className="map-area" aria-label="Mapa interactivo"><div ref={mapNode} className="map-canvas" /><div className="map-hint"><span>＋</span> Clic para agregar · arrastra para ajustar</div><div className="layer-switches"><label><input type="checkbox" checked={showRoutes} onChange={(event) => setShowRoutes(event.target.checked)} /> Rutas</label><label><input type="checkbox" checked={showTolls} onChange={(event) => setShowTolls(event.target.checked)} /> Peajes</label><label><input type="checkbox" checked={showLoads} onChange={(event) => setShowLoads(event.target.checked)} /> Carga vial</label></div>{showLoads && roadLoads.length > 0 && <div className="load-legend"><span><i className="load-low" />Carga baja</span><span><i className="load-mid" />Media</span><span><i className="load-high" />Alta</span></div>}<div className={`status-toast ${status.toLowerCase().includes("no ") || status.toLowerCase().includes("requiere") ? "warning" : ""}`} role="status">{status}</div></section>

      <aside className="results-panel"><div className="results-header"><span className="eyebrow">Resultado</span><h2>{total != null ? currency.format(total) : "Aún sin calcular"}</h2><p>{mode === "quick" ? "Costo total estimado del recorrido" : "Costo total del escenario"}</p></div>{mode === "quick" && quickResult && <ResultRoute route={quickResult} currency={currency} />}{mode === "scenario" && scenarioResult && <ScenarioResults result={scenarioResult} currency={currency} />}{!quickResult && !scenarioResult && <div className="result-placeholder"><div className="placeholder-route"><i /><span /><i /></div><h3>Tu análisis aparecerá aquí</h3><p>Completa los puntos y parámetros, luego ejecuta el cálculo.</p></div>}{(quickResult || scenarioResult) && <div className="export-grid">{scenarioResult && <button onClick={() => downloadFile("geoflujo-resultados.csv", resultsCsv(scenarioResult), "text/csv;charset=utf-8")}>Resultados CSV</button>}{scenarioResult && <button onClick={() => downloadFile("geoflujo-rutas-carga.geojson", resultGeoJson(nodes, scenarioResult), "application/geo+json")}>Rutas y carga GeoJSON</button>}<button onClick={() => downloadFile("geoflujo-escenario.json", scenarioJson(scenario), "application/json")}>Escenario JSON</button></div>}<footer className="data-note"><strong>Herramienta abierta para la RAP-E Región Central.</strong><p>Desarrollada por Rafael Montenegro. El cálculo se realiza temporalmente en el navegador con datos abiertos de INVÍAS y OpenStreetMap.</p></footer></aside>
    </section>
  </main>;
}

function RoadBreakdown({ route }: { route: PlannedRoute }) {
  const rows = ROAD_KEYS.filter((key) => route.roadClassKm[key] > 0.01);
  return <details className="validation-list" open><summary>Clasificación vial ({route.roadDataSource === "overpass" ? "OSM" : route.roadDataSource === "uploaded" ? "capa cargada" : "estimada"})</summary>{rows.map((key) => <p key={key}><span>{ROAD_CATEGORY_LABELS[key]}</span><strong>{formatNumber(route.roadClassKm[key])} km</strong></p>)}</details>;
}

function ResultRoute({ route, currency }: { route: PlannedRoute; currency: Intl.NumberFormat }) {
  return <div className="result-content"><div className="metric-grid"><Metric label="Distancia" value={`${formatNumber(route.distanceKm)} km`} /><Metric label="Tiempo" value={`${formatNumber(route.durationMin, 0)} min`} /><Metric label="Viajes" value={String(route.trips)} /><Metric label="Peajes detectados" value={String(route.tollNames.length)} /></div>{route.tollNames.length > 0 && <div className="toll-list"><strong>Peajes sobre la ruta</strong><p>{route.tollNames.join(" · ")}</p></div>}<RoadBreakdown route={route} /><CostList route={route} currency={currency} /></div>;
}

function ScenarioResults({ result, currency }: { result: OptimizationResult; currency: Intl.NumberFormat }) {
  const totalTolls = new Set(result.routes.flatMap((route) => route.tollNames));
  const roadTotals = ROAD_KEYS.map((key) => ({ key, km: result.routes.reduce((sum, route) => sum + route.roadClassKm[key], 0) })).filter((row) => row.km > 0.01);
  return <div className="result-content"><div className="metric-grid"><Metric label="Rutas" value={String(result.routes.length)} /><Metric label="Centros" value={String(result.openCenterIds.length)} /><Metric label="Costo/kg" value={currency.format(result.costPerKg)} /><Metric label="Peajes únicos" value={String(totalTolls.size)} /></div><div className="stage-list">{result.stages.filter((stage) => stage.stage !== "all").map((stage) => <div key={stage.stage}><span>{stage.stage === "collection" ? "Recolección" : stage.stage === "trunk" ? "Troncal" : "Última milla"}<small>{stage.routes} rutas · {formatNumber(stage.distanceKm)} km</small></span><strong>{currency.format(stage.cost)}</strong></div>)}</div><details className="validation-list" open><summary>Kilómetros por categoría vial</summary>{roadTotals.map(({ key, km }) => <p key={key}><span>{ROAD_CATEGORY_LABELS[key]}</span><strong>{formatNumber(km)} km</strong></p>)}</details><details className="validation-list"><summary>Validaciones ({result.validations.length})</summary>{result.validations.map((message, index) => <p key={`${message}-${index}`}>• {message}</p>)}</details></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function CostList({ route, currency }: { route: PlannedRoute; currency: Intl.NumberFormat }) { const labels: [keyof PlannedRoute["cost"], string][] = [["distance", "Costo vial"], ["time", "Tiempo"], ["fixed", "Costo fijo"], ["tolls", "Peajes automáticos"], ["node", "Operación en nodos"], ["overhead", "Overhead"]]; return <div className="cost-list">{labels.map(([key, label]) => <div key={key}><span>{label}</span><strong>{currency.format(route.cost[key])}</strong></div>)}</div>; }
