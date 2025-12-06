// ===========================
// GLOBAL STATE & CONFIGURATION
// ===========================
const CONFIG = {
    API_BASE: '/api',
    DEFAULT_CENTER: [53.35, -6.26],
    DEFAULT_ZOOM: 5,
    CLUSTER_RADIUS: 50,
    SEARCH_DEBOUNCE: 300,
    MAX_ROUTES_DISPLAY: 50
};

const state = {
    map: null,
    airportMarkers: null,
    routeLayer: null,
    allAirports: [],
    filteredAirports: [],
    countries: new Set(),
    isLoading: false
};

// ===========================
// INITIALIZATION
// ===========================
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    initializeSidebar();
    loadAirports();
    attachEventListeners();
});

// ===========================
// MAP INITIALIZATION
// ===========================
function initializeMap() {
    // Initialize Leaflet map
    state.map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map);
    
    // Initialize marker cluster group
    state.airportMarkers = L.markerClusterGroup({
        maxClusterRadius: CONFIG.CLUSTER_RADIUS,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let className = 'marker-cluster-';
            
            if (count < 10) {
                className += 'small';
            } else if (count < 50) {
                className += 'medium';
            } else {
                className += 'large';
            }
            
            return L.divIcon({
                html: '<div><span>' + count + '</span></div>',
                className: 'marker-cluster ' + className,
                iconSize: L.point(40, 40)
            });
        }
    });
    
    state.map.addLayer(state.airportMarkers);
    
    // Initialize route layer
    state.routeLayer = L.layerGroup().addTo(state.map);
}

// ===========================
// SIDEBAR MANAGEMENT
// ===========================
function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Update icon
        const icon = toggleBtn.querySelector('i');
        if (sidebar.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-right';
        } else {
            icon.className = 'fas fa-bars';
        }
        
        // Invalidate map size after animation
        setTimeout(() => {
            state.map.invalidateSize();
        }, 300);
    });
}

// ===========================
// DATA LOADING
// ===========================
async function loadAirports() {
    showLoading(true);
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/airports/`);
        if (!response.ok) throw new Error('Failed to load airports');
        
        const data = await response.json();
        state.allAirports = data.features;
        state.filteredAirports = [...state.allAirports];
        
        // Extract unique countries
        state.allAirports.forEach(feature => {
            state.countries.add(feature.properties.country);
        });
        
        // Populate country filter
        populateCountryFilter();
        
        // Display airports
        displayAirports(state.filteredAirports);
        
        // Update stats
        updateStats();
        
        showLoading(false);
    } catch (error) {
        console.error('Error loading airports:', error);
        showError('Failed to load airports. Please refresh the page.');
        showLoading(false);
    }
}

function displayAirports(airports) {
    // Clear existing markers
    state.airportMarkers.clearLayers();
    
    // Add airport markers
    airports.forEach(feature => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        
        const marker = L.circleMarker([coords[1], coords[0]], {
            radius: 6,
            fillColor: props.is_major_hub ? '#dc3545' : '#667eea',
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });
        
        // Create popup content
        const popupContent = `
            <div>
                <b>${props.name}</b><br>
                <small>${props.city}, ${props.country}</small><br>
                <small><strong>IATA:</strong> ${props.iata_code}</small>
                ${props.is_major_hub ? '<br><small><i class="fas fa-star"></i> Major Hub</small>' : ''}
                <br><br>
                <button onclick="loadRoutes('${props.iata_code}', '${props.name}')" 
                        style="padding: 5px 10px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    View Routes
                </button>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        state.airportMarkers.addLayer(marker);
    });
    
    // Fit bounds if airports exist
    if (airports.length > 0 && state.airportMarkers.getBounds().isValid()) {
        state.map.fitBounds(state.airportMarkers.getBounds(), { padding: [50, 50] });
    }
}

