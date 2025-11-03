// Flight Connections Map + Info Panel

const map = L.map('map').setView([53.35, -6.26], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer = null;
let airportLayer = null;
let selectedAirport = null;

// Styles
const defaultStyle = { radius: 6, fillColor: "#0074D9", color: "#fff", weight: 1, opacity: 1, fillOpacity: 0.9 };
const selectedStyle = { radius: 8, fillColor: "#FFD700", color: "#000", weight: 2, opacity: 1, fillOpacity: 1.0 };
const connectedStyle = { radius: 6, fillColor: "#2ECC40", color: "#fff", weight: 1, opacity: 1, fillOpacity: 0.9 };

// Elements
const infoBox = document.getElementById("infoBox");
const routePanel = document.getElementById("routePanel");
const routeList = document.getElementById("routeList");
const panelTitle = document.getElementById("panelTitle");

// Load airports
fetch('/api/airports/')
  .then(res => res.json())
  .then(data => {
    airportLayer = L.geoJSON(data, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, defaultStyle),
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindPopup(`
          <b>${props.name}</b><br>${props.city}, ${props.country}<br>Code: ${props.iata_code}
        `);
        layer.on('click', () => loadRoutes(props.iata_code, props.name, layer));
      }
    }).addTo(map);

    const bounds = airportLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds);
  });

// Load routes for selected airport
function loadRoutes(iata, airportName, layerClicked) {
  if (selectedAirport === layerClicked) return;
  selectedAirport = layerClicked;

  airportLayer.eachLayer(l => l.setStyle(defaultStyle));
  layerClicked.setStyle(selectedStyle);

  infoBox.innerHTML = `<em>Loading routes from ${airportName}...</em>`;
  routePanel.classList.add('hidden');

  fetch(`/api/airports/routes/?origin=${iata}`)
    .then(res => res.json())
    .then(data => {
      if (routeLayer) map.removeLayer(routeLayer);

      routeLayer = L.geoJSON(data, {
        style: { color: "red", weight: 2 },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(`<b>${p.origin} → ${p.destination}</b><br>Distance: ${p.distance_km.toFixed(1)} km`);
        }
      }).addTo(map);

      highlightConnectedAirports(data);
      populateRoutePanel(data, airportName);

      const bounds = routeLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds);

      infoBox.innerHTML = `<b>${airportName}</b>: Showing ${data.features.length} route(s).`;
    })
    .catch(() => {
      infoBox.innerHTML = `<b>${airportName}</b>: No routes found.`;
      routePanel.classList.add('hidden');
    });
}

// Highlight connected airports
function highlightConnectedAirports(routeData) {
  const connectedIATAs = routeData.features.map(f => f.properties.destination);

  airportLayer.eachLayer(l => {
    const props = l.feature.properties;
    if (connectedIATAs.includes(props.iata_code)) {
      l.setStyle(connectedStyle);
    } else if (props.iata_code !== selectedAirport.feature.properties.iata_code) {
      l.setStyle({ ...defaultStyle, fillOpacity: 0.3 });
    }
  });
}

// Populate info panel
function populateRoutePanel(routeData, airportName) {
  routeList.innerHTML = "";
  panelTitle.innerText = `Routes from ${airportName}`;

  routeData.features.forEach((f, idx) => {
    const li = document.createElement("li");
    li.textContent = `${f.properties.origin} → ${f.properties.destination} (${f.properties.distance_km.toFixed(1)} km)`;
    li.onclick = () => zoomToRoute(idx);
    routeList.appendChild(li);
  });

  routePanel.classList.remove('hidden');
}

// Zoom to a specific route when clicked
function zoomToRoute(index) {
  if (!routeLayer) return;
  const featureLayer = Object.values(routeLayer._layers)[index];
  if (!featureLayer) return;

  featureLayer.setStyle({ color: "yellow", weight: 4 });
  map.fitBounds(featureLayer.getBounds());
  setTimeout(() => routeLayer.resetStyle(featureLayer), 800);
}

// Clear routes + reset styles
document.getElementById("clearBtn").onclick = () => {
  if (routeLayer) map.removeLayer(routeLayer);
  selectedAirport = null;
  routePanel.classList.add('hidden');
  airportLayer.eachLayer(l => l.setStyle(defaultStyle));
  infoBox.innerHTML = "<strong>Click an airport</strong> to view its connections.";
};
// ==============================
// Extra Spatial Query Visuals (Click-to-Select with Radius)
// ==============================

