L.VelocityLayer = (L.Layer ? L.Layer : L.Class).extend({
  options: {
    displayValues: true,
    displayOptions: {
      velocityType: "Velocity",
      position: "bottomleft",
      emptyString: "No velocity data"
    },
    maxVelocity: 10, // used to align color scale
    colorScale: null,
    customColorMap: null, // array of color strings for custom color mapping (same format as colorScale)
    data: null,
    showColorOverlay: false, // option to show color overlay
    overlayOpacity: 0.5, // opacity of the color overlay
    overlaySmoothing: 'high' // smoothing quality: 'low', 'medium', 'high', 'ultra'
  },

  _map: null,
  _canvasLayer: null,
  _overlayCanvasLayer: null, // separate canvas for color overlay
  _windy: null,
  _context: null,
  _overlayContext: null, // context for overlay canvas
  _timer: 0,
  _mouseControl: null,

  initialize: function(options) {
    L.setOptions(this, options);
  },

  onAdd: function(map) {
    // determine where to add the layer
    this._paneName = this.options.paneName || "overlayPane";

    // fall back to overlayPane for leaflet < 1
    let pane = map._panes.overlayPane;
    if (map.getPane) {
      // attempt to get pane first to preserve parent (createPane voids this)
      pane = map.getPane(this._paneName);
      if (!pane) {
        pane = map.createPane(this._paneName);
      }
    }
    
    // Create separate panes for overlay and particles to control layering
    let overlayPane = pane;
    let particlePane = pane;
    
    if (this.options.showColorOverlay && map.createPane) {
      // Create overlay pane (lower z-index)
      const overlayPaneName = this._paneName + '-overlay';
      overlayPane = map.getPane(overlayPaneName);
      if (!overlayPane) {
        overlayPane = map.createPane(overlayPaneName);
        overlayPane.style.zIndex = 200; // Lower z-index for overlay
      }
      
      // Create particle pane (higher z-index)  
      const particlePaneName = this._paneName + '-particles';
      particlePane = map.getPane(particlePaneName);
      if (!particlePane) {
        particlePane = map.createPane(particlePaneName);
        particlePane.style.zIndex = 210; // Higher z-index for particles
      }
    }
    
    // create overlay canvas first (background layer)
    if (this.options.showColorOverlay) {
      this._createOverlayLayer(overlayPane);
    }
    
    // create main canvas for particles (foreground layer)
    this._canvasLayer = L.canvasLayer({ pane: particlePane }).delegate(this);
    this._canvasLayer.addTo(map);

    this._map = map;
  },

  _createOverlayLayer: function(pane) {
    if (!this._overlayCanvasLayer) {
      this._overlayCanvasLayer = L.canvasLayer({ pane: pane }).delegate(this);
      this._overlayCanvasLayer.addTo(this._map);
      
      // Set opacity after canvas is created
      var self = this;
      setTimeout(function() {
        if (self.options.overlayOpacity !== undefined && self._overlayCanvasLayer && self._overlayCanvasLayer._canvas) {
          self._overlayCanvasLayer._canvas.style.opacity = self.options.overlayOpacity;
        }
      }, 0);
    }
  },

  onRemove: function(map) {
    this._destroyWind();
  },

  setData: function(data) {
    this.options.data = data;
    if (this._windy) {
      this._windy.setData(data);
      this._clearAndRestart();
    }
    this.fire("load");
  },

  setOpacity: function(opacity) {
    this._canvasLayer.setOpacity(opacity);
    if (this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = this.options.overlayOpacity;
    }
  },

  setOverlayOpacity: function(opacity) {
    this.options.overlayOpacity = opacity;
    if (this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = opacity;
    }
  },

  setOverlaySmoothing: function(smoothing) {
    this.options.overlaySmoothing = smoothing;
    if (this.options.showColorOverlay && this._windy && this._windy.field) {
      this._drawColorOverlay();
    }
  },

  toggleColorOverlay: function() {
    this.setOptions({
      showColorOverlay: !this.options.showColorOverlay
    });
  },

  setOptions: function(options) {
    this.options = Object.assign(this.options, options);
    if (options.hasOwnProperty("displayOptions")) {
      this.options.displayOptions = Object.assign(
        this.options.displayOptions,
        options.displayOptions
      );
      this._initMouseHandler(true);
    }
    if (options.hasOwnProperty("data")) this.options.data = options.data;
    if (this._windy) {
      this._windy.setOptions(options);
      if (options.hasOwnProperty("data")) this._windy.setData(options.data);
      this._clearAndRestart();
    }
    
    // Handle overlay opacity changes
    if (options.hasOwnProperty("overlayOpacity") && this._overlayCanvasLayer && this._overlayCanvasLayer._canvas) {
      this._overlayCanvasLayer._canvas.style.opacity = this.options.overlayOpacity;
      if (this.options.showColorOverlay && this._windy && this._windy.field) {
        this._drawColorOverlay();
      }
    }
    
    // Handle showColorOverlay changes
    if (options.hasOwnProperty("showColorOverlay")) {
      if (this.options.showColorOverlay) {
        // Enable overlay - create layer if it doesn't exist
        if (!this._overlayCanvasLayer) {
          let overlayPane = this._map._panes.overlayPane;
          if (this._map.getPane && this._map.createPane) {
            const overlayPaneName = (this._paneName || "overlayPane") + '-overlay';
            overlayPane = this._map.getPane(overlayPaneName);
            if (!overlayPane) {
              overlayPane = this._map.createPane(overlayPaneName);
              overlayPane.style.zIndex = 200;
            }
          }
          this._createOverlayLayer(overlayPane);
        }
        // Draw overlay if field is ready
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

  onDrawLayer: function(overlay, params) {
    var self = this;

    if (!this._windy) {
      this._initWindy(this);
      return;
    }

    if (!this.options.data) {
      return;
    }

    if (this._timer) clearTimeout(self._timer);

    this._timer = setTimeout(function() {
      self._startWindy();
    }, 750); // showing velocity is delayed
  },

  _startWindy: function() {
    var bounds = this._map.getBounds();
    var size = this._map.getSize();

    // bounds, width, height, extent
    this._windy.start(
      [
        [0, 0],
        [size.x, size.y]
      ],
      size.x,
      size.y,
      [
        [bounds._southWest.lng, bounds._southWest.lat],
        [bounds._northEast.lng, bounds._northEast.lat]
      ]
    );
  },

  _initWindy: function(self) {
    // Check if canvas layer is properly initialized
    if (!self._canvasLayer || !self._canvasLayer._canvas) {
      console.error('Canvas layer not properly initialized');
      return;
    }

    // windy object, copy options
    const options = Object.assign(
      { 
        canvas: self._canvasLayer._canvas, 
        map: this._map,
        onFieldReady: function() {
          if (self.options.showColorOverlay && self._overlayContext) {
            self._drawColorOverlay();
          }
        }
      },
      self.options
    );
    this._windy = new Windy(options);

    // prepare context global var, start drawing
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
    this._map.on("resize", self._clearWind);

    this._initMouseHandler(false);
  },

  _initMouseHandler: function(voidPrevious) {
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

  _clearAndRestart: function() {
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._overlayContext) this._overlayContext.clearRect(0, 0, 3000, 3000);
    if (this._windy) this._startWindy();
  },

  _clearWind: function() {
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._overlayContext) this._overlayContext.clearRect(0, 0, 3000, 3000);
  },

  _drawColorOverlay: function() {
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
    var height = canvas.height;
    
    // Clear previous overlay
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
        colorScale = this.options.colorScale || [
          "rgb(36,104, 180)",
          "rgb(60,157, 194)",
          "rgb(128,205,193)",
          "rgb(151,218,168)",
          "rgb(198,231,181)",
          "rgb(238,247,217)",
          "rgb(255,238,159)",
          "rgb(252,217,125)",
          "rgb(255,182,100)",
          "rgb(252,150,75)",
          "rgb(250,112,52)",
          "rgb(245,64,32)",
          "rgb(237,45,28)",
          "rgb(220,24,32)",
          "rgb(180,0,35)"
        ];
      }
      
      // Convert color scale to RGB values
      var rgbColors = colorScale.map(function(color) {
        // Handle hex colors
        if (color.startsWith && color.startsWith('#')) {
          var hex = color.slice(1);
          var r = parseInt(hex.slice(0, 2), 16);
          var g = parseInt(hex.slice(2, 4), 16);
          var b = parseInt(hex.slice(4, 6), 16);
          return [r, g, b];
        }
        // Handle RGB strings
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
      });
      
      // Use smoother sampling - create a grid of velocity samples
      var smoothingLevel = this.options.overlaySmoothing || 'high';
      var sampleGrid;
      var blurAmount;
      
      // Adjust sampling and blur based on quality setting
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
      var debugInfo = { sampleCount: 0, velocitySum: 0, maxFound: 0, minFound: Infinity, normalizedSamples: [] };
      
      // First pass: Create a coarse grid of velocity samples
      for (var gy = 0; gy < height; gy += sampleGrid) {
        velocityGrid[gy] = velocityGrid[gy] || [];
        for (var gx = 0; gx < width; gx += sampleGrid) {
          try {
            var velocity = field(gx, gy);
            if (velocity && velocity.length >= 3 && velocity[2] !== null && !isNaN(velocity[2])) {
              var magnitude = velocity[2];
              var normalizedMagnitude = Math.max(0, Math.min(1, (magnitude - minVelocity) / (maxVelocity - minVelocity)));
              velocityGrid[gy][gx] = normalizedMagnitude;
              
              // Debug info
              debugInfo.sampleCount++;
              debugInfo.velocitySum += magnitude;
              debugInfo.maxFound = Math.max(debugInfo.maxFound, magnitude);
              debugInfo.minFound = Math.min(debugInfo.minFound, magnitude);
              
              // Collect some normalized samples for analysis
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
          } catch (e) {
            velocityGrid[gy][gx] = 0;
          }
        }
      }
      
      console.log('Velocity Debug Info:', {
        sampleCount: debugInfo.sampleCount,
        avgVelocity: debugInfo.sampleCount > 0 ? debugInfo.velocitySum / debugInfo.sampleCount : 0,
        minVelocity: minVelocity,
        maxVelocity: maxVelocity,
        actualMin: debugInfo.minFound,
        actualMax: debugInfo.maxFound,
        colorCount: rgbColors.length,
        normalizedSamples: debugInfo.normalizedSamples
      });
      
      // Second pass: Use bilinear interpolation to create smooth gradients
      this._drawSmoothGradient(velocityGrid, sampleGrid, width, height, rgbColors, alpha, blurAmount);
      
      console.log('Smooth color overlay drawn successfully');
      
    } catch (error) {
      console.error('Error drawing color overlay:', error);
    }
  },

  _drawSmoothGradient: function(velocityGrid, sampleGrid, width, height, rgbColors, alpha, blurAmount) {
    var imageData = this._overlayContext.createImageData(width, height);
    var data = imageData.data;
    
    // Helper function for bilinear interpolation
    function bilinearInterpolate(x, y, x1, y1, x2, y2, q11, q12, q21, q22) {
      var r1 = ((x2 - x) / (x2 - x1)) * q11 + ((x - x1) / (x2 - x1)) * q21;
      var r2 = ((x2 - x) / (x2 - x1)) * q12 + ((x - x1) / (x2 - x1)) * q22;
      return ((y2 - y) / (y2 - y1)) * r1 + ((y - y1) / (y2 - y1)) * r2;
    }
    
    // Helper function to get color from normalized magnitude
    function getColorFromMagnitude(normalizedMagnitude) {
      if (normalizedMagnitude <= 0) return [0, 0, 0, 0];
      
      var colorIndex = Math.min(rgbColors.length - 1, Math.floor(normalizedMagnitude * rgbColors.length));
      var nextColorIndex = Math.min(rgbColors.length - 1, colorIndex + 1);
      
      // Interpolate between colors for smoother transitions
      var t = (normalizedMagnitude * rgbColors.length) - colorIndex;
      var rgb1 = rgbColors[colorIndex];
      var rgb2 = rgbColors[nextColorIndex];
      
      var result = [
        Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
        Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
        Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t),
        alpha
      ];
      
      // Debug: Log first few color mappings
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
    }
    
    // Render each pixel with interpolated values
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var pixelIndex = (y * width + x) * 4;
        
        // Find the four nearest grid points
        var gx1 = Math.floor(x / sampleGrid) * sampleGrid;
        var gy1 = Math.floor(y / sampleGrid) * sampleGrid;
        var gx2 = Math.min(gx1 + sampleGrid, width - 1);
        var gy2 = Math.min(gy1 + sampleGrid, height - 1);
        
        // Get the four corner values
        var q11 = (velocityGrid[gy1] && velocityGrid[gy1][gx1] !== undefined) ? velocityGrid[gy1][gx1] : 0;
        var q12 = (velocityGrid[gy2] && velocityGrid[gy2][gx1] !== undefined) ? velocityGrid[gy2][gx1] : 0;
        var q21 = (velocityGrid[gy1] && velocityGrid[gy1][gx2] !== undefined) ? velocityGrid[gy1][gx2] : 0;
        var q22 = (velocityGrid[gy2] && velocityGrid[gy2][gx2] !== undefined) ? velocityGrid[gy2][gx2] : 0;
        
        // Perform bilinear interpolation
        var interpolatedValue;
        if (gx1 === gx2 && gy1 === gy2) {
          interpolatedValue = q11;
        } else if (gx1 === gx2) {
          interpolatedValue = q11 + (q12 - q11) * ((y - gy1) / (gy2 - gy1));
        } else if (gy1 === gy2) {
          interpolatedValue = q11 + (q21 - q11) * ((x - gx1) / (gx2 - gx1));
        } else {
          interpolatedValue = bilinearInterpolate(x, y, gx1, gy1, gx2, gy2, q11, q12, q21, q22);
        }
        
        // Get color for this interpolated value
        var color = getColorFromMagnitude(interpolatedValue);
        
        // Set pixel color
        if (pixelIndex < data.length - 3) {
          data[pixelIndex] = color[0];     // R
          data[pixelIndex + 1] = color[1]; // G
          data[pixelIndex + 2] = color[2]; // B
          data[pixelIndex + 3] = color[3]; // A
        }
      }
    }
    
    this._overlayContext.putImageData(imageData, 0, 0);
    
    // Apply additional smoothing filter for even better results
    if (blurAmount > 0) {
      this._overlayContext.filter = 'blur(' + blurAmount + 'px)';
      this._overlayContext.globalCompositeOperation = 'source-over';
      this._overlayContext.drawImage(this._overlayCanvasLayer._canvas, 0, 0);
      this._overlayContext.filter = 'none';
    }
  },

  _destroyWind: function() {
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

L.velocityLayer = function(options) {
  return new L.VelocityLayer(options);
};
