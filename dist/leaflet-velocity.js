"use strict";

/*
 Generic  Canvas Layer for leaflet 0.7 and 1.0-rc,
 copyright Stanislav Sumbera,  2016 , sumbera.com , license MIT
 originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288

 */
// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
if (!L.DomUtil.setTransform) {
  L.DomUtil.setTransform = function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
  };
} // -- support for both  0.0.7 and 1.0.0 rc2 leaflet


L.CanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  // -- initialized is called on prototype
  initialize: function initialize(options) {
    this._map = null;
    this._canvas = null;
    this._frame = null;
    this._delegate = null;
    L.setOptions(this, options);
  },
  delegate: function delegate(del) {
    this._delegate = del;
    return this;
  },
  needRedraw: function needRedraw() {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }

    return this;
  },
  //-------------------------------------------------------------
  _onLayerDidResize: function _onLayerDidResize(resizeEvent) {
    this._canvas.width = resizeEvent.newSize.x;
    this._canvas.height = resizeEvent.newSize.y;
  },
  //-------------------------------------------------------------
  _onLayerDidMove: function _onLayerDidMove() {
    var topLeft = this._map.containerPointToLayerPoint([0, 0]);

    L.DomUtil.setPosition(this._canvas, topLeft);
    this.drawLayer();
  },
  //-------------------------------------------------------------
  getEvents: function getEvents() {
    var events = {
      resize: this._onLayerDidResize,
      moveend: this._onLayerDidMove
    };

    if (this._map.options.zoomAnimation && L.Browser.any3d) {
      events.zoomanim = this._animateZoom;
    }

    return events;
  },
  //-------------------------------------------------------------
  onAdd: function onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
    this.tiles = {};

    var size = this._map.getSize();

    this._canvas.width = size.x;
    this._canvas.height = size.y;
    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, "leaflet-zoom-" + (animated ? "animated" : "hide"));
    this.options.pane.appendChild(this._canvas);
    map.on(this.getEvents(), this);
    var del = this._delegate || this;
    del.onLayerDidMount && del.onLayerDidMount(); // -- callback

    this.needRedraw();
    var self = this;
    setTimeout(function () {
      self._onLayerDidMove();
    }, 0);
  },
  //-------------------------------------------------------------
  onRemove: function onRemove(map) {
    var del = this._delegate || this;
    del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback

    this.options.pane.removeChild(this._canvas);
    map.off(this.getEvents(), this);
    this._canvas = null;
  },
  //------------------------------------------------------------
  addTo: function addTo(map) {
    map.addLayer(this);
    return this;
  },
  //------------------------------------------------------------------------------
  drawLayer: function drawLayer() {
    // -- todo make the viewInfo properties  flat objects.
    var size = this._map.getSize();

    var bounds = this._map.getBounds();

    var zoom = this._map.getZoom();

    var center = this._map.options.crs.project(this._map.getCenter());

    var corner = this._map.options.crs.project(this._map.containerPointToLatLng(this._map.getSize()));

    var del = this._delegate || this;
    del.onDrawLayer && del.onDrawLayer({
      layer: this,
      canvas: this._canvas,
      bounds: bounds,
      size: size,
      zoom: zoom,
      center: center,
      corner: corner
    });
    this._frame = null;
  },
  // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
  //------------------------------------------------------------------------------
  _setTransform: function _setTransform(el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
  },
  //------------------------------------------------------------------------------
  _animateZoom: function _animateZoom(e) {
    var scale = this._map.getZoomScale(e.zoom); // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1


    var offset = L.Layer ? this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center) : this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());
    L.DomUtil.setTransform(this._canvas, offset, scale);
  }
});

L.canvasLayer = function (pane) {
  return new L.CanvasLayer(pane);
};

L.Control.Velocity = L.Control.extend({
  options: {
    position: "bottomleft",
    emptyString: "Unavailable",
    // Could be any combination of 'bearing' (angle toward which the flow goes) or 'meteo' (angle from which the flow comes)
    // and 'CW' (angle value increases clock-wise) or 'CCW' (angle value increases counter clock-wise)
    angleConvention: "bearingCCW",
    showCardinal: false,
    // Could be 'm/s' for meter per second, 'k/h' for kilometer per hour, 'mph' for miles per hour or 'kt' for knots
    speedUnit: "m/s",
    directionString: "Direction",
    speedString: "Speed",
    onAdd: null,
    onRemove: null
  },
  onAdd: function onAdd(map) {
    this._container = L.DomUtil.create("div", "leaflet-control-velocity");
    L.DomEvent.disableClickPropagation(this._container);
    map.on("mousemove", this._onMouseMove, this);
    this._container.innerHTML = this.options.emptyString;
    if (this.options.leafletVelocity.options.onAdd) this.options.leafletVelocity.options.onAdd();
    return this._container;
  },
  onRemove: function onRemove(map) {
    map.off("mousemove", this._onMouseMove, this);
    if (this.options.leafletVelocity.options.onRemove) this.options.leafletVelocity.options.onRemove();
  },
  vectorToSpeed: function vectorToSpeed(uMs, vMs, unit) {
    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2)); // Default is m/s

    if (unit === "k/h") {
      return this.meterSec2kilometerHour(velocityAbs);
    } else if (unit === "kt") {
      return this.meterSec2Knots(velocityAbs);
    } else if (unit === "mph") {
      return this.meterSec2milesHour(velocityAbs);
    } else {
      return velocityAbs;
    }
  },
  vectorToDegrees: function vectorToDegrees(uMs, vMs, angleConvention) {
    // Default angle convention is CW
    if (angleConvention.endsWith("CCW")) {
      // vMs comes out upside-down..
      vMs = vMs > 0 ? vMs = -vMs : Math.abs(vMs);
    }

    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));
    var velocityDir = Math.atan2(uMs / velocityAbs, vMs / velocityAbs);
    var velocityDirToDegrees = velocityDir * 180 / Math.PI + 180;

    if (angleConvention === "bearingCW" || angleConvention === "meteoCCW") {
      velocityDirToDegrees += 180;
      if (velocityDirToDegrees >= 360) velocityDirToDegrees -= 360;
    }

    return velocityDirToDegrees;
  },
  degreesToCardinalDirection: function degreesToCardinalDirection(deg) {
    var cardinalDirection = '';

    if (deg >= 0 && deg < 11.25 || deg >= 348.75) {
      cardinalDirection = 'N';
    } else if (deg >= 11.25 && deg < 33.75) {
      cardinalDirection = 'NNW';
    } else if (deg >= 33.75 && deg < 56.25) {
      cardinalDirection = 'NW';
    } else if (deg >= 56.25 && deg < 78.75) {
      cardinalDirection = 'WNW';
    } else if (deg >= 78.25 && deg < 101.25) {
      cardinalDirection = 'W';
    } else if (deg >= 101.25 && deg < 123.75) {
      cardinalDirection = 'WSW';
    } else if (deg >= 123.75 && deg < 146.25) {
      cardinalDirection = 'SW';
    } else if (deg >= 146.25 && deg < 168.75) {
      cardinalDirection = 'SSW';
    } else if (deg >= 168.75 && deg < 191.25) {
      cardinalDirection = 'S';
    } else if (deg >= 191.25 && deg < 213.75) {
      cardinalDirection = 'SSE';
    } else if (deg >= 213.75 && deg < 236.25) {
      cardinalDirection = 'SE';
    } else if (deg >= 236.25 && deg < 258.75) {
      cardinalDirection = 'ESE';
    } else if (deg >= 258.75 && deg < 281.25) {
      cardinalDirection = 'E';
    } else if (deg >= 281.25 && deg < 303.75) {
      cardinalDirection = 'ENE';
    } else if (deg >= 303.75 && deg < 326.25) {
      cardinalDirection = 'NE';
    } else if (deg >= 326.25 && deg < 348.75) {
      cardinalDirection = 'NNE';
    }

    return cardinalDirection;
  },
  meterSec2Knots: function meterSec2Knots(meters) {
    return meters / 0.514;
  },
  meterSec2kilometerHour: function meterSec2kilometerHour(meters) {
    return meters * 3.6;
  },
  meterSec2milesHour: function meterSec2milesHour(meters) {
    return meters * 2.23694;
  },
  _onMouseMove: function _onMouseMove(e) {
    var self = this;

    var pos = this.options.leafletVelocity._map.containerPointToLatLng(L.point(e.containerPoint.x, e.containerPoint.y));

    var gridValue = this.options.leafletVelocity._windy.interpolatePoint(pos.lng, pos.lat);

    var htmlOut = "";

    if (gridValue && !isNaN(gridValue[0]) && !isNaN(gridValue[1]) && gridValue[2]) {
      var deg = self.vectorToDegrees(gridValue[0], gridValue[1], this.options.angleConvention);
      var cardinal = this.options.showCardinal ? " (".concat(self.degreesToCardinalDirection(deg), ") ") : '';
      htmlOut = "<strong> ".concat(this.options.velocityType, " ").concat(this.options.directionString, ": </strong> ").concat(deg.toFixed(2), "\xB0").concat(cardinal, ", <strong> ").concat(this.options.velocityType, " ").concat(this.options.speedString, ": </strong> ").concat(self.vectorToSpeed(gridValue[0], gridValue[1], this.options.speedUnit).toFixed(2), " ").concat(this.options.speedUnit);
    } else {
      htmlOut = this.options.emptyString;
    }

    self._container.innerHTML = htmlOut;
  }
});
L.Map.mergeOptions({
  positionControl: false
});
L.Map.addInitHook(function () {
  if (this.options.positionControl) {
    this.positionControl = new L.Control.MousePosition();
    this.addControl(this.positionControl);
  }
});