// ===========================
// ROUTE LOADING
// ===========================
async function loadRoutes(iataCode, airportName) {
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/airports/routes/?origin=${iataCode}&limit=${CONFIG.MAX_ROUTES_DISPLAY}`);
        if (!response.ok) throw new Error('Failed to load routes');
        
        const data = await response.json();
        
        // Clear existing routes
        state.routeLayer.clearLayers();
        
        if (data.features.length === 0) {
            updateInfoBox(`<strong>${airportName}</strong> has no routes in the database.`);
            state.isLoading = false;
            return;
        }
        
        // Add routes to map
        data.features.forEach(feature => {
            const props = feature.properties;
            const distance = props.distance_km || 0;
            
            // Color routes by distance
            let color = '#667eea'; // Short (< 1000 km)
            if (distance > 5000) {
                color = '#dc3545'; // Long (> 5000 km)
            } else if (distance > 2000) {
                color = '#fd7e14'; // Medium (2000-5000 km)
            }
            
            const route = L.geoJSON(feature, {
                style: {
                    color: color,
                    weight: 2,
                    opacity: 0.6
                }
            });
            
            route.bindPopup(`
                <b>${props.origin} → ${props.destination}</b><br>
                <small>Distance: ${distance.toFixed(0)} km</small><br>
                <small>Airline: ${props.airline || 'N/A'}</small>
            `);
            
            state.routeLayer.addLayer(route);
        });
        
        // Update info box
        updateInfoBox(`
            <strong>${airportName}</strong><br>
            Showing ${data.features.length} route(s)
            ${data.features.length >= CONFIG.MAX_ROUTES_DISPLAY ? ` (limited to ${CONFIG.MAX_ROUTES_DISPLAY})` : ''}
        `);
        
        // Add legend for route colors
        const legend = `
            <div class="mt-2">
                <small><strong>Distance Legend:</strong></small><br>
                <small><span style="color: #667eea;">●</span> < 1,000 km</small><br>
                <small><span style="color: #fd7e14;">●</span> 1,000-5,000 km</small><br>
                <small><span style="color: #dc3545;">●</span> > 5,000 km</small>
            </div>
        `;
        updateStatsBox(legend);
        
    } catch (error) {
        console.error('Error loading routes:', error);
        showError('Failed to load routes.');
    } finally {
        state.isLoading = false;
    }
}

// Make loadRoutes globally accessible (for popup buttons)
window.loadRoutes = loadRoutes;

// ===========================
// SEARCH FUNCTIONALITY
// ===========================
let searchTimeout = null;

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        if (searchTimeout) clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            searchResults.classList.remove('show');
            return;
        }
        
        // Debounce search
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, CONFIG.SEARCH_DEBOUNCE);
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('show');
        }
    });
}

function performSearch(query) {
    const results = state.allAirports.filter(feature => {
        const props = feature.properties;
        const searchStr = query.toLowerCase();
        
        return (
            props.name.toLowerCase().includes(searchStr) ||
            props.city.toLowerCase().includes(searchStr) ||
            props.country.toLowerCase().includes(searchStr) ||
            props.iata_code.toLowerCase().includes(searchStr)
        );
    }).slice(0, 10); // Limit to 10 results
    
    displaySearchResults(results);
}

function displaySearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">No airports found</div>';
        searchResults.classList.add('show');
        return;
    }
    
    const html = results.map(feature => {
        const props = feature.properties;
        return `
            <div class="search-result-item" onclick="selectAirport('${props.iata_code}', ${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]})">
                <strong>${props.name}</strong>
                <small>${props.city}, ${props.country} (${props.iata_code})</small>
            </div>
        `;
    }).join('');
    
    searchResults.innerHTML = html;
    searchResults.classList.add('show');
}

function selectAirport(iataCode, lat, lon) {
    // Close search results
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('searchInput').value = '';
    
    // Zoom to airport
    state.map.setView([lat, lon], 10);
    
    // Find and open popup
    state.airportMarkers.eachLayer(layer => {
        const latlng = layer.getLatLng();
        if (Math.abs(latlng.lat - lat) < 0.01 && Math.abs(latlng.lng - lon) < 0.01) {
            layer.openPopup();
        }
    });
}

// Make selectAirport globally accessible
window.selectAirport = selectAirport;

// ===========================
// FILTER FUNCTIONALITY
// ===========================
function populateCountryFilter() {
    const select = document.getElementById('countryFilter');
    const sortedCountries = Array.from(state.countries).sort();
    
    sortedCountries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

function applyFilters() {
    const country = document.getElementById('countryFilter').value;
    const majorHubsOnly = document.getElementById('majorHubsOnly').checked;
    
    state.filteredAirports = state.allAirports.filter(feature => {
        const props = feature.properties;
        
        let matchesCountry = !country || props.country === country;
        let matchesHubStatus = !majorHubsOnly || props.is_major_hub;
        
        return matchesCountry && matchesHubStatus;
    });
    
    displayAirports(state.filteredAirports);
    updateStats();
    
    updateInfoBox(`Filters applied: ${state.filteredAirports.length} airport(s) displayed`);
}

function resetFilters() {
    document.getElementById('countryFilter').value = '';
    document.getElementById('majorHubsOnly').checked = false;
    
    state.filteredAirports = [...state.allAirports];
    displayAirports(state.filteredAirports);
    updateStats();
    
    updateInfoBox('Filters reset. All airports displayed.');
}

// ===========================
// LAYER CONTROLS
// ===========================
function initializeLayerControls() {
    const showAirports = document.getElementById('showAirports');
    const showRoutes = document.getElementById('showRoutes');
    
    showAirports.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.map.addLayer(state.airportMarkers);
        } else {
            state.map.removeLayer(state.airportMarkers);
        }
    });
    
    showRoutes.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.map.addLayer(state.routeLayer);
        } else {
            state.map.removeLayer(state.routeLayer);
        }
    });
}

// ===========================
// ACTION BUTTONS
// ===========================
function clearRoutes() {
    state.routeLayer.clearLayers();
    updateInfoBox('Routes cleared. Click on an airport to view its routes.');
    updateStatsBox('');
}

async function findNearbyAirports() {
    const userLat = prompt('Enter your latitude:', '53.35');
    const userLon = prompt('Enter your longitude:', '-6.26');
    const radius = prompt('Enter search radius (km):', '100');
    
    if (!userLat || !userLon || !radius) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/airports/nearby/?lat=${userLat}&lon=${userLon}&radius=${radius}`);
        if (!response.ok) throw new Error('Failed to find nearby airports');
        
        const data = await response.json();
        
        updateInfoBox(`Found ${data.features.length} airport(s) within ${radius} km of (${userLat}, ${userLon})`);
        
        // Highlight nearby airports
        displayAirports(data.features);
        
    } catch (error) {
        console.error('Error finding nearby airports:', error);
        showError('Failed to find nearby airports.');
    }
}

