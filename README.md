# map-widget

## About

Lightweight map that consumes WMS. Displays layers and fetches feature information on click. Requires a GeoServer back-end.

## Demo

https://treecon.github.io/map-widget

## Usage

Include <b>Map Widget</b> using CDN, after:
- leaflet (css & js files)
- wms-capabilities

```
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>

<script src="https://cdn.jsdelivr.net/npm/wms-capabilities@0.5.1/dist/wms-capabilities.min.js"></script>

<script src="https://cdn.jsdelivr.net/gh/treecon/map-widget@1.0.2/map-widget.js"></script>
```

Initialize <b>Map Widget</b>
```
new MapWidget(mapContainer, geoserverUrl, layers, options?).init()
```
example:
```
new MapWidget(
    'map_widget',
    'https://ahocevar.com/geoserver/wms', 
    [
        { layers: 'topp:states', label: 'States', openByDefault: true },
        { layers: 'usa:states', label: 'Population', openByDefault: false },
    ], 
    {
        zoomControl: true,
    },
).init()
```

### Layers

Type: `{ layers: string, label: string, openByDefault?: boolean }[]`

- <b>layers</b>: can be either one GeoServer layer or multiple (separated by comma), grouped to one.
- <b>label</b>: the label of layer / layer-group (shown in layer control)
- <b>openByDefault</b>: whether the layer / layer-group is open when map is initialized.

### Options

<b>zoomControl</b>: `boolean` - whether to show a zoom control or not (default: `false`)

<b>zoomControlPosition</b>: `string` - Required only if `zoomControl` is `true`. Accepts values: `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`

<b>initialViewType</b>: `string` - Accepts values:
- `FITS_CONTENT` (default): Initial view will fit to visible layers. If no layer is visible by default, view will fit to the extent of all layers.
- `CENTER_POINT`: Initial view is set to the given point and zoom level (`initialViewPoint`).

<b>initialViewPoint</b>: `{ lat: number, lon: number, zoom: number }` - Required only if `initialViewType` is set to `'CENTER_POINT'` (default: `{lat: 38, lon: 24: zoom: 9}`)

<b>delimitedValues</b>: `boolean` - whether values of feature properties may be delimited or not (default: `true`)

<b>valueDelimiter</b>: `string` - the delimiter of values of feature properties. Ignored if `delimitedValues` is `false`. (default: `|`)

<b>detectUrl</b>: `boolean` - if set to 'true', url-like values are automatically displayed as links. (default: `true`)

<b>layerAliases</b>: `{ name: string, alias: string }[]` - aliases for layers (shown in information popup). 

<b>propertyAliases</b>: `{ name: string, alias: string }[]` - aliases for property names (shown in information popup).

<b>excludeProperties</b>: `string[]` - An array of properties to be excluded from feature information

<b>includeOnlyProperties</b>: `{ property: string, label: string }[]` - An array of properties (and their labels) to be exclusively included in feature information

<b>header</b>: Either `null` (default) or an object with following properties:
- <b>logoImageUrl</b>: `string` (required),
- <b>title</b>: `string` (required),
- <b>backgroundColor</b>: `string` (accepts only RGB format, default: `rgb(248, 249, 250)`),
- <b>textColor</b>: `string` (title text color, default: `#121212`),
- <b>height</b>: `number` (height of header in px, default: `54`),
- <b>logoOverflow</b>: `boolean` (if logo should overflow header, default: `false`),
- <b>logoImageHeight</b>: `number` (ignored if `logoOverflow: false`, default: `80`),
