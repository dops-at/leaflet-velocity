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

var Windy = function(params) {
  var MIN_VELOCITY_INTENSITY = params.minVelocity || 0; // velocity at which particle intensity is minimum (m/s)
  var MAX_VELOCITY_INTENSITY = params.maxVelocity || 10; // velocity at which particle intensity is maximum (m/s)
  var VELOCITY_SCALE =
    (params.velocityScale || 0.005) *
    (Math.pow(window.devicePixelRatio, 1 / 3) || 1); // scale for wind velocity (completely arbitrary--this value looks nice)
  var MAX_PARTICLE_AGE = params.particleAge || 90; // max number of frames a particle is drawn before regeneration
  var PARTICLE_LINE_WIDTH = params.lineWidth || 1; // line width of a drawn particle
  var PARTICLE_MULTIPLIER = params.particleMultiplier || 1 / 300; // particle count scalar (completely arbitrary--this values looks nice)
  var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6; // multiply particle count for mobiles by this amount
  var FRAME_RATE = params.frameRate || 15;
  var FRAME_TIME = 1000 / FRAME_RATE; // desired frames per second
  var OPACITY = 0.97;
  var VIEWPORT_ONLY = params.viewportOnly || false; // if true, only process data in current viewport
  var AUTO_UPDATE_ON_MOVE = params.autoUpdateOnMove !== false; // auto-update when viewport changes

  var defaulColorScale = [
    "rgb(0,0,0)",        // Black particles only
    "rgb(0,0,0)",        // All particles will be black
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)",
    "rgb(0,0,0)"
  ];

  const colorScale = params.colorScale || defaulColorScale;

  var NULL_WIND_VECTOR = [NaN, NaN, null]; // singleton for no wind in the form: [u, v, magnitude]

  var builder;
  var grid;
  var gridData = params.data;
  var date;
  var λ0, φ0, Δλ, Δφ, ni, nj;

  var setData = function(data) {
    gridData = data;
  };

  var setOptions = function(options) {
    if (options.hasOwnProperty("minVelocity"))
      MIN_VELOCITY_INTENSITY = options.minVelocity;

    if (options.hasOwnProperty("maxVelocity"))
      MAX_VELOCITY_INTENSITY = options.maxVelocity;

    if (options.hasOwnProperty("velocityScale"))
      VELOCITY_SCALE =
        (options.velocityScale || 0.005) *
        (Math.pow(window.devicePixelRatio, 1 / 3) || 1);

    if (options.hasOwnProperty("particleAge"))
      MAX_PARTICLE_AGE = options.particleAge;

    if (options.hasOwnProperty("lineWidth"))
      PARTICLE_LINE_WIDTH = options.lineWidth;

    if (options.hasOwnProperty("particleMultiplier"))
      PARTICLE_MULTIPLIER = options.particleMultiplier;

    if (options.hasOwnProperty("opacity")) OPACITY = +options.opacity;

    if (options.hasOwnProperty("frameRate")) FRAME_RATE = options.frameRate;
    FRAME_TIME = 1000 / FRAME_RATE;

    if (options.hasOwnProperty("viewportOnly")) {
      var oldValue = VIEWPORT_ONLY;
      VIEWPORT_ONLY = options.viewportOnly;
      console.log('🔧 setOptions: viewportOnly changed from', oldValue, 'to', VIEWPORT_ONLY);
    }
    if (options.hasOwnProperty("autoUpdateOnMove")) AUTO_UPDATE_ON_MOVE = options.autoUpdateOnMove;
  };

  // interpolation for vectors like wind (u,v,m)
  var bilinearInterpolateVector = function(x, y, g00, g10, g01, g11) {
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

  var createWindBuilder = function(uComp, vComp) {
    var uData = uComp.data,
      vData = vComp.data;
    return {
      header: uComp.header,
      //recipe: recipeFor("wind-" + uComp.header.surface1Value),
      data: function(i) {
        return [uData[i], vData[i]];
      },
      interpolate: bilinearInterpolateVector
    };
  };

  var createBuilder = function(data) {
    var uComp = null,
      vComp = null,
      scalar = null;

    data.forEach(function(record) {
      switch (
        record.header.parameterCategory +
        "," +
        record.header.parameterNumber
      ) {
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

  var buildGrid = function(data, callback) {
    var supported = true;

    if (data.length < 2 ) supported = false;
    if (!supported) console.log("Windy Error: data must have at least two components (u,v)");
    
    builder = createBuilder(data);
    var header = builder.header;

    if (header.hasOwnProperty("gridDefinitionTemplate") && header.gridDefinitionTemplate != 0 ) supported = false;
    if (!supported) {
      console.log("Windy Error: Only data with Latitude_Longitude coordinates is supported");
    }
    supported = true;  // reset for futher checks
    
    λ0 = header.lo1;
    φ0 = header.la1; // the grid's origin (e.g., 0.0E, 90.0N)

    Δλ = header.dx;
    Δφ = header.dy; // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)

    ni = header.nx;
    nj = header.ny; // number of grid points W-E and N-S (e.g., 144 x 73)

    if (header.hasOwnProperty("scanMode")) {
      var scanModeMask = header.scanMode.toString(2)
      scanModeMask = ('0'+scanModeMask).slice(-8);
      var scanModeMaskArray = scanModeMask.split('').map(Number).map(Boolean);

      if (scanModeMaskArray[0]) Δλ =-Δλ;
      if (scanModeMaskArray[1]) Δφ = -Δφ;
      if (scanModeMaskArray[2]) supported = false;
      if (scanModeMaskArray[3]) supported = false;
      if (scanModeMaskArray[4]) supported = false;
      if (scanModeMaskArray[5]) supported = false;
      if (scanModeMaskArray[6]) supported = false;
      if (scanModeMaskArray[7]) supported = false;
      if (!supported) console.log("Windy Error: Data with scanMode: "+header.scanMode+ " is not supported.");
    }
    date = new Date(header.refTime);
    date.setHours(date.getHours() + header.forecastTime);

    // Scan modes 0, 64 allowed.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    grid = [];
    var p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;

    for (var j = 0; j < nj; j++) {
      var row = [];
      for (var i = 0; i < ni; i++, p++) {
        var value = builder.data(p);
        
        // Keep all grid data available - filtering happens during particle rendering
        
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
  };

  // Debug counters for data point filtering
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
  var interpolate = function(λ, φ) {
    if (!grid) return null;

    var i = floorMod(λ - λ0, 360) / Δλ; // calculate longitude index in wrapped range [0, 360)
    var j = (φ0 - φ) / Δφ; // calculate latitude index in direction +90 to -90

    var fi = Math.floor(i),
      ci = fi + 1;
    var fj = Math.floor(j),
      cj = fj + 1;

    var row;
    if ((row = grid[fj])) {
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
  var isValue = function(x) {
    return x !== null && x !== undefined;
  };

  /**
   * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
   *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
   */
  var floorMod = function(a, n) {
    return a - n * Math.floor(a / n);
  };

  /**
   * @returns {Number} the value x clamped to the range [low, high].
   */
  var clamp = function(x, range) {
    return Math.max(range[0], Math.min(x, range[1]));
  };

  /**
   * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
   */
  var isMobile = function() {
    return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(
      navigator.userAgent
    );
  };

  /**
   * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
   * vector is modified in place and returned by this function.
   */
  var distort = function(projection, λ, φ, x, y, scale, wind) {
    var u = wind[0] * scale;
    var v = wind[1] * scale;
    var d = distortion(projection, λ, φ, x, y);

    // Scale distortion vectors by u and v, then add.
    wind[0] = d[0] * u + d[2] * v;
    wind[1] = d[1] * u + d[3] * v;
    return wind;
  };

  var distortion = function(projection, λ, φ, x, y) {
    var τ = 2 * Math.PI;
    //    var H = Math.pow(10, -5.2); // 0.00000630957344480193
    //    var H = 0.0000360;          // 0.0000360°φ ~= 4m  (from https://github.com/cambecc/earth/blob/master/public/libs/earth/1.0.0/micro.js#L13)
    var H = 5; // ToDo:   Why does this work?
    var hλ = λ < 0 ? H : -H;
    var hφ = φ < 0 ? H : -H;

    var pλ = project(φ, λ + hλ);
    var pφ = project(φ + hφ, λ);

    // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1º λ
    // changes depending on φ. Without this, there is a pinching effect at the poles.
    var k = Math.cos((φ / 360) * τ);
    return [
      (pλ[0] - x) / hλ / k,
      (pλ[1] - y) / hλ / k,
      (pφ[0] - x) / hφ,
      (pφ[1] - y) / hφ
    ];
  };

  var createField = function(columns, bounds, callback) {
    /**
     * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
     *          is undefined at that point.
     */
    function field(x, y) {
      var column = columns[Math.round(x)];
      return (column && column[Math.round(y)]) || NULL_WIND_VECTOR;
    }

    // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
    // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
    field.release = function() {
      columns = [];
    };

    field.randomize = function(o) {
      var x, y;
      var safetyNet = 0;
      var viewportAttempts = 0;
      var maxViewportAttempts = VIEWPORT_ONLY && currentViewportBounds ? 50 : 0;
      
      do {
        x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
        y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y);
        
        // If viewport filtering is enabled, strongly prefer points within viewport
        if (VIEWPORT_ONLY && currentViewportBounds && viewportAttempts < maxViewportAttempts) {
          var coord = invert(x, y);
          if (coord && !isInViewport(coord[0], coord[1])) {
            viewportAttempts++;
            continue; // Try again if outside viewport
          }
        }
        
        // Check if there's valid wind data at this location
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

  var buildBounds = function(bounds, width, height) {
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

  var deg2rad = function(deg) {
    return (deg / 180) * Math.PI;
  };

  var invert = function(x, y, windy) {
    var latlon = params.map.containerPointToLatLng(L.point(x, y));
    return [latlon.lng, latlon.lat];
  };

  var project = function(lat, lon, windy) {
    var xy = params.map.latLngToContainerPoint(L.latLng(lat, lon));
    return [xy.x, xy.y];
  };

  var interpolateField = function(grid, bounds, extent, callback) {
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
  var animate = function(bounds, field) {
    function windIntensityColorScale(min, max) {
      colorScale.indexFor = function(m) {
        // map velocity speed to a style
        return Math.max(
          0,
          Math.min(
            colorScale.length - 1,
            Math.round(((m - min) / (max - min)) * (colorScale.length - 1))
          )
        );
      };

      return colorScale;
    }

    var colorStyles = windIntensityColorScale(
      MIN_VELOCITY_INTENSITY,
      MAX_VELOCITY_INTENSITY
    );
    var buckets = colorStyles.map(function() {
      return [];
    });

    var particleCount = Math.round(
      bounds.width * bounds.height * PARTICLE_MULTIPLIER
    );
    if (isMobile()) {
      particleCount *= PARTICLE_REDUCTION;
    }

    var fadeFillStyle = `rgba(0, 0, 0, ${OPACITY})`;

    var particles = [];
    for (var i = 0; i < particleCount; i++) {
      particles.push(
        field.randomize({
          age: Math.floor(Math.random() * MAX_PARTICLE_AGE) + 0
        })
      );
    }

    function evolve() {
      buckets.forEach(function(bucket) {
        bucket.length = 0;
      });
      
      // Debug: Track viewport filtering statistics
      var debugStats = {
        totalParticles: particles.length,
        visibleParticles: 0,
        filteredOutParticles: 0,
        validFieldParticles: 0,
        drawnParticles: 0
      };
      
      particles.forEach(function(particle) {
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
          var yt = y + v[1];
          
          // Check if particle should be visible based on viewport filtering
          var shouldDraw = true;
          if (VIEWPORT_ONLY && currentViewportBounds) {
            var coord = invert(x, y);
            if (coord && isFinite(coord[0]) && isFinite(coord[1])) {
              shouldDraw = isInViewport(coord[0], coord[1]);
              if (shouldDraw) {
                debugStats.visibleParticles++;
              } else {
                debugStats.filteredOutParticles++;
              }
              
              // Debug: Log first few coordinate checks with more detail
              if (debugStats.validFieldParticles <= 10) {
                console.log(`🧪 Particle ${debugStats.validFieldParticles}: screen(${x.toFixed(1)}, ${y.toFixed(1)}) -> geo(${coord[0].toFixed(4)}, ${coord[1].toFixed(4)}) -> ${shouldDraw ? 'VISIBLE' : 'FILTERED'}`);
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
      });
      
      // Debug: Log particle statistics occasionally (less important than data filtering)
      if (Math.random() < 0.005) { // Very occasional logging for particles
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
      g.globalAlpha = OPACITY === 0 ? 0 : OPACITY * 0.9;

      // Draw new particle trails.
      buckets.forEach(function(bucket, i) {
        if (bucket.length > 0) {
          g.beginPath();
          g.strokeStyle = colorStyles[i];
          bucket.forEach(function(particle) {
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
        then = now - (delta % FRAME_TIME);
        evolve();
        draw();
      }
    })();
  };

  // Store viewport bounds for filtering during interpolation
  var currentViewportBounds = null;
  
  var setViewportBounds = function(viewportBounds) {
    if (VIEWPORT_ONLY) {
      // viewportBounds are already in radians, convert to degrees
      var viewportWest = viewportBounds.west * 180 / Math.PI;
      var viewportEast = viewportBounds.east * 180 / Math.PI;
      var viewportSouth = viewportBounds.south * 180 / Math.PI;
      var viewportNorth = viewportBounds.north * 180 / Math.PI;
      
      // Add smaller buffer around viewport (5% margin to avoid over-filtering)
      var lonBuffer = Math.abs(viewportEast - viewportWest) * 0.05;
      var latBuffer = Math.abs(viewportNorth - viewportSouth) * 0.05;
      
      currentViewportBounds = {
        west: viewportWest - lonBuffer,
        east: viewportEast + lonBuffer,
        south: viewportSouth - latBuffer,
        north: viewportNorth + latBuffer
      };
      
      // Validate bounds are reasonable
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
      });
      
      // Reset stats and debug counters when viewport changes
      interpolationStats.totalRequests = 0;
      interpolationStats.filteredOutRequests = 0;
      interpolationStats.validDataPoints = 0;
      interpolationStats.resetTime = Date.now();
      isInViewport.debugCount = 0; // Reset debug counter
    } else {
      currentViewportBounds = null;
      console.log('🎯 Viewport filtering disabled - processing all data');
    }
  };
  
  // Check if a coordinate is within the current viewport
  var isInViewport = function(lon, lat) {
    if (!VIEWPORT_ONLY || !currentViewportBounds) {
      return true; // No filtering if viewport-only is disabled
    }
    
    // Validate inputs
    if (typeof lon !== 'number' || typeof lat !== 'number' || 
        !isFinite(lon) || !isFinite(lat)) {
      return false;
    }
    
    // Handle longitude wraparound (antimeridian crossing)
    var inLongitude = false;
    if (currentViewportBounds.west <= currentViewportBounds.east) {
      // Normal case - no wraparound
      inLongitude = (lon >= currentViewportBounds.west && lon <= currentViewportBounds.east);
    } else {
      // Wraparound case - viewport crosses antimeridian
      inLongitude = (lon >= currentViewportBounds.west || lon <= currentViewportBounds.east);
    }
    
    var inLatitude = (lat >= currentViewportBounds.south && lat <= currentViewportBounds.north);
    var result = inLongitude && inLatitude;
    
    // Enhanced debug: Log viewport bounds and first few coordinate checks
    if (typeof isInViewport.debugCount === 'undefined') {
      isInViewport.debugCount = 0;
      console.log('🎯 Viewport bounds for filtering:', currentViewportBounds);
    }
    if (isInViewport.debugCount < 10) {
      console.log(`🔍 Viewport check [${isInViewport.debugCount}]: (${lon.toFixed(4)}, ${lat.toFixed(4)}) -> ${result ? 'IN' : 'OUT'}`);
      console.log(`   Bounds: W:${currentViewportBounds.west.toFixed(4)} E:${currentViewportBounds.east.toFixed(4)} S:${currentViewportBounds.south.toFixed(4)} N:${currentViewportBounds.north.toFixed(4)}`);
      isInViewport.debugCount++;
    }
    
    return result;
  };
  
  // Debug summary log for data point filtering (called after map moves/zooms)
  var logDataFilteringSummary = function() {
    if (VIEWPORT_ONLY && interpolationStats.totalRequests > 0) {
      var displayedPoints = interpolationStats.validDataPoints;
      var totalDatasetSize = interpolationStats.totalRequests;
      var filteredOutPoints = interpolationStats.filteredOutRequests;
      var filteringRate = ((filteredOutPoints / totalDatasetSize) * 100).toFixed(1);
      
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
    }
    
    // Reset counters for next viewport change
    interpolationStats.totalRequests = 0;
    interpolationStats.filteredOutRequests = 0;
    interpolationStats.validDataPoints = 0;
    interpolationStats.resetTime = Date.now();
  };



  var start = function(bounds, width, height, extent) {
    var mapBounds = {
      south: deg2rad(extent[0][1]),
      north: deg2rad(extent[1][1]),
      east: deg2rad(extent[1][0]),
      west: deg2rad(extent[0][0]),
      width: width,
      height: height
    };

    stop();

    // Set viewport bounds for filtering if enabled
    setViewportBounds(mapBounds);

    // build grid (with viewport filtering applied at grid level)
    console.log('🏗️ Building grid with viewport filtering:', VIEWPORT_ONLY ? 'ENABLED' : 'DISABLED');
    buildGrid(gridData, function(grid) {
      // interpolateField
      interpolateField(
        grid,
        buildBounds(bounds, width, height),
        mapBounds,
        function(bounds, field) {
          // animate the canvas with random points
          windy.field = field;
          animate(bounds, field);
          
          // call overlay callback if provided
          if (params.onFieldReady) {
            params.onFieldReady();
          }
          
          // Log summary after field is ready and processing is complete
          setTimeout(logDataFilteringSummary, 500);
        }
      );
    });
  };

  var stop = function() {
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
    getCurrentViewportBounds: function() { return currentViewportBounds; },
    isViewportOnlyEnabled: function() { return VIEWPORT_ONLY; },
    logFilteringSummary: logDataFilteringSummary
  };

  return windy;
};

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = function(id) {
    clearTimeout(id);
  };
}
