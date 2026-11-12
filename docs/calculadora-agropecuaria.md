# Calculadora de escenarios agrologísticos · Prototipo

Esta funcionalidad amplía GeoFlujo sin reemplazar el mapa y los cálculos existentes. Se accede desde el enlace **Calculadora agropecuaria** en la cabecera, o desde \`?calculadora=1\` en la web publicada.

## Base del prototipo

Los insumos fueron el documento «Base conceptual para una calculadora de escenarios logísticos agropecuarios» y el libro «Modelo Inicial Calculadora Escenarios Logisticos Agropecuarios revisión». El caso inicial se restringe a **Mango Tommy**, con un ejemplo Espinal–Tunja y cinco configuraciones:

| ID | Configuración | Referencia |
|---|---|---|
| E1 | Circuito corto | Entrega directa |
| E2 | Canal tradicional | Mercado mayorista |
| E3 | Agregación de oferta | Primera milla agregada + acopio |
| E4 | Distribución organizada | Acondicionamiento + centro de distribución + última milla |
| E5 | Transformación | Pulpa congelada |

Los datos cargados son un **ejercicio metodológico** y no precios vigentes certificados. El Excel registra observaciones de validación y costos pendientes. Se mantienen «REVISAR» y «PENDIENTE», además de las advertencias de cada operación.

## Modelo de cálculo

- Los pasos son ordenados, editables, duplicables y reordenables: **operación, transporte, merma y transformación**.
- **Operación:** costo fijo + kg entrantes × costo COP/kg; tiempo fijo y min/kg.
- **Merma:** salida = entrada × (1 − tasa de merma de la iteración).
- **Transformación:** salida = entrada × rendimiento de transformación. La fracción no obtenida se registra como **conversión u otras salidas**, separada de la merma logística.
- **Transporte:** viajes = máximo entre techo(peso/capacidad kg) y techo(volumen/capacidad m³). Cuando no hay volumen de empaque, se aplica solamente la restricción por peso y se advierte. Costo = viajes × (costo por ruta × (1 + recargo) × factor de sensibilidad + peajes). El costo por ruta puede ser **manual** o **distancia × COP/km**.
- **Empaque:** cantidad de unidades necesarias para la masa final × costo por unidad, sin aplicar doblemente el costo en pasos intermedios.
- **Costo total:** transporte + operaciones + empaque + otros; se reporta COP/kg de producto **entregado**.
- **Balance:** inicial = entregado + merma logística + conversión/otras salidas, con tolerancia de redondeo.

La vista compara las tres iteraciones **optimista**, **base** y **conservador**. Cada escenario puede modificar su masa inicial, volumen de empaque, tarifas, ubicación de los extremos de tramo, costo por transporte, recargo, merma, rendimientos y secuencia.

## Georreferenciación

Los puntos Espinal, Tunja y centros/destinos de las demos son **referencias urbanas**, no predios o instalaciones geocodificadas de las fuentes. Cada tramo tiene origen/destino editables y botón «Actualizar distancia/tiempo con OSRM». El servidor público de demostración OSRM no garantiza disponibilidad. Ante fallo se utiliza una distancia geodésica estimada y se deja marcada la fuente; **no se modifica el costo manual** al actualizar una ruta. Para usar la tarifa espacial se debe desactivar la opción de costo manual. No se calculan peajes nuevos desde OSRM; deben verificarse o ingresarse por tramo, y no se debe sumar simultáneamente el peaje al costo de ruta si este ya lo incluye.

**Precaución E3:** el valor del primer tramo representa un agregado de primera milla que comprende cinco orígenes, por lo cual los extremos geográficos de muestra **no corresponden a su geometría real**. **Precaución E5:** los costos industriales y requisitos sanitarios están incompletos. La calculadora no certifica factibilidad normativa.

## Persistencia y trazabilidad

- Los cambios persisten en el almacenamiento local del navegador, no en GitHub ni en un servidor.
- «Exportar JSON» genera un archivo editable y versionable; «Importar JSON» repone la configuración.
- «Restablecer» recupera los datos iniciales del libro.
- Las fuentes SRC_* conservan las referencias originales. No se actualizan automáticamente las series de SIPSA, tarifas SICE-TAC ni los registros normativos.
- No se admiten efectos multiproducto o árboles de transformación con múltiples coproductos en el motor inicial: cada paso se calcula secuencialmente sobre una sola corriente de masa.

## Pruebas

\`pnpm check\` valida tipado, lint, tests y compilación. La suite agro comprueba los valores base de E1, E2 y E5 del Excel, la sensibilidad a tarifas, el control de capacidad y la importación.