L.control.velocity = function (options) {
  return new L.Control.Velocity(options);
};

L.VelocityLayer = (L.Layer ? L.Layer : L.Class).extend({
  options: {
    displayValues: true,
    displayOptions: {
      velocityType: "Velocity",
      position: "bottomleft",
      emptyString: "No velocity data"
    },
    maxVelocity: 10,
    // used to align color scale
    colorScale: null,
    customColorMap: null,
    // array of color strings for custom color mapping (same format as colorScale)
    particleColor: 'default',
    // particle color mode: 'velocity', 'default', or specific color string
    data: null,
    showColorOverlay: false,
    // option to show color overlay
    overlayOpacity: 0.5,
    // opacity of the color overlay
    overlaySmoothing: 'high',
    // smoothing quality: 'low', 'medium', 'high', 'ultra'
    viewportOnly: false,
    // if true, only display data in current map viewport (improves performance)
    autoUpdateOnMove: true // if true and viewportOnly is enabled, automatically update on map pan/zoom

  },
  _map: null,
  _canvasLayer: null,
  _overlayCanvasLayer: null,
  // separate canvas for color overlay
  _windy: null,
  _context: null,
  _overlayContext: null,
  // context for overlay canvas
  _timer: 0,
  _mouseControl: null,
  initialize: function initialize(options) {
    L.setOptions(this, options);
  },
  onAdd: function onAdd(map) {
    // determine where to add the layer
    this._paneName = this.options.paneName || "overlayPane"; // fall back to overlayPane for leaflet < 1

    var pane = map._panes.overlayPane;

    if (map.getPane) {
      // attempt to get pane first to preserve parent (createPane voids this)
      pane = map.getPane(this._paneName);

      if (!pane) {
        pane = map.createPane(this._paneName);
      }
    } // Create separate panes for overlay and particles to control layering


    var overlayPane = pane;
    var particlePane = pane;

    if (this.options.showColorOverlay && map.createPane) {
      // Create overlay pane (lower z-index)
      var overlayPaneName = this._paneName + '-overlay';
      overlayPane = map.getPane(overlayPaneName);

      if (!overlayPane) {
        overlayPane = map.createPane(overlayPaneName);
        overlayPane.style.zIndex = 200; // Lower z-index for overlay
      } // Create particle pane (higher z-index)  


      var particlePaneName = this._paneName + '-particles';
      particlePane = map.getPane(particlePaneName);

      if (!particlePane) {
        particlePane = map.createPane(particlePaneName);
        particlePane.style.zIndex = 210; // Higher z-index for particles
      }
    } // create overlay canvas first (background layer)


    if (this.options.showColorOverlay) {
      this._createOverlayLayer(overlayPane);
    } // create main canvas for particles (foreground layer)


    this._canvasLayer = L.canvasLayer({
      pane: particlePane
    }).delegate(this);

    this._canvasLayer.addTo(map);

    this._map = map;
  },
  _createOverlayLayer: function _createOverlayLayer(pane) {
    if (!this._overlayCanvasLayer) {
      this._overlayCanvasLayer = L.canvasLayer({
        pane: pane
      }).delegate(this);

      this._overlayCanvasLayer.addTo(this._map); // Set opacity after canvas is created


      var self = this;
      setTimeout(function () {
        if (self.options.overlayOpacity !== undefined && self._overlayCanvasLayer && self._overlayCanvasLayer._canvas) {
          self._overlayCanvasLayer._canvas.style.opacity = self.options.overlayOpacity;
        }
      }, 0);
    }
  },
  onRemove: function onRemove(map) {
    this._destroyWind();
  },
  setData: function setData(data) {
    this.options.data = data;

    if (this._windy) {
      this._windy.setData(data);

      this._clearAndRestart();
    }

    this.fire("load");
  },
  setOpacity: function setOpacity(opacity) {
    this._canvasLayer.setOpacity(opacity);

    if (this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = this.options.overlayOpacity;
    }
  },
  setOverlayOpacity: function setOverlayOpacity(opacity) {
    this.options.overlayOpacity = opacity;

    if (this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = opacity;
    }
  },
  setOverlaySmoothing: function setOverlaySmoothing(smoothing) {
    this.options.overlaySmoothing = smoothing;

    if (this.options.showColorOverlay && this._windy && this._windy.field) {
      this._drawColorOverlay();
    }
  },
  toggleColorOverlay: function toggleColorOverlay() {
    this.setOptions({
      showColorOverlay: !this.options.showColorOverlay
    });
  },
  toggleViewportOnly: function toggleViewportOnly() {
    this.setOptions({
      viewportOnly: !this.options.viewportOnly
    });
  },
  setViewportOnly: function setViewportOnly(enabled) {
    this.setOptions({
      viewportOnly: enabled
    });
  },
  setOptions: function setOptions(options) {
    this.options = Object.assign(this.options, options);

    if (options.hasOwnProperty("displayOptions")) {
      this.options.displayOptions = Object.assign(this.options.displayOptions, options.displayOptions);

      this._initMouseHandler(true);
    }

    if (options.hasOwnProperty("data")) this.options.data = options.data;

    if (this._windy) {
      this._windy.setOptions(options);

      if (options.hasOwnProperty("data")) this._windy.setData(options.data);

      this._clearAndRestart();
    } // Handle viewport-only mode changes


    if (options.hasOwnProperty("viewportOnly")) {
      if (this.options.viewportOnly && this.options.autoUpdateOnMove) {
        // Enable viewport-only event handlers
        if (this._map) {
          this._map.on("moveend", this._onViewportChange, this);

          this._map.on("zoomend", this._onViewportChange, this);
        }
      } else {
        // Disable viewport-only event handlers
        if (this._map) {
          this._map.off("moveend", this._onViewportChange, this);

          this._map.off("zoomend", this._onViewportChange, this);
        }
      }
    } // Handle overlay opacity changes


    if (options.hasOwnProperty("overlayOpacity") && this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = this.options.overlayOpacity;

      if (this.options.showColorOverlay && this._windy && this._windy.field) {
        this._drawColorOverlay();
      }
    } // Handle showColorOverlay changes


    if (options.hasOwnProperty("showColorOverlay")) {
      if (this.options.showColorOverlay) {
        // Enable overlay - create layer if it doesn't exist
        if (!this._overlayCanvasLayer) {
          var overlayPane = this._map._panes.overlayPane;

          if (this._map.getPane && this._map.createPane) {
            var overlayPaneName = (this._paneName || "overlayPane") + '-overlay';
            overlayPane = this._map.getPane(overlayPaneName);

            if (!overlayPane) {
              overlayPane = this._map.createPane(overlayPaneName);
              overlayPane.style.zIndex = 200;
            }
          }

          this._createOverlayLayer(overlayPane);
        } // Draw overlay if field is ready


        if (this._windy && this._windy.field) {
          this._drawColorOverlay();
        }
      } else {
        // Disable overlay - clear it
        if (this._overlayContext && this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
          this._overlayContext.clearRect(0, 0, this._overlayCanvasLayer._canvas.width, this._overlayCanvasLayer._canvas.height);
        }
      }
    }

    this.fire("load");
  },

  /*------------------------------------ PRIVATE ------------------------------------------*/
  onDrawLayer: function onDrawLayer(overlay, params) {
    var self = this;

    if (!this._windy) {
      this._initWindy(this);

      return;
    }

    if (!this.options.data) {
      return;
    }

    if (this._timer) clearTimeout(self._timer);
    this._timer = setTimeout(function () {
      self._startWindy();
    }, 750); // showing velocity is delayed
  },
  _startWindy: function _startWindy() {
    var bounds = this._map.getBounds();

    var size = this._map.getSize(); // bounds, width, height, extent


    this._windy.start([[0, 0], [size.x, size.y]], size.x, size.y, [[bounds._southWest.lng, bounds._southWest.lat], [bounds._northEast.lng, bounds._northEast.lat]]);
  },
  _initWindy: function _initWindy(self) {
    // Check if canvas layer is properly initialized
    if (!self._canvasLayer || !self._canvasLayer._canvas) {
      console.error('Canvas layer not properly initialized');
      return;
    } // windy object, copy options


    var options = Object.assign({
      canvas: self._canvasLayer._canvas,
      map: this._map,
      onFieldReady: function onFieldReady() {
        if (self.options.showColorOverlay && self._overlayContext) {
          self._drawColorOverlay();
        }
      }
    }, self.options);
    this._windy = new Windy(options); // prepare context global var, start drawing

    this._context = this._canvasLayer._canvas.getContext("2d");

    this._canvasLayer._canvas.classList.add("velocity-overlay");

    if (this.options.showColorOverlay && this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayContext = this._overlayCanvasLayer._canvas.getContext("2d");

      this._overlayCanvasLayer._canvas.classList.add("color-overlay");
    }

    this.onDrawLayer();

    this._map.on("dragstart", self._windy.stop);

    this._map.on("dragend", self._clearAndRestart);

    this._map.on("zoomstart", self._windy.stop);

    this._map.on("zoomend", self._clearAndRestart);

    this._map.on("resize", self._clearWind); // Add viewport-only event handlers if enabled


    if (this.options.viewportOnly && this.options.autoUpdateOnMove) {
      this._map.on("moveend", self._onViewportChange, this);

      this._map.on("zoomend", self._onViewportChange, this);
    }

    this._initMouseHandler(false);
  },
  _initMouseHandler: function _initMouseHandler(voidPrevious) {
    if (voidPrevious) {
      this._map.removeControl(this._mouseControl);

      this._mouseControl = false;
    }

    if (!this._mouseControl && this.options.displayValues) {
      var options = this.options.displayOptions || {};
      options["leafletVelocity"] = this;
      this._mouseControl = L.control.velocity(options).addTo(this._map);
    }
  },
  _onViewportChange: function _onViewportChange() {
    // Debounce viewport changes to avoid excessive updates
    if (this._viewportTimer) clearTimeout(this._viewportTimer);
    var self = this;
    this._viewportTimer = setTimeout(function () {
      if (self.options.viewportOnly && self._windy) {
        self._clearAndRestart(); // Log summary after restart is complete


        setTimeout(function () {
          if (self._windy && self._windy.logFilteringSummary) {
            self._windy.logFilteringSummary();
          }
        }, 600); // Wait for processing to complete
      }
    }, 300); // 300ms debounce
  },
  _clearAndRestart: function _clearAndRestart() {
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._overlayContext) this._overlayContext.clearRect(0, 0, 3000, 3000);
    if (this._windy) this._startWindy();
  },
  _clearWind: function _clearWind() {
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._overlayContext) this._overlayContext.clearRect(0, 0, 3000, 3000);
  },
  _drawColorOverlay: function _drawColorOverlay() {
    if (!this._overlayContext || !this._windy || !this._windy.field) {
      console.log('Color overlay not ready:', {
        context: !!this._overlayContext,
        windy: !!this._windy,
        field: !!(this._windy && this._windy.field)
      });
      return;
    }

    var canvas = this._overlayCanvasLayer._canvas;

    if (!canvas) {
      console.log('Overlay canvas not available');
      return;
    }

    var width = canvas.width;
    var height = canvas.height; // Clear previous overlay

    this._overlayContext.clearRect(0, 0, width, height);

    try {
      // Determine color scale to use - customColorMap takes precedence over colorScale
      var colorScale;

      if (this.options.customColorMap && Array.isArray(this.options.customColorMap)) {
        colorScale = this.options.customColorMap;
        console.log('Using custom color map:', {
          colors: colorScale.slice(0, 3),
          totalColors: colorScale.length
        });
      } else {
        colorScale = this.options.colorScale || ["rgb(36,104, 180)", "rgb(60,157, 194)", "rgb(128,205,193)", "rgb(151,218,168)", "rgb(198,231,181)", "rgb(238,247,217)", "rgb(255,238,159)", "rgb(252,217,125)", "rgb(255,182,100)", "rgb(252,150,75)", "rgb(250,112,52)", "rgb(245,64,32)", "rgb(237,45,28)", "rgb(220,24,32)", "rgb(180,0,35)"];
      } // Convert color scale to RGB values


      var rgbColors = colorScale.map(function (color) {
        // Handle hex colors
        if (color.startsWith && color.startsWith('#')) {
          var hex = color.slice(1);
          var r = parseInt(hex.slice(0, 2), 16);
          var g = parseInt(hex.slice(2, 4), 16);
          var b = parseInt(hex.slice(4, 6), 16);
          return [r, g, b];
        } // Handle RGB strings


        var match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0];
      });
      console.log('Color scale debug:', {
        originalColors: colorScale.slice(0, 3),
        parsedColors: rgbColors.slice(0, 3),
        totalColors: rgbColors.length
      });
      var minVelocity = this.options.minVelocity || 0;
      var maxVelocity = this.options.maxVelocity || 10;
      var field = this._windy.field;
      var alpha = 255; // Use full alpha, control opacity via canvas style

      console.log('Alpha and velocity range:', {
        minVelocity: minVelocity,
        maxVelocity: maxVelocity,
        alpha: alpha,
        overlayOpacity: this.options.overlayOpacity
      }); // Use smoother sampling - create a grid of velocity samples

      var smoothingLevel = this.options.overlaySmoothing || 'high';
      var sampleGrid;
      var blurAmount; // Adjust sampling and blur based on quality setting

      switch (smoothingLevel) {
        case 'low':
          sampleGrid = 32;
          blurAmount = 0;
          break;

        case 'medium':
          sampleGrid = 24;
          blurAmount = 0.5;
          break;

        case 'high':
          sampleGrid = 16;
          blurAmount = 1;
          break;

        case 'ultra':
          sampleGrid = 12;
          blurAmount = 1.5;
          break;

        default:
          sampleGrid = 16;
          blurAmount = 1;
      }

      var velocityGrid = [];
      var debugInfo = {
        sampleCount: 0,
        velocitySum: 0,
        maxFound: 0,
        minFound: Infinity,
        normalizedSamples: [],
        totalSamplePoints: 0,
        filteredOutPoints: 0,
        validVelocityPoints: 0
      }; // First pass: Create a coarse grid of velocity samples

      for (var gy = 0; gy < height; gy += sampleGrid) {
        velocityGrid[gy] = velocityGrid[gy] || [];

        for (var gx = 0; gx < width; gx += sampleGrid) {
          try {
            debugInfo.totalSamplePoints++; // Check viewport filtering for color overlay

            var shouldSample = true;

            if (this.options.viewportOnly && this._windy.isViewportOnlyEnabled && this._windy.isViewportOnlyEnabled()) {
              var coord = this._windy.invert(gx, gy);

              if (coord && this._windy.isInViewport) {
                shouldSample = this._windy.isInViewport(coord[0], coord[1]);
              }
            }

            if (shouldSample) {
              var velocity = field(gx, gy);

              if (velocity && velocity.length >= 3 && velocity[2] !== null && !isNaN(velocity[2])) {
                debugInfo.validVelocityPoints++;
                var magnitude = velocity[2];
                var normalizedMagnitude = Math.max(0, Math.min(1, (magnitude - minVelocity) / (maxVelocity - minVelocity)));
                velocityGrid[gy][gx] = normalizedMagnitude; // Debug info

                debugInfo.sampleCount++;
                debugInfo.velocitySum += magnitude;
                debugInfo.maxFound = Math.max(debugInfo.maxFound, magnitude);
                debugInfo.minFound = Math.min(debugInfo.minFound, magnitude); // Collect some normalized samples for analysis

                if (debugInfo.normalizedSamples.length < 10) {
                  debugInfo.normalizedSamples.push({
                    raw: magnitude,
                    normalized: normalizedMagnitude,
                    position: [gx, gy]
                  });
                }
              } else {
                velocityGrid[gy][gx] = 0;
              }
            } else {
              // Outside viewport - set to 0 (transparent)
              velocityGrid[gy][gx] = 0;
              debugInfo.filteredOutPoints++;
            }
          } catch (e) {
            velocityGrid[gy][gx] = 0;
          }
        }
      }

      console.log('🎨 Color Overlay Debug Info:', {
        mode: 'Color Overlay',
        totalSamplePoints: debugInfo.totalSamplePoints,
        validVelocityPoints: debugInfo.validVelocityPoints,
        filteredOutPoints: debugInfo.filteredOutPoints,
        drawnPoints: debugInfo.sampleCount,
        viewportOnlyEnabled: this.options.viewportOnly,
        filteringRate: debugInfo.totalSamplePoints > 0 ? (debugInfo.filteredOutPoints / debugInfo.totalSamplePoints * 100).toFixed(1) + '%' : '0%',
        avgVelocity: debugInfo.sampleCount > 0 ? (debugInfo.velocitySum / debugInfo.sampleCount).toFixed(2) : 0,
        velocityRange: {
          min: minVelocity,
          max: maxVelocity,
          actualMin: debugInfo.minFound !== Infinity ? debugInfo.minFound.toFixed(2) : 'N/A',
          actualMax: debugInfo.maxFound.toFixed(2)
        },
        colorCount: rgbColors.length,
        sampleGrid: sampleGrid
      }); // Second pass: Use bilinear interpolation to create smooth gradients

      this._drawSmoothGradient(velocityGrid, sampleGrid, width, height, rgbColors, alpha, blurAmount);

      console.log('Smooth color overlay drawn successfully');
    } catch (error) {
      console.error('Error drawing color overlay:', error);
    }
  },
  _drawSmoothGradient: function _drawSmoothGradient(velocityGrid, sampleGrid, width, height, rgbColors, alpha, blurAmount) {
    var imageData = this._overlayContext.createImageData(width, height);

    var data = imageData.data; // Helper function for bilinear interpolation

    function bilinearInterpolate(x, y, x1, y1, x2, y2, q11, q12, q21, q22) {
      var r1 = (x2 - x) / (x2 - x1) * q11 + (x - x1) / (x2 - x1) * q21;
      var r2 = (x2 - x) / (x2 - x1) * q12 + (x - x1) / (x2 - x1) * q22;
      return (y2 - y) / (y2 - y1) * r1 + (y - y1) / (y2 - y1) * r2;
    } // Helper function to get color from normalized magnitude


    function getColorFromMagnitude(normalizedMagnitude) {
      if (normalizedMagnitude <= 0) return [0, 0, 0, 0];
      var colorIndex = Math.min(rgbColors.length - 1, Math.floor(normalizedMagnitude * rgbColors.length));
      var nextColorIndex = Math.min(rgbColors.length - 1, colorIndex + 1); // Interpolate between colors for smoother transitions

      var t = normalizedMagnitude * rgbColors.length - colorIndex;
      var rgb1 = rgbColors[colorIndex];
      var rgb2 = rgbColors[nextColorIndex];
      var result = [Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t), Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t), Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t), alpha]; // Debug: Log first few color mappings

      if (Math.random() < 0.001) {
        console.log('Color mapping:', {
          normalizedMagnitude: normalizedMagnitude,
          colorIndex: colorIndex,
          color: result,
          rgb1: rgb1,
          rgb2: rgb2
        });
      }

      return result;
    } // Render each pixel with interpolated values


    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var pixelIndex = (y * width + x) * 4; // Find the four nearest grid points

        var gx1 = Math.floor(x / sampleGrid) * sampleGrid;
        var gy1 = Math.floor(y / sampleGrid) * sampleGrid;
        var gx2 = Math.min(gx1 + sampleGrid, width - 1);
        var gy2 = Math.min(gy1 + sampleGrid, height - 1); // Get the four corner values

        var q11 = velocityGrid[gy1] && velocityGrid[gy1][gx1] !== undefined ? velocityGrid[gy1][gx1] : 0;
        var q12 = velocityGrid[gy2] && velocityGrid[gy2][gx1] !== undefined ? velocityGrid[gy2][gx1] : 0;
        var q21 = velocityGrid[gy1] && velocityGrid[gy1][gx2] !== undefined ? velocityGrid[gy1][gx2] : 0;
        var q22 = velocityGrid[gy2] && velocityGrid[gy2][gx2] !== undefined ? velocityGrid[gy2][gx2] : 0; // Perform bilinear interpolation

        var interpolatedValue;

        if (gx1 === gx2 && gy1 === gy2) {
          interpolatedValue = q11;
        } else if (gx1 === gx2) {
          interpolatedValue = q11 + (q12 - q11) * ((y - gy1) / (gy2 - gy1));
        } else if (gy1 === gy2) {
          interpolatedValue = q11 + (q21 - q11) * ((x - gx1) / (gx2 - gx1));
        } else {
          interpolatedValue = bilinearInterpolate(x, y, gx1, gy1, gx2, gy2, q11, q12, q21, q22);
        } // Get color for this interpolated value


        var color = getColorFromMagnitude(interpolatedValue); // Set pixel color

        if (pixelIndex < data.length - 3) {
          data[pixelIndex] = color[0]; // R

          data[pixelIndex + 1] = color[1]; // G

          data[pixelIndex + 2] = color[2]; // B

          data[pixelIndex + 3] = color[3]; // A
        }
      }
    }

    this._overlayContext.putImageData(imageData, 0, 0); // Apply additional smoothing filter for even better results


    if (blurAmount > 0) {
      this._overlayContext.filter = 'blur(' + blurAmount + 'px)';
      this._overlayContext.globalCompositeOperation = 'source-over';

      this._overlayContext.drawImage(this._overlayCanvasLayer._canvas, 0, 0);

      this._overlayContext.filter = 'none';
    }
  },
  _destroyWind: function _destroyWind() {
    if (this._timer) clearTimeout(this._timer);
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._overlayContext) this._overlayContext.clearRect(0, 0, 3000, 3000);
    if (this._mouseControl) this._map.removeControl(this._mouseControl);
    this._mouseControl = null;
    this._windy = null;
    if (this._canvasLayer) this._map.removeLayer(this._canvasLayer);
    if (this._overlayCanvasLayer) this._map.removeLayer(this._overlayCanvasLayer);
  }
});

