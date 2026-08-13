# Contratos de datos

## Nodos CSV

| Campo | Requerido | Descripción |
| --- | --- | --- |
| `id` | Sí | Identificador único. |
| `name` | Sí | Nombre visible. |
| `role` | Sí | `producer`, `center`, `hub` o `customer`. |
| `lat`, `lng` | Sí | Coordenadas WGS84. |
| `quantity_kg` | Productor/cliente | Oferta o demanda. |
| `capacity_kg` | Centro | Capacidad total. |
| `fixed_cost` | No | Costo de apertura del centro. |
| `service_min` | No | Tiempo de atención del cliente. |
| `forced_open` | No | `true` obliga a abrir el centro. |

Se aceptan también alias en español como `nombre`, `rol`, `latitud`, `longitud`, `cantidad_kg`, `capacidad_kg`, `costo_fijo` y `apertura_forzada`.

## GeoJSON

El archivo debe ser un `FeatureCollection` WGS84.

- Nodo: geometría `Point` y propiedad `role`.
- Peaje: geometría `Point` sin `role`; tarifas en `rate`, `rate_I`, `rate_II`, etc.
- Vía: geometría `LineString`; propiedades `road_class` y `cost_per_km` opcional.

La coincidencia usa las tolerancias editables del escenario. Las vías sin tarifa usan el costo por kilómetro del vehículo y los peajes sin tarifa compatible aportan cero.

## Escenario JSON

El botón **Escenario JSON** exporta los nodos, vehículos y configuración con `version: 1`. El mismo archivo puede importarse para restaurar el escenario en otro navegador.

## Resultados

- CSV: una fila por ruta con etapa, vehículo, secuencia, carga, viajes, métricas y componentes de costo.
- GeoJSON: puntos originales y líneas resultantes con propiedades de trazabilidad.
- Validaciones: advertencias visibles sobre contingencia, insumos ausentes y diferencias entre oferta y demanda.
