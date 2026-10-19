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

const labelLayer: LayerProps = {
  id: LABEL_LAYER,
  type: "symbol",
  filter: visibleAtZoom,
  layout: {
    "text-field": ["get", "name"],
    "text-size": 12,
    "text-anchor": "bottom",
    "text-offset": [0, -1.4],
    "text-max-width": 14,
    // White box behind the label, sized to the text.
    "icon-image": LABEL_BG_IMAGE,
    "icon-text-fit": "both",
    "icon-text-fit-padding": [6, 12, 6, 12],
    // Lower sort key wins placement: on overlap the most prominent label stays.
    "symbol-sort-key": ["-", 0, ["get", "rank"]],
  },
  paint: {
    "text-color": "#000000",
  },
};

function addLabelBackground(map: MapInstance) {
  if (map.hasImage(LABEL_BG_IMAGE)) return;
  const size = 8;
  const pixels = new Uint8Array(size * size * 4).fill(255); // solid white
  map.addImage(LABEL_BG_IMAGE, { width: size, height: size, data: pixels });
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
                offset={14}
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
                  {selectedLocation.image_url && (
                    <img
                      src={selectedLocation.image_url}
                      alt={selectedLocation.name}
                      style={{
                        width: "100%",
                        marginTop: 6,
                        borderRadius: 4,
                        display: "block",
                      }}
                    />
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