L.velocityLayer = function (options) {
  return new L.VelocityLayer(options);
};
/*  Global class for simulating the movement of particle through a 1km wind grid

 credit: All the credit for this work goes to: https://github.com/cambecc for creating the repo:
 https://github.com/cambecc/earth. The majority of this code is directly take nfrom there, since its awesome.

 This class takes a canvas element and an array of data (1km GFS from http://www.emc.ncep.noaa.gov/index.php?branch=GFS)
 and then uses a mercator (forward/reverse) projection to correctly map wind vectors in "map space".

 The "start" method tak              if (shouldDraw) {
                debugStats.visibleParticles++;
              } else {
                debugStats.filteredOutParticles++;
              }nds of the map at its current extent and starts the whole gridding,
 interpolation and animation process.
 */


var Windy = function Windy(params) {
  var MIN_VELOCITY_INTENSITY = params.minVelocity || 0; // velocity at which particle intensity is minimum (m/s)

  var MAX_VELOCITY_INTENSITY = params.maxVelocity || 10; // velocity at which particle intensity is maximum (m/s)

  var VELOCITY_SCALE = (params.velocityScale || 0.005) * (Math.pow(window.devicePixelRatio, 1 / 3) || 1); // scale for wind velocity (completely arbitrary--this value looks nice)

  var MAX_PARTICLE_AGE = params.particleAge || 90; // max number of frames a particle is drawn before regeneration

  var PARTICLE_LINE_WIDTH = params.lineWidth || 1; // line width of a drawn particle

  var PARTICLE_MULTIPLIER = params.particleMultiplier || 1 / 300; // particle count scalar (completely arbitrary--this values looks nice)

  var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6; // multiply particle count for mobiles by this amount

  var FRAME_RATE = params.frameRate || 15;
  var FRAME_TIME = 1000 / FRAME_RATE; // desired frames per second

  var OPACITY = 0.97;
  var VIEWPORT_ONLY = params.viewportOnly || false; // if true, only process data in current viewport

  var AUTO_UPDATE_ON_MOVE = params.autoUpdateOnMove !== false; // auto-update when viewport changes

  var defaulColorScale = ["rgb(0,0,0)", // Black particles only
  "rgb(0,0,0)", // All particles will be black
  "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)", "rgb(0,0,0)"];
  var colorScale = params.colorScale || defaulColorScale;
  var NULL_WIND_VECTOR = [NaN, NaN, null]; // singleton for no wind in the form: [u, v, magnitude]

  var builder;
  var grid;
  var gridData = params.data;
  var date;
  var λ0, φ0, Δλ, Δφ, ni, nj;

  var setData = function setData(data) {
    gridData = data;
  };

  var setOptions = function setOptions(options) {
    if (options.hasOwnProperty("minVelocity")) MIN_VELOCITY_INTENSITY = options.minVelocity;
    if (options.hasOwnProperty("maxVelocity")) MAX_VELOCITY_INTENSITY = options.maxVelocity;
    if (options.hasOwnProperty("velocityScale")) VELOCITY_SCALE = (options.velocityScale || 0.005) * (Math.pow(window.devicePixelRatio, 1 / 3) || 1);
    if (options.hasOwnProperty("particleAge")) MAX_PARTICLE_AGE = options.particleAge;
    if (options.hasOwnProperty("lineWidth")) PARTICLE_LINE_WIDTH = options.lineWidth;
    if (options.hasOwnProperty("particleMultiplier")) PARTICLE_MULTIPLIER = options.particleMultiplier;
    if (options.hasOwnProperty("opacity")) OPACITY = +options.opacity;
    if (options.hasOwnProperty("frameRate")) FRAME_RATE = options.frameRate;
    FRAME_TIME = 1000 / FRAME_RATE;

    if (options.hasOwnProperty("viewportOnly")) {
      var oldValue = VIEWPORT_ONLY;
      VIEWPORT_ONLY = options.viewportOnly;
      console.log('🔧 setOptions: viewportOnly changed from', oldValue, 'to', VIEWPORT_ONLY);
    }

    if (options.hasOwnProperty("autoUpdateOnMove")) AUTO_UPDATE_ON_MOVE = options.autoUpdateOnMove;
  }; // interpolation for vectors like wind (u,v,m)


  var bilinearInterpolateVector = function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
    var rx = 1 - x;
    var ry = 1 - y;
    var a = rx * ry,
        b = x * ry,
        c = rx * y,
        d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
  };

  var createWindBuilder = function createWindBuilder(uComp, vComp) {
    var uData = uComp.data,
        vData = vComp.data;
    return {
      header: uComp.header,
      //recipe: recipeFor("wind-" + uComp.header.surface1Value),
      data: function data(i) {
        return [uData[i], vData[i]];
      },
      interpolate: bilinearInterpolateVector
    };
  };

  var createBuilder = function createBuilder(data) {
    var uComp = null,
        vComp = null,
        scalar = null;
    data.forEach(function (record) {
      switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
        case "1,2":
        case "2,2":
          uComp = record;
          break;

        case "1,3":
        case "2,3":
          vComp = record;
          break;

        default:
          scalar = record;
      }
    });
    return createWindBuilder(uComp, vComp);
  };

  var buildGrid = function buildGrid(data, callback) {
    var supported = true;
    if (data.length < 2) supported = false;
    if (!supported) console.log("Windy Error: data must have at least two components (u,v)");
    builder = createBuilder(data);
    var header = builder.header;
    if (header.hasOwnProperty("gridDefinitionTemplate") && header.gridDefinitionTemplate != 0) supported = false;

    if (!supported) {
      console.log("Windy Error: Only data with Latitude_Longitude coordinates is supported");
    }

    supported = true; // reset for futher checks

    λ0 = header.lo1;
    φ0 = header.la1; // the grid's origin (e.g., 0.0E, 90.0N)

    Δλ = header.dx;
    Δφ = header.dy; // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)

    ni = header.nx;
    nj = header.ny; // number of grid points W-E and N-S (e.g., 144 x 73)

    if (header.hasOwnProperty("scanMode")) {
      var scanModeMask = header.scanMode.toString(2);
      scanModeMask = ('0' + scanModeMask).slice(-8);
      var scanModeMaskArray = scanModeMask.split('').map(Number).map(Boolean);
      if (scanModeMaskArray[0]) Δλ = -Δλ;
      if (scanModeMaskArray[1]) Δφ = -Δφ;
      if (scanModeMaskArray[2]) supported = false;
      if (scanModeMaskArray[3]) supported = false;
      if (scanModeMaskArray[4]) supported = false;
      if (scanModeMaskArray[5]) supported = false;
      if (scanModeMaskArray[6]) supported = false;
      if (scanModeMaskArray[7]) supported = false;
      if (!supported) console.log("Windy Error: Data with scanMode: " + header.scanMode + " is not supported.");
    }

    date = new Date(header.refTime);
    date.setHours(date.getHours() + header.forecastTime); // Scan modes 0, 64 allowed.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml

    grid = [];
    var p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;

    for (var j = 0; j < nj; j++) {
      var row = [];

      for (var i = 0; i < ni; i++, p++) {
        var value = builder.data(p); // Keep all grid data available - filtering happens during particle rendering

        row[i] = value;
      }

      if (isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }

      grid[j] = row;
    }

    callback({
      date: date,
      interpolate: interpolate
    });
  }; // Debug counters for data point filtering


  var interpolationStats = {
    totalRequests: 0,
    filteredOutRequests: 0,
    validDataPoints: 0,
    resetTime: Date.now()
  };
  /**
   * Get interpolated grid value from Lon/Lat position
   * @param λ {Float} Longitude
   * @param φ {Float} Latitude
   * @returns {Object}
   */

  var interpolate = function interpolate(λ, φ) {
    if (!grid) return null;
    var i = floorMod(λ - λ0, 360) / Δλ; // calculate longitude index in wrapped range [0, 360)

    var j = (φ0 - φ) / Δφ; // calculate latitude index in direction +90 to -90

    var fi = Math.floor(i),
        ci = fi + 1;
    var fj = Math.floor(j),
        cj = fj + 1;
    var row;

    if (row = grid[fj]) {
      var g00 = row[fi];
      var g10 = row[ci];

      if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
        var g01 = row[fi];
        var g11 = row[ci];

        if (isValue(g01) && isValue(g11)) {
          // All four points found, so interpolate the value.
          return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
        }
      }
    }

    return null;
  };
  /**
   * @returns {Boolean} true if the specified value is not null and not undefined.
   */


  var isValue = function isValue(x) {
    return x !== null && x !== undefined;
  };
  /**
   * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
   *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
   */


  var floorMod = function floorMod(a, n) {
    return a - n * Math.floor(a / n);
  };
  /**
   * @returns {Number} the value x clamped to the range [low, high].
   */


  var clamp = function clamp(x, range) {
    return Math.max(range[0], Math.min(x, range[1]));
  };
  /**
   * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
   */


  var isMobile = function isMobile() {
    return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
  };
  /**
   * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
   * vector is modified in place and returned by this function.
   */


  var distort = function distort(projection, λ, φ, x, y, scale, wind) {
    var u = wind[0] * scale;
    var v = wind[1] * scale;
    var d = distortion(projection, λ, φ, x, y); // Scale distortion vectors by u and v, then add.

    wind[0] = d[0] * u + d[2] * v;
    wind[1] = d[1] * u + d[3] * v;
    return wind;
  };

  var distortion = function distortion(projection, λ, φ, x, y) {
    var τ = 2 * Math.PI; //    var H = Math.pow(10, -5.2); // 0.00000630957344480193
    //    var H = 0.0000360;          // 0.0000360°φ ~= 4m  (from https://github.com/cambecc/earth/blob/master/public/libs/earth/1.0.0/micro.js#L13)

    var H = 5; // ToDo:   Why does this work?

    var hλ = λ < 0 ? H : -H;
    var hφ = φ < 0 ? H : -H;
    var pλ = project(φ, λ + hλ);
    var pφ = project(φ + hφ, λ); // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1º λ
    // changes depending on φ. Without this, there is a pinching effect at the poles.

    var k = Math.cos(φ / 360 * τ);
    return [(pλ[0] - x) / hλ / k, (pλ[1] - y) / hλ / k, (pφ[0] - x) / hφ, (pφ[1] - y) / hφ];
  };

  var createField = function createField(columns, bounds, callback) {
    /**
     * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
     *          is undefined at that point.
     */
    function field(x, y) {
      var column = columns[Math.round(x)];
      return column && column[Math.round(y)] || NULL_WIND_VECTOR;
    } // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
    // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.


    field.release = function () {
      columns = [];
    };

    field.randomize = function (o) {
      var x, y;
      var safetyNet = 0;
      var viewportAttempts = 0;
      var maxViewportAttempts = VIEWPORT_ONLY && currentViewportBounds ? 50 : 0;

      do {
        x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
        y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y); // If viewport filtering is enabled, strongly prefer points within viewport

        if (VIEWPORT_ONLY && currentViewportBounds && viewportAttempts < maxViewportAttempts) {
          var coord = invert(x, y);

          if (coord && !isInViewport(coord[0], coord[1])) {
            viewportAttempts++;
            continue; // Try again if outside viewport
          }
        } // Check if there's valid wind data at this location


        var windData = field(x, y);

        if (windData[2] !== null) {
          break; // Found a valid location
        }
      } while (safetyNet++ < 30);

      o.x = x;
      o.y = y;
      return o;
    };

    callback(bounds, field);
  };

  var buildBounds = function buildBounds(bounds, width, height) {
    var upperLeft = bounds[0];
    var lowerRight = bounds[1];
    var x = Math.round(upperLeft[0]); //Math.max(Math.floor(upperLeft[0], 0), 0);

    var y = Math.max(Math.floor(upperLeft[1], 0), 0);
    var xMax = Math.min(Math.ceil(lowerRight[0], width), width - 1);
    var yMax = Math.min(Math.ceil(lowerRight[1], height), height - 1);
    return {
      x: x,
      y: y,
      xMax: width,
      yMax: yMax,
      width: width,
      height: height
    };
  };

  var deg2rad = function deg2rad(deg) {
    return deg / 180 * Math.PI;
  };

  var invert = function invert(x, y, windy) {
    var latlon = params.map.containerPointToLatLng(L.point(x, y));
    return [latlon.lng, latlon.lat];
  };

  var project = function project(lat, lon, windy) {
    var xy = params.map.latLngToContainerPoint(L.latLng(lat, lon));
    return [xy.x, xy.y];
  };

  var interpolateField = function interpolateField(grid, bounds, extent, callback) {
    var projection = {}; // map.crs used instead

    var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
    var velocityScale = VELOCITY_SCALE * Math.pow(mapArea, 0.4);
    var columns = [];
    var x = bounds.x;

    function interpolateColumn(x) {
      var column = [];

      for (var y = bounds.y; y <= bounds.yMax; y += 2) {
        var coord = invert(x, y);

        if (coord) {
          var λ = coord[0],
              φ = coord[1];

          if (isFinite(λ)) {
            var wind = grid.interpolate(λ, φ);

            if (wind) {
              wind = distort(projection, λ, φ, x, y, velocityScale, wind);
              column[y + 1] = column[y] = wind;
            }
          }
        }
      }

      columns[x + 1] = columns[x] = column;
    }

    (function batchInterpolate() {
      var start = Date.now();

      while (x < bounds.width) {
        interpolateColumn(x);
        x += 2;

        if (Date.now() - start > 1000) {
          //MAX_TASK_TIME) {
          setTimeout(batchInterpolate, 25);
          return;
        }
      }

      createField(columns, bounds, callback);
    })();
  };

  var animationLoop;

  var animate = function animate(bounds, field) {
    function windIntensityColorScale(min, max) {
      colorScale.indexFor = function (m) {
        // map velocity speed to a style
        return Math.max(0, Math.min(colorScale.length - 1, Math.round((m - min) / (max - min) * (colorScale.length - 1))));
      };

      return colorScale;
    }

    var colorStyles = windIntensityColorScale(MIN_VELOCITY_INTENSITY, MAX_VELOCITY_INTENSITY);
    var buckets = colorStyles.map(function () {
      return [];
    });
    var particleCount = Math.round(bounds.width * bounds.height * PARTICLE_MULTIPLIER);

    if (isMobile()) {
      particleCount *= PARTICLE_REDUCTION;
    }

    var fadeFillStyle = "rgba(0, 0, 0, ".concat(OPACITY, ")");
    var particles = [];

    for (var i = 0; i < particleCount; i++) {
      particles.push(field.randomize({
        age: Math.floor(Math.random() * MAX_PARTICLE_AGE) + 0
      }));
    }

    function evolve() {
      buckets.forEach(function (bucket) {
        bucket.length = 0;
      }); // Debug: Track viewport filtering statistics

      var debugStats = {
        totalParticles: particles.length,
        visibleParticles: 0,
        filteredOutParticles: 0,
        validFieldParticles: 0,
        drawnParticles: 0
      };
      particles.forEach(function (particle) {
        if (particle.age > MAX_PARTICLE_AGE) {
          field.randomize(particle).age = 0;
        }

        var x = particle.x;
        var y = particle.y;
        var v = field(x, y); // vector at current position

        var m = v[2];

        if (m === null) {
          particle.age = MAX_PARTICLE_AGE; // particle has escaped the grid, never to return...
        } else {
          debugStats.validFieldParticles++;
          var xt = x + v[0];
          var yt = y + v[1]; // Check if particle should be visible based on viewport filtering

          var shouldDraw = true;

          if (VIEWPORT_ONLY && currentViewportBounds) {
            var coord = invert(x, y);

            if (coord && isFinite(coord[0]) && isFinite(coord[1])) {
              shouldDraw = isInViewport(coord[0], coord[1]);

              if (shouldDraw) {
                debugStats.visibleParticles++;
              } else {
                debugStats.filteredOutParticles++;
              } // Debug: Log first few coordinate checks with more detail


              if (debugStats.validFieldParticles <= 10) {
                console.log("\uD83E\uDDEA Particle ".concat(debugStats.validFieldParticles, ": screen(").concat(x.toFixed(1), ", ").concat(y.toFixed(1), ") -> geo(").concat(coord[0].toFixed(4), ", ").concat(coord[1].toFixed(4), ") -> ").concat(shouldDraw ? 'VISIBLE' : 'FILTERED'));
              }
            } else {
              shouldDraw = false; // Invalid coordinates

              debugStats.filteredOutParticles++;
            }
          } else {
            debugStats.visibleParticles++;
          }

          if (field(xt, yt)[2] !== null && shouldDraw) {
            // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
            particle.xt = xt;
            particle.yt = yt;
            buckets[colorStyles.indexFor(m)].push(particle);
            debugStats.drawnParticles++;
          } else {
            // Particle isn't visible, but it still moves through the field.
            particle.x = xt;
            particle.y = yt;
          }
        }

        particle.age += 1;
      }); // Debug: Log particle statistics occasionally (less important than data filtering)

      if (Math.random() < 0.005) {
        // Very occasional logging for particles
        console.log('🎯 Particle Stats (visual only):', {
          totalParticles: debugStats.totalParticles,
          drawnParticles: debugStats.drawnParticles,
          note: 'Particles are just visual elements - real filtering happens at data interpolation level'
        });
      }
    }

    var g = params.canvas.getContext("2d");
    g.lineWidth = PARTICLE_LINE_WIDTH;
    g.fillStyle = fadeFillStyle;
    g.globalAlpha = 0.6;

    function draw() {
      // Fade existing particle trails.
      var prev = "lighter";
      g.globalCompositeOperation = "destination-in";
      g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      g.globalCompositeOperation = prev;
      g.globalAlpha = OPACITY === 0 ? 0 : OPACITY * 0.9; // Draw new particle trails.

      buckets.forEach(function (bucket, i) {
        if (bucket.length > 0) {
          g.beginPath();
          g.strokeStyle = colorStyles[i];
          bucket.forEach(function (particle) {
            g.moveTo(particle.x, particle.y);
            g.lineTo(particle.xt, particle.yt);
            particle.x = particle.xt;
            particle.y = particle.yt;
          });
          g.stroke();
        }
      });
    }

    var then = Date.now();

    (function frame() {
      animationLoop = requestAnimationFrame(frame);
      var now = Date.now();
      var delta = now - then;

      if (delta > FRAME_TIME) {
        then = now - delta % FRAME_TIME;
        evolve();
        draw();
      }
    })();
  }; // Store viewport bounds for filtering during interpolation


  var currentViewportBounds = null;

  var setViewportBounds = function setViewportBounds(viewportBounds) {
    if (VIEWPORT_ONLY) {
      // viewportBounds are already in radians, convert to degrees
      var viewportWest = viewportBounds.west * 180 / Math.PI;
      var viewportEast = viewportBounds.east * 180 / Math.PI;
      var viewportSouth = viewportBounds.south * 180 / Math.PI;
      var viewportNorth = viewportBounds.north * 180 / Math.PI; // Add smaller buffer around viewport (5% margin to avoid over-filtering)

      var lonBuffer = Math.abs(viewportEast - viewportWest) * 0.05;
      var latBuffer = Math.abs(viewportNorth - viewportSouth) * 0.05;
      currentViewportBounds = {
        west: viewportWest - lonBuffer,
        east: viewportEast + lonBuffer,
        south: viewportSouth - latBuffer,
        north: viewportNorth + latBuffer
      }; // Validate bounds are reasonable

      if (currentViewportBounds.west < -180) currentViewportBounds.west = -180;
      if (currentViewportBounds.east > 180) currentViewportBounds.east = 180;
      if (currentViewportBounds.south < -90) currentViewportBounds.south = -90;
      if (currentViewportBounds.north > 90) currentViewportBounds.north = 90;
      console.log('🎯 Viewport bounds set for filtering:', {
        original: {
          west: viewportWest.toFixed(4),
          east: viewportEast.toFixed(4),
          south: viewportSouth.toFixed(4),
          north: viewportNorth.toFixed(4)
        },
        withBuffer: {
          west: currentViewportBounds.west.toFixed(4),
          east: currentViewportBounds.east.toFixed(4),
          south: currentViewportBounds.south.toFixed(4),
          north: currentViewportBounds.north.toFixed(4)
        },
        bufferSize: {
          lon: lonBuffer.toFixed(4),
          lat: latBuffer.toFixed(4)
        }
      }); // Reset stats and debug counters when viewport changes

      interpolationStats.totalRequests = 0;
      interpolationStats.filteredOutRequests = 0;
      interpolationStats.validDataPoints = 0;
      interpolationStats.resetTime = Date.now();
      isInViewport.debugCount = 0; // Reset debug counter
    } else {
      currentViewportBounds = null;
      console.log('🎯 Viewport filtering disabled - processing all data');
    }
  }; // Check if a coordinate is within the current viewport


  var isInViewport = function isInViewport(lon, lat) {
    if (!VIEWPORT_ONLY || !currentViewportBounds) {
      return true; // No filtering if viewport-only is disabled
    } // Validate inputs


    if (typeof lon !== 'number' || typeof lat !== 'number' || !isFinite(lon) || !isFinite(lat)) {
      return false;
    } // Handle longitude wraparound (antimeridian crossing)


    var inLongitude = false;

    if (currentViewportBounds.west <= currentViewportBounds.east) {
      // Normal case - no wraparound
      inLongitude = lon >= currentViewportBounds.west && lon <= currentViewportBounds.east;
    } else {
      // Wraparound case - viewport crosses antimeridian
      inLongitude = lon >= currentViewportBounds.west || lon <= currentViewportBounds.east;
    }

    var inLatitude = lat >= currentViewportBounds.south && lat <= currentViewportBounds.north;
    var result = inLongitude && inLatitude; // Enhanced debug: Log viewport bounds and first few coordinate checks

    if (typeof isInViewport.debugCount === 'undefined') {
      isInViewport.debugCount = 0;
      console.log('🎯 Viewport bounds for filtering:', currentViewportBounds);
    }

    if (isInViewport.debugCount < 10) {
      console.log("\uD83D\uDD0D Viewport check [".concat(isInViewport.debugCount, "]: (").concat(lon.toFixed(4), ", ").concat(lat.toFixed(4), ") -> ").concat(result ? 'IN' : 'OUT'));
      console.log("   Bounds: W:".concat(currentViewportBounds.west.toFixed(4), " E:").concat(currentViewportBounds.east.toFixed(4), " S:").concat(currentViewportBounds.south.toFixed(4), " N:").concat(currentViewportBounds.north.toFixed(4)));
      isInViewport.debugCount++;
    }

    return result;
  }; // Debug summary log for data point filtering (called after map moves/zooms)


  var logDataFilteringSummary = function logDataFilteringSummary() {
    if (VIEWPORT_ONLY && interpolationStats.totalRequests > 0) {
      var displayedPoints = interpolationStats.validDataPoints;
      var totalDatasetSize = interpolationStats.totalRequests;
      var filteredOutPoints = interpolationStats.filteredOutRequests;
      var filteringRate = (filteredOutPoints / totalDatasetSize * 100).toFixed(1);
      console.log('🗺️ VIEWPORT FILTERING SUMMARY (after map move/zoom):', {
        status: 'Viewport-only mode ENABLED',
        currentlyDisplayed: displayedPoints + ' data points',
        wholeDataset: totalDatasetSize + ' data points',
        filtered: filteredOutPoints + ' data points (' + filteringRate + '% filtered)',
        performance: filteredOutPoints > 0 ? 'Optimized - showing only viewport data' : 'No filtering needed for current view',
        viewportBounds: currentViewportBounds ? {
          west: currentViewportBounds.west.toFixed(2),
          east: currentViewportBounds.east.toFixed(2),
          south: currentViewportBounds.south.toFixed(2),
          north: currentViewportBounds.north.toFixed(2)
        } : 'Not set'
      });
    } else if (!VIEWPORT_ONLY) {
      console.log('🗺️ VIEWPORT FILTERING SUMMARY (after map move/zoom):', {
        status: 'Viewport-only mode DISABLED',
        displaying: 'All available data (no filtering)',
        performance: 'Standard mode - processing entire dataset'
      });
    } // Reset counters for next viewport change


    interpolationStats.totalRequests = 0;
    interpolationStats.filteredOutRequests = 0;
    interpolationStats.validDataPoints = 0;
    interpolationStats.resetTime = Date.now();
  };

  var start = function start(bounds, width, height, extent) {
    var mapBounds = {
      south: deg2rad(extent[0][1]),
      north: deg2rad(extent[1][1]),
      east: deg2rad(extent[1][0]),
      west: deg2rad(extent[0][0]),
      width: width,
      height: height
    };
    stop(); // Set viewport bounds for filtering if enabled

    setViewportBounds(mapBounds); // build grid (with viewport filtering applied at grid level)

    console.log('🏗️ Building grid with viewport filtering:', VIEWPORT_ONLY ? 'ENABLED' : 'DISABLED');
    buildGrid(gridData, function (grid) {
      // interpolateField
      interpolateField(grid, buildBounds(bounds, width, height), mapBounds, function (bounds, field) {
        // animate the canvas with random points
        windy.field = field;
        animate(bounds, field); // call overlay callback if provided

        if (params.onFieldReady) {
          params.onFieldReady();
        } // Log summary after field is ready and processing is complete


        setTimeout(logDataFilteringSummary, 500);
      });
    });
  };

  var stop = function stop() {
    if (windy.field) windy.field.release();
    if (animationLoop) cancelAnimationFrame(animationLoop);
  };

  var windy = {
    params: params,
    start: start,
    stop: stop,
    createField: createField,
    interpolatePoint: interpolate,
    setData: setData,
    setOptions: setOptions,
    setViewportBounds: setViewportBounds,
    isInViewport: isInViewport,
    invert: invert,
    getCurrentViewportBounds: function getCurrentViewportBounds() {
      return currentViewportBounds;
    },
    isViewportOnlyEnabled: function isViewportOnlyEnabled() {
      return VIEWPORT_ONLY;
    },
    logFilteringSummary: logDataFilteringSummary
  };
  return windy;
};

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
}