let nearbyLayer = L.geoJSON(null, {
  pointToLayer: (f, latlng) =>
    L.circleMarker(latlng, { radius: 5, color: "purple", fillOpacity: 0.8 })
      .bindPopup(`<b>${f.properties.name}</b><br>${f.properties.city}, ${f.properties.country}`)
}).addTo(map);

let clickMarker = null;   // user click point
let searchCircle = null;  // visible radius circle

// --- Helper to clear only results, not the marker ---
function clearNearbyResults() {
  nearbyLayer.clearLayers();
  if (searchCircle) {
    map.removeLayer(searchCircle);
    searchCircle = null;
  }
}

// --- Reset everything (for Clear button) ---
function clearExtraLayers() {
  clearNearbyResults();
  if (clickMarker) {
    map.removeLayer(clickMarker);
    clickMarker = null;
  }
}

// --- Select location on map ---
map.on("click", function (e) {
  const { lat, lng } = e.latlng;

  // Remove old marker but NOT the results yet
  if (clickMarker) map.removeLayer(clickMarker);
  if (searchCircle) map.removeLayer(searchCircle);

  clickMarker = L.marker([lat, lng], { draggable: true })
    .addTo(map)
    .bindPopup(`<b>Selected point</b><br>${lat.toFixed(3)}, ${lng.toFixed(3)}<br>(drag to adjust)`)
    .openPopup();

  infoBox.innerHTML = `Selected point: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
});

// --- Nearby Airports ---
document.getElementById("btnNearby").onclick = async () => {
  if (!clickMarker) {
    alert("Click on the map first to select a location.");
    return;
  }

  const radius = parseFloat(prompt("Enter search radius in km:", "100"));
  if (isNaN(radius) || radius <= 0) {
    alert("Invalid radius value.");
    return;
  }

  clearNearbyResults(); // clear only old search results
  const { lat, lng } = clickMarker.getLatLng();

  // Draw circle (radius in meters)
  searchCircle = L.circle([lat, lng], {
    radius: radius * 1000,
    color: "purple",
    fillColor: "purple",
    fillOpacity: 0.1,
  }).addTo(map);

  // Fetch nearby airports
  const res = await fetch(`/api/airports/nearby/?lat=${lat}&lon=${lng}&radius=${radius}`);
  const data = await res.json();

  if (data.features.length === 0) {
    infoBox.innerHTML = `No airports found within ${radius} km.`;
    return;
  }

  nearbyLayer.addData(data.features);
  map.fitBounds(searchCircle.getBounds());

  infoBox.innerHTML = `<b>${data.features.length}</b> airport(s) within ${radius} km.`;
};

// --- Nearest Airport ---
document.getElementById("btnNearest").onclick = async () => {
  if (!clickMarker) {
    alert("Click on the map first to select a location.");
    return;
  }

  clearNearbyResults();
  const { lat, lng } = clickMarker.getLatLng();

  const res = await fetch(`/api/airports/nearest/?lat=${lat}&lon=${lng}`);
  const data = await res.json();

  if (data.features.length === 0) {
    infoBox.innerHTML = "No nearby airports found.";
    return;
  }

  nearbyLayer.addData(data.features);

  const airport = data.features[0].properties;
  infoBox.innerHTML = `Nearest airport: <b>${airport.name}</b> (${airport.iata_code})`;
};

// --- Top Hubs ---
document.getElementById("btnHubs").onclick = async () => {
  const res = await fetch("/api/airports/hubs/?top=10");
  const data = await res.json();
  let html = "<b>Top 10 Hubs</b><ul>";
  data.forEach(d => (html += `<li>${d.country}: ${d.count}</li>`));
  html += "</ul>";
  L.popup().setLatLng(map.getCenter()).setContent(html).openOn(map);
};

// --- Integrate with Clear Routes button ---
const clearBtn = document.getElementById("clearBtn");
const oldClear = clearBtn.onclick;
clearBtn.onclick = () => {
  if (typeof oldClear === "function") oldClear();
  clearExtraLayers();
};
