import { ClientOnly } from "components/ClientOnly/ClientOnly"; // adjust to your actual path
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Marker, NavigationControl, Popup } from "react-map-gl/mapbox";

import { useLoaderData } from "react-router";

import { useState } from "react";
import type { LocationRow } from "~/types";
import type { loader } from "./loader";

const MapView: React.FC = () => {
  const { mapboxToken, viewState, locations } = useLoaderData<typeof loader>();

  const [selectedLocation, setSelectedLocation] = useState<LocationRow | null>(
    null,
  );

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ClientOnly fallback={<div>Loading map…</div>}>
        {() => (
          <Map
            mapboxAccessToken={mapboxToken}
            initialViewState={viewState}
            mapStyle="mapbox://styles/mapbox/standard"
            config={{
              basemap: {
                theme: "faded",
              },
            }}
            onClick={() => setSelectedLocation(null)}
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="top-right" />{" "}
            {locations &&
              locations.map((loc) => (
                <Marker
                  key={loc.id}
                  longitude={loc.lng}
                  latitude={loc.lat}
                  anchor="bottom"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedLocation(loc);
                  }}
                >
                  <div style={{ position: "relative", width: 14, height: 14 }}>
                    <span
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        marginBottom: 4,
                        whiteSpace: "nowrap",
                        background: "#ffffff",
                        padding: "2px",
                      }}
                    >
                      {loc.name}
                    </span>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "#000000",
                        border: "2px solid white",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </Marker>
              ))}
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

/*
 <Map
            mapboxAccessToken={mapboxToken}
            initialViewState={NYC}
            mapStyle="mapbox://styles/mapbox/light-v11"
            style={{ width: "100%", height: "100%" }}
          />
 */