async function findNearestAirport() {
    const userLat = prompt('Enter your latitude:', '53.35');
    const userLon = prompt('Enter your longitude:', '-6.26');
    
    if (!userLat || !userLon) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE}/airports/nearest/?lat=${userLat}&lon=${userLon}`);
        if (!response.ok) throw new Error('Failed to find nearest airport');
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const airport = data.features[0];
            const props = airport.properties;
            const coords = airport.geometry.coordinates;
            
            updateInfoBox(`
                <strong>Nearest Airport:</strong><br>
                ${props.name}<br>
                ${props.city}, ${props.country}<br>
                Distance: ${props.distance_km ? props.distance_km.toFixed(1) : 'N/A'} km
            `);
            
            // Zoom to airport
            state.map.setView([coords[1], coords[0]], 10);
            
            // Highlight the airport
            displayAirports([airport]);
        }
        
    } catch (error) {
        console.error('Error finding nearest airport:', error);
        showError('Failed to find nearest airport.');
    }
}

async function showTopHubs() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/airports/hubs/?top=10`);
        if (!response.ok) throw new Error('Failed to load top hubs');
        
        const data = await response.json();
        
        if (data.length > 0) {
            const html = '<strong>Top 10 Countries by Airport Count:</strong><br>' +
                data.map((item, index) => 
                    `${index + 1}. ${item.country}: ${item.count} airports`
                ).join('<br>');
            
            updateStatsBox(html);
        }
        
    } catch (error) {
        console.error('Error loading top hubs:', error);
        showError('Failed to load top hubs.');
    }
}

// ===========================
// UI HELPERS
// ===========================
function updateInfoBox(message) {
    const infoBox = document.getElementById('infoBox');
    infoBox.innerHTML = `<p>${message}</p><div id="statsBox" class="stats-box"></div>`;
}

function updateStatsBox(content) {
    const statsBox = document.getElementById('statsBox');
    if (statsBox) {
        statsBox.innerHTML = content;
    }
}

function updateStats() {
    const total = state.allAirports.length;
    const displayed = state.filteredAirports.length;
    const stats = `
        <strong>Statistics:</strong><br>
        Total airports: ${total}<br>
        Displayed: ${displayed}<br>
        Countries: ${state.countries.size}
    `;
    updateStatsBox(stats);
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showError(message) {
    updateInfoBox(`<span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> ${message}</span>`);
}

// ===========================
// EVENT LISTENERS
// ===========================
function attachEventListeners() {
    // Search
    initializeSearch();
    
    // Filters
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Layer controls
    initializeLayerControls();
    
    // Action buttons
    document.getElementById('clearBtn').addEventListener('click', clearRoutes);
    document.getElementById('btnNearby').addEventListener('click', findNearbyAirports);
    document.getElementById('btnNearest').addEventListener('click', findNearestAirport);
    document.getElementById('btnHubs').addEventListener('click', showTopHubs);
}