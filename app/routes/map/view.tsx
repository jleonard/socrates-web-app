import { ClientOnly } from "components/ClientOnly/ClientOnly";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  GeolocateControl,
  Layer,
  Map,
  NavigationControl,
  Popup,
  Source,
  type GeolocateControlInstance,
  type LayerProps,
  type MapInstance,
  type MapMouseEvent,
} from "react-map-gl/mapbox";

import { useLoaderData } from "react-router";

import { useMemo, useRef, useState } from "react";
import type { MapLocation } from "~/types";
import {
  getLocationPermission,
  getRememberedLocation,
  rememberLocation,
} from "~/utils/location.client";
import { prominenceFilter } from "~/utils/map/prominence";
import type { loader } from "./loader";

// Zoom used when centering on the user: district level.
const USER_ZOOM = 13;

const DOT_LAYER = "map-location-dots";
const LABEL_LAYER = "map-location-labels";
const LABEL_BG_IMAGE = "map-location-label-bg";

// Both layers show only places whose rank clears the current zoom's threshold.
const visibleAtZoom = prominenceFilter("rank");

const dotLayer: LayerProps = {
  id: DOT_LAYER,
  type: "circle",
  filter: visibleAtZoom,
  layout: {
    // Higher rank drawn on top.
    "circle-sort-key": ["get", "rank"],
  },
  paint: {
    "circle-radius": 5,
    "circle-color": "#000000",
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

const LABEL_TEXT_SIZE = 12; // px
const LABEL_TEXT_OFFSET_EM = 1.4; // text bottom sits this far above the dot
const LABEL_PAD_Y = 8;
const LABEL_PAD_X = 14;
// Popup tip sits just above a one-line label's box: text offset + one line
// (Mapbox's default 1.2em line height) + top padding, plus a small gap.
const POPUP_OFFSET =
  Math.ceil(LABEL_TEXT_SIZE * (LABEL_TEXT_OFFSET_EM + 1.2)) + LABEL_PAD_Y + 2;

const labelLayer: LayerProps = {
  id: LABEL_LAYER,
  type: "symbol",
  filter: visibleAtZoom,
  layout: {
    "text-field": ["get", "name"],
    "text-size": LABEL_TEXT_SIZE,
    "text-anchor": "bottom",
    "text-offset": [0, -LABEL_TEXT_OFFSET_EM],
    "text-max-width": 14,
    // White box behind the label, sized to the text.
    "icon-image": LABEL_BG_IMAGE,
    "icon-text-fit": "both",
    "icon-text-fit-padding": [LABEL_PAD_Y, LABEL_PAD_X, LABEL_PAD_Y, LABEL_PAD_X],
    // Lower sort key wins placement: on overlap the most prominent label stays.
    "symbol-sort-key": ["-", 0, ["get", "rank"]],
  },
  paint: {
    "text-color": "#000000",
  },
};

// White rounded rectangle, drawn at 2x for crisp corners. Only the middle
// band stretches (9-slice), so the corners keep their radius at any size.
const LABEL_RADIUS = 4; // CSS px
const LABEL_BG_PIXEL_RATIO = 2;

function addLabelBackground(map: MapInstance) {
  if (map.hasImage(LABEL_BG_IMAGE)) return;
  const r = LABEL_RADIUS * LABEL_BG_PIXEL_RATIO;
  const size = r * 2 + 4;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance from this pixel's center to the nearest corner circle's center.
      const dx = Math.max(r - (x + 0.5), x + 0.5 - (size - r), 0);
      const dy = Math.max(r - (y + 0.5), y + 0.5 - (size - r), 0);
      const coverage = Math.min(Math.max(r - Math.hypot(dx, dy) + 0.5, 0), 1);
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }
  map.addImage(
    LABEL_BG_IMAGE,
    { width: size, height: size, data: pixels },
    {
      pixelRatio: LABEL_BG_PIXEL_RATIO,
      stretchX: [[r, size - r]],
      stretchY: [[r, size - r]],
    },
  );
}

const MapView: React.FC = () => {
  const { mapboxToken, viewState, locations } = useLoaderData<typeof loader>();

  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(
    null,
  );
  const [hovering, setHovering] = useState(false);
  const geolocateRef = useRef<GeolocateControlInstance>(null);

  // Start where the user was last seen (this route or /app), else the
  // loader's default. Only read on the client; the map is client-only.
  const initialView = useMemo(() => {
    const last = typeof window === "undefined" ? null : getRememberedLocation();
    return last
      ? { longitude: last.long, latitude: last.lat, zoom: USER_ZOOM }
      : viewState;
  }, [viewState]);

  const locationsById = useMemo(
    () => new globalThis.Map(locations.map((loc) => [loc.id, loc])),
    [locations],
  );

  const geojson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: locations.map((loc) => ({
        type: "Feature",
        id: loc.id,
        geometry: { type: "Point", coordinates: [loc.lng, loc.lat] },
        properties: { name: loc.name, rank: loc.rank },
      })),
    }),
    [locations],
  );

  // A click on a dot or label opens its popover; anywhere else closes it.
  const handleClick = (e: MapMouseEvent) => {
    const id = e.features?.[0]?.id; // feature id is the map_locations id
    setSelectedLocation(
      (id !== undefined && locationsById.get(Number(id))) || null,
    );
  };

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ClientOnly fallback={<div>Loading map…</div>}>
        {() => (
          <Map
            mapboxAccessToken={mapboxToken}
            initialViewState={initialView}
            mapStyle="mapbox://styles/mapbox/standard"
            config={{
              basemap: {
                theme: "faded",
              },
            }}
            onLoad={(e) => {
              const map = e.target;
              addLabelBackground(map);
              // Style changes drop custom images; re-add on demand.
              map.on("styleimagemissing", (ev) => {
                if (ev.id === LABEL_BG_IMAGE) addLabelBackground(map);
              });
              // Show the user's location straight away only if the browser
              // already allows it; otherwise wait for a tap on the locate
              // button rather than prompting on page load.
              getLocationPermission().then((state) => {
                if (state === "granted") geolocateRef.current?.trigger();
              });
            }}
            interactiveLayerIds={[DOT_LAYER, LABEL_LAYER]}
            onClick={handleClick}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            cursor={hovering ? "pointer" : undefined}
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="top-right" />
            <GeolocateControl
              ref={geolocateRef}
              position="top-right"
              positionOptions={{
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000, // accept a fix up to 5 min old
              }}
              trackUserLocation
              fitBoundsOptions={{ maxZoom: USER_ZOOM }}
              onGeolocate={(e) =>
                rememberLocation({
                  lat: e.coords.latitude,
                  long: e.coords.longitude,
                })
              }
            />
            <Source id="map-locations" type="geojson" data={geojson}>
              <Layer {...dotLayer} />
              <Layer {...labelLayer} />
            </Source>
            {/* popover */}
            {selectedLocation && (
              <Popup
                longitude={selectedLocation.lng}
                latitude={selectedLocation.lat}
                onClose={() => setSelectedLocation(null)}
                closeOnClick={false}
                anchor="bottom"
                offset={POPUP_OFFSET}
              >
                <div
                  style={{ minWidth: 180, fontFamily: "system-ui, sans-serif" }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {selectedLocation.name}
                  </div>
                  {selectedLocation.description && (
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                      {selectedLocation.description}
                    </div>
                  )}
                </div>
              </Popup>
            )}
          </Map>
        )}
      </ClientOnly>
    </div>
  );
};

export default MapView;
