# GeoFlujo Región Central

Herramienta web abierta para analizar rutas, flujos, peajes, categorías viales, carga acumulada y costos logísticos en el ámbito de la **RAP-E Región Central**.

Desarrollada por **Rafael Montenegro** y publicada con licencia MIT.

## Qué permite hacer

- Dibujar, ordenar y arrastrar puntos sobre un mapa de OpenStreetMap.
- Calcular rutas viales con OSRM y usar una contingencia geodésica identificada si el servicio no responde.
- Detectar automáticamente los peajes que atraviesa cada ruta y aplicar la tarifa de la categoría vehicular.
- Clasificar kilómetros en vías primarias, secundarias, terciarias, locales y rurales a partir de etiquetas OSM.
- Aplicar matrices de costo por kilómetro y tipo de vehículo provenientes del análisis técnico inicial.
- Modelar productores → centros de consolidación → nodos de distribución → última milla.
- Visualizar la carga logística acumulada sobre cada tramo recorrido.
- Importar CSV, GeoJSON o escenarios JSON y exportar resultados en CSV y GeoJSON.

La aplicación no requiere cuenta, clave API ni componentes propietarios. El cálculo y el almacenamiento temporal ocurren en el navegador.

## Fuentes y metodología

- **Peajes:** subconjunto regional preparado a partir de datos públicos de INVÍAS, con nombre, ubicación y tarifas por categoría.
- **Rutas:** servidor público de demostración de OSRM.
- **Categoría vial:** consulta puntual a Overpass de las vías OSM efectivamente utilizadas por la ruta.
- **Carga vial:** suma de `carga × viajes` de todas las rutas que comparten un segmento.
- **Costos viales:** tarifas integrales COP/km diferenciadas por categoría vial y vehículo. No se agrega combustible por separado para evitar doble conteo.

La explicación completa y las reglas de homologación están en [docs/fuentes-y-metodologia.md](docs/fuentes-y-metodologia.md).

## Desarrollo local

Requiere Node.js 22.13 o posterior y pnpm 11.19.

```bash
pnpm install
pnpm dev
```

Validación completa:

```bash
pnpm check
```

## Publicación

Cada cambio en `main` ejecuta lint, comprobación de tipos, pruebas y compilación. Si todo finaliza correctamente, GitHub Actions publica el contenido estático en GitHub Pages.

Repositorio: <https://github.com/rafaelemg-logistica/geoflujo-costos>

## Límites responsables

El modo público admite hasta 30 nodos y reutiliza matrices durante la sesión. OSRM, Overpass y las teselas comunitarias de OpenStreetMap no ofrecen SLA; para uso operativo de alto tráfico deben desplegarse servicios propios o contratarse proveedores con garantía.

## Licencia

Código bajo [licencia MIT](LICENSE). Las fuentes externas conservan sus licencias y condiciones de atribución.
