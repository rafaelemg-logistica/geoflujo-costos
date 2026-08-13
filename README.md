# GeoFlujo Costos

Aplicación web abierta para dibujar rutas, modelar flujos logísticos y estimar costos de transporte sin ArcGIS, cuentas de usuario ni licencias propietarias.

## Funcionalidad

### Ruta rápida

- Selección, ordenamiento y arrastre de puntos sobre OpenStreetMap.
- Rutas viales mediante OSRM con contingencia geodésica identificada.
- Vehículo, carga, peajes y viaje de regreso configurables.
- Distancia, duración, viajes y costos desagregados.

### Escenario logístico

- Flujo `productores → centros → nodos de distribución → última milla`.
- Apertura y capacidad de centros mediante búsqueda branch-and-bound.
- Selección vehicular por capacidad y menor costo.
- Planeación Clarke–Wright con restricción de capacidad.
- Costos de transporte, nodos, peajes y overhead por etapa.
- Importación CSV, GeoJSON y escenarios JSON reutilizables.
- Exportación CSV, GeoJSON y JSON.

## Arquitectura abierta

- React, TypeScript y Vinext.
- Leaflet empaquetado con la aplicación.
- Teselas de OpenStreetMap con atribución visible.
- API pública OSRM para matrices, tiempos y geometrías.
- Cálculo local en el navegador; el proyecto no guarda escenarios ni datos personales.
- Cloudflare Workers/Sites como destino de despliegue.

OSRM y los servidores comunitarios de OpenStreetMap son apropiados para demostraciones y tráfico moderado, pero no ofrecen un SLA. El modo público limita cada escenario a 30 nodos, reutiliza matrices durante la sesión y muestra cuándo utiliza una estimación de contingencia.

## Desarrollo

Requiere Node.js 22.13 o posterior y pnpm 11.

```bash
pnpm install
pnpm dev
```

Validación completa:

```bash
pnpm check
```

## Datos de entrada

La plantilla mínima está en [`examples/nodos.csv`](examples/nodos.csv). Los contratos completos de CSV, GeoJSON y JSON están documentados en [`docs/contratos-de-datos.md`](docs/contratos-de-datos.md).

Los valores colombianos y COP incluidos son demostrativos y editables. No están asociados a un producto agrícola ni sustituyen una calibración con fuentes vigentes.

## Uso de vías y peajes propios

Un GeoJSON opcional puede incluir:

- Líneas con `road_class` y `cost_per_km`.
- Puntos de peaje con `rate`, `rate_I`, `rate_II`, etc.

Los tramos sin coincidencia espacial usan el costo base del vehículo. Si no se carga una capa de peajes, puede definirse un valor manual por trayecto.

## Alcance

Esta versión prioriza trazabilidad y reproducibilidad. No ofrece optimización exacta para escenarios grandes, almacenamiento en la nube, geocodificación ni garantías operativas sobre servicios comunitarios. Para producción de alto tráfico se recomienda operar una instancia propia de OSRM/Valhalla y un proveedor de mapas con SLA.

## Licencia

Código bajo [licencia MIT](LICENSE). Los datos de OpenStreetMap conservan sus condiciones de atribución y los servicios externos sus propias políticas de uso.
