# leaflet-velocity [![NPM version][npm-image]][npm-url] [![NPM Downloads][npm-downloads-image]][npm-url]

## Version 2 Notice

As of version 2, `leaflet-velocity` is now under [CSIRO](https://www.csiro.au)'s [Open Source Software Licence Agreement](LICENSE.md), which is variation of the BSD / MIT License.

There are no other plans for changes to licensing, and the project will remain open source.

---

A plugin for Leaflet (v1.0.3, and v0.7.7) to create a canvas visualisation layer for direction and intensity of arbitrary velocities (e.g. wind, ocean current).

Live Demo: https://onaci.github.io/leaflet-velocity/

- Uses a modified version of [WindJS](https://github.com/Esri/wind-js) for core functionality.
- Similar to [wind-js-leaflet](https://github.com/danwild/wind-js-leaflet), however much more versatile (provides a generic leaflet layer, and not restricted to wind).
- Data input format is the same as output by [wind-js-server](https://github.com/danwild/wind-js-server), using [grib2json](https://github.com/cambecc/grib2json).
- **NEW**: Color overlay feature provides intensity visualization similar to windy.com, showing velocity magnitude as a gradient map in addition to particle movement.
- **NEW**: Custom color mapping allows you to define exact colors for specific wind speeds in knots, giving you complete control over the visualization appearance.

![Screenshot](/screenshots/velocity.gif?raw=true)

## Example use:

```javascript
var velocityLayer = L.velocityLayer({
  displayValues: true,
  displayOptions: {
    // label prefix
    velocityType: "Global Wind",

    // leaflet control position
    position: "bottomleft",

    // no data at cursor
    emptyString: "No velocity data",

    // see explanation below
    angleConvention: "bearingCW",

    // display cardinal direction alongside degrees
    showCardinal: false,

    // one of: ['ms', 'k/h', 'mph', 'kt']
    speedUnit: "ms",

    // direction label prefix
    directionString: "Direction",

    // speed label prefix
    speedString: "Speed",
  },
  data: data, // see demo/*.json, or wind-js-server for example data service

  // OPTIONAL
  minVelocity: 0, // used to align color scale
  maxVelocity: 10, // used to align color scale
  velocityScale: 0.005, // modifier for particle animations, arbitrarily defaults to 0.005
  colorScale: [], // define your own array of hex/rgb colors
  onAdd: null, // callback function
  onRemove: null, // callback function
  opacity: 0.97, // layer opacity, default 0.97

  // COLOR OVERLAY OPTIONS (NEW)
  showColorOverlay: false, // enable color gradient overlay showing velocity intensity
  overlayOpacity: 0.5, // opacity of the color overlay (0-1), default 0.5
  overlaySmoothing: 'high', // smoothing quality: 'low', 'medium', 'high', 'ultra'
  
  // CUSTOM COLOR MAPPING (NEW)
  customColorMap: null, // array of {knots: number, color: string} objects for custom colors

  // optional pane to add the layer, will be created if doesn't exist
  // leaflet v1+ only (falls back to overlayPane for < v1)
  paneName: "overlayPane",
});
```

The angle convention option refers to the convention used to express the wind direction as an angle from north direction in the control.
It can be any combination of `bearing` (angle toward which the flow goes) or `meteo` (angle from which the flow comes),
and `CW` (angle value increases clock-wise) or `CCW` (angle value increases counter clock-wise). If not given defaults to `bearingCCW`.

The speed unit option refers to the unit used to express the wind speed in the control.
It can be `m/s` for meter per second, `k/h` for kilometer per hour or `kt` for knots. If not given defaults to `m/s`.

## Color Overlay Feature

The `showColorOverlay` option enables a color gradient overlay that visualizes velocity intensity across the map, similar to what you see on windy.com. This overlay complements the particle animation by providing a continuous color-coded representation of wind/velocity strength.

- **showColorOverlay**: `boolean` - Enable/disable the color gradient overlay (default: `false`)
- **overlayOpacity**: `number` - Controls the transparency of the color overlay (0-1, default: `0.5`)

The color overlay uses the same color scale as the particle animation, mapping velocity magnitude to colors from blue (low velocity) to red (high velocity). The overlay is rendered on a separate canvas layer beneath the particle layer for optimal performance.

**Smoothing Quality Options:**
- `'low'`: Fast rendering with minimal smoothing (good for mobile devices)
- `'medium'`: Balanced quality and performance
- `'high'`: Smooth gradients with good performance (recommended default)
- `'ultra'`: Maximum smoothness using bilinear interpolation and blur effects

**API Methods:**
- `setOverlayOpacity(opacity)`: Adjust overlay transparency (0-1)
- `setOverlaySmoothing(quality)`: Change smoothing quality dynamically
- `toggleColorOverlay()`: Toggle overlay visibility on/off

## Custom Color Mapping

The `customColorMap` option allows you to define exact colors for specific wind speeds in knots, giving you complete control over the visualization appearance. This is perfect for creating weather visualizations that match specific meteorological standards or brand requirements.

```javascript
// Define your custom knot-based color mapping
const customColors = [
  { knots: 0,  color: "#9700ff" },  // Purple for calm
  { knots: 10, color: "#0096ff" },  // Blue for light wind
  { knots: 20, color: "#00e600" },  // Green for moderate wind
  { knots: 30, color: "#ffc800" },  // Orange for strong wind
  { knots: 40, color: "#dc4a1d" },  // Red for very strong wind
  { knots: 50, color: "#fe0096" }   // Pink for extreme wind
];

var velocityLayer = L.velocityLayer({
  showColorOverlay: true,
  customColorMap: customColors,    // Your custom color mapping
  particleColor: 'velocity',       // Color particles using your scheme
  data: windData
});
```

**Key Features:**
- Define colors for specific wind speeds in knots
- Automatic conversion from knots to m/s internally
- Smooth color interpolation between defined points
- Applies to both overlay gradient and particle colors
- Dynamic color scheme switching at runtime

**Color Format Support:**
- Hex colors: `"#ff0000"`
- RGB strings: `"rgb(255, 0, 0)"`
- Automatic sorting by knot values

For detailed examples and advanced usage, see [CUSTOM_COLOR_MAPPING.md](CUSTOM_COLOR_MAPPING.md).

## Public methods

| method       | params     | description                       |
| ------------ | ---------- | --------------------------------- |
| `setData`    | `{Object}` | update the layer with new data    |
| `setOptions` | `{Object}` | update the layer with new options |
| `setOverlayOpacity` | `{Number}` | set color overlay opacity (0-1) |
| `setOverlaySmoothing` | `{String}` | set smoothing quality ('low', 'medium', 'high', 'ultra') |
| `toggleColorOverlay` | none | toggle color overlay visibility |

## Build / watch

```shell
npm run watch
```

## Reference

`leaflet-velocity` is possible because of things like:

- [L.CanvasOverlay.js](https://gist.github.com/Sumbera/11114288)
- [WindJS](https://github.com/Esri/wind-js)
- [earth](https://github.com/cambecc/earth)

## Example data

Data shown for the Great Barrier Reef has been derived from [CSIRO's eReefs products](https://research.csiro.au/ereefs/)

## License

CSIRO Open Source Software Licence Agreement (variation of the BSD / MIT License)

[npm-image]: https://badge.fury.io/js/leaflet-velocity.svg
[npm-url]: https://www.npmjs.com/package/leaflet-velocity
[npm-downloads-image]: https://img.shields.io/npm/dt/leaflet-velocity.svg
