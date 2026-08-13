# Fuentes y metodología

## Peajes automáticos

La aplicación carga al iniciar `public/data/peajes-region-central.geojson`. Para cada ruta calcula la distancia mínima entre cada peaje y la geometría vial; si es menor o igual a 500 metros, aplica una vez por pasada la tarifa correspondiente a la categoría del vehículo.

La fuente pública de referencia es [Peajes — Datos Abiertos Colombia](https://www.datos.gov.co/Transporte/Peajes/68qj-5xux), publicada por INVÍAS. El archivo empaquetado debe revisarse cuando cambien tarifas o ubicaciones.

## Homologación de categorías viales

| Etiqueta `highway` de OSM | Categoría de costo |
|---|---|
| `motorway`, `trunk`, `primary` y enlaces | Primaria |
| `secondary` y enlaces | Secundaria |
| `tertiary` y enlaces | Terciaria |
| `unclassified`, `residential`, `living_street`, `service`, `road` | Local |
| `track`, `byway` | Rural de baja especificación |

OSRM devuelve los identificadores de nodos OSM usados por la ruta. La aplicación consulta Overpass únicamente por las vías relacionadas con esos nodos, evitando distribuir una base vial regional de varios millones de segmentos.

## Tarifas integrales COP/km

| Vehículo | Capacidad kg | Primaria | Secundaria | Terciaria | Local | Rural |
|---|---:|---:|---:|---:|---:|---:|
| Camioneta LUV / pickup | 1.300 | 958 | 1.073 | 1.227 | 1.390 | 1.629 |
| Camión liviano 2 ejes | 3.500 | 1.817 | 2.035 | 2.325 | 2.634 | 3.088 |
| Camión C2 mediano | 7.000 | 2.443 | 2.736 | 3.127 | 3.543 | 4.153 |
| Camión C3 doble troque | 14.000 | 3.453 | 3.868 | 4.420 | 5.007 | 5.871 |
| Tractocamión C2S2 | 18.000 | 3.786 | 4.240 | 4.845 | 5.489 | 6.435 |
| Tractocamión C3S2 | 30.000 | 4.322 | 4.841 | 5.533 | 6.268 | 7.348 |

Son valores integrales del modelo inicial y deben calibrarse cuando existan estudios vigentes. La interfaz permite editarlos. No se suma combustible de forma separada.

## Carga vial

Cada geometría de ruta se divide en segmentos consecutivos. Para cada segmento se acumulan:

- kilogramos transportados × número de viajes;
- número de pasadas vehiculares;
- rutas contribuyentes;
- categoría vial asociada.

El visor usa una escala verde–amarillo–rojo relativa al máximo del escenario. Este indicador representa carga logística modelada, no aforos totales de tránsito de la vía.

## Contingencia

Si OSRM falla, se usa Haversine × factor configurable y una velocidad media configurable. Si Overpass falla, el tramo se marca como “sin clasificar” y usa la tarifa de contingencia del vehículo. Ambos casos se informan en el resultado.
