# Flight Connections Explorer – CA2

Location-based web mapping application for the **Advanced Web Mapping** CA2 assignment.

The system consists of:

- A **Django + GeoDjango + PostGIS** backend (via **Docker / Docker Compose**),
- A **Leaflet web frontend** rendered by Django,
- A **Cordova Android app** that reuses the same UI and talks to the same REST API.

The app visualises global airports and routes, supports spatial queries (nearby / nearest), and is deployed on an **AWS EC2** instance using Docker.

---

## 1. High-level overview

### 1.1 What the app does

- Visualises global **airports** as clustered markers on a Leaflet map.
- Shows **flight routes** from a selected origin airport.
- Supports spatial queries:
  - **Nearby airports** within a chosen radius of a clicked point.
  - **Nearest airport** to a clicked point.
- Provides search, filters and a mobile-friendly UI.

### 1.2 Architecture (how pieces fit together)

1. **Web browser / Cordova app**
   - Loads `index.html` + `style.css` + `main.js`.
   - Makes HTTP requests to `/api/...` endpoints.

2. **Nginx (Docker container)**
   - Serves static assets (JS/CSS) from `/app/staticfiles`.
   - Proxies `/api/...` requests to Django (`web` container).

3. **Django + DRF (Docker container)**
   - Exposes REST endpoints: `/api/airports/`, `/api/airports/routes/`, `/api/airports/nearby/`, `/api/airports/nearest/`, etc.
   - Uses GeoDjango to perform spatial queries in PostGIS.

4. **PostgreSQL + PostGIS (Docker container)**
   - Stores `Airport` (Point geometry) and `FlightRoute` (LineString geometry).
   - Handles spatial operations like “within radius” and “nearest”.

---

## 2. Web app functionality – how each feature works

All front-end logic lives in `maps/static/maps/js/main.js` (and the same file is copied to `www/js/main.js` for the Cordova app).

### 2.1 Airports loading (initial map)

**What the user sees**

- When the page loads, the map appears and airport markers are added progressively in clusters.
- The sidebar shows counts and filter options.

**What actually happens**

1. Leaflet map is created and initial view is set (e.g. Europe / world).
2. `loadAirports()` is called:
   - Sends `GET` to:  
     `CONFIG.API_BASE + '/airports/'`
   - Stores the returned GeoJSON features in `state.allAirports`.
   - Creates a `L.markerClusterGroup()` and adds one marker per airport.
   - Binds a popup to each marker with airport details and a “View Routes” button.
3. Sidebar is updated:
   - Country filter dropdown is populated from the unique `country` values.
   - Search dataset is built for fast filtering.

---

### 2.2 Search (by name / city / country / IATA)

**What the user sees**

- Typing in the search box shows a dropdown of matching airports.
- Clicking a result zooms to the airport and opens its popup.

**What actually happens**

1. On `input` in the search field:
   - `main.js` filters `state.allAirports` using:
     - `name`
     - `city`
     - `country`
     - `iata_code`
   - Matching results are rendered as a list under the search box.
2. When a result is clicked:
   - The map `flyTo()` the airport coordinates.
   - The corresponding marker is opened (`openPopup()`).
   - The dropdown is hidden and the search text is set to the selected airport.

---

### 2.3 Country filter

**What the user sees**

- A country dropdown and buttons like **Apply Filters** / **Reset**.
- When a country is selected, only airports in that country are shown.

**What actually happens**

1. Dropdown is populated from all loaded airport features (`state.allAirports`).
2. On **Apply Filters**:
   - `main.js` filters `state.allAirports` by the selected `country`.
   - The marker cluster layer is cleared and rebuilt with only matching airports.
   - The info box is updated with the number of airports currently displayed.
3. On **Reset Filters**:
   - Filters are cleared.
   - Marker cluster is rebuilt using the full `state.allAirports` list.
   - The info box returns to a default message.

---

### 2.4 Flight routes from a selected airport

**What the user sees**

- Clicking an airport marker opens a popup with details and a **“View Routes”** button.
- Clicking this button draws lines from that airport to its destinations.

**What actually happens**

1. In the popup template, a button calls something like:
   - `loadRoutes(iataCode)`
2. `loadRoutes(iataCode)`:
   - Sends `GET` to:  
     `CONFIG.API_BASE + '/airports/routes/?origin=' + iataCode`
   - Receives a GeoJSON FeatureCollection of `FlightRoute` features.
3. The frontend:
   - Clears any existing routes layer.
   - Creates a `L.geoJSON` layer from the route features.
   - Styles each line based on distance:
     - Short / medium / long haul (different colours / line styles).
   - Adds the routes layer to the map and fits the map view to show the origin plus its destinations.
   - Updates the info box with:
     - The number of routes,
     - Example destinations,
     - Route distance stats.

---

### 2.5 Nearby airports (within radius of click)

**What the user sees**

- Clicks **“Nearby Airports”** in the sidebar.
- Enters a radius in km (e.g. `200`).
- Clicks on the map.
- A circle appears, and only airports inside that circle are shown.

**What actually happens**

1. User clicks **Nearby Airports**:
   - UI enters a “waiting for click” mode.
   - User is prompted for a radius in km (from an input field or popup).
2. When the user clicks on the map:
   - The click handler reads `lat` and `lng`.
   - Sends `GET` to:  
     `CONFIG.API_BASE + '/airports/nearby/?lat=' + lat + '&lon=' + lng + '&radius=' + radius`
3. Backend logic (`views.py`):
   - Constructs a point: `Point(lon, lat, srid=4326)`.
   - Filters airports where `geom__distance_lte=(point, Distance(km=radius))`.
   - Annotates each airport with `distance = Distance('geom', point)`.
   - Orders by `distance` and returns them as a GeoJSON FeatureCollection.
4. Frontend:
   - Draws a `L.circle` around the click location with the given radius.
   - Rebuilds the marker cluster to include only the returned nearby airports.
   - Updates the info box:
     - Number of nearby airports,
     - Radius used,
     - Optional summary info.

The user can then use a reset/clear button to return to the full airport set.

---

### 2.6 Nearest airport (closest airport to a click)

**What the user sees**

- Clicks **“Nearest Airport”** in the sidebar.
- Clicks anywhere on the map.
- The map:
  - Shows a marker at the click location,
  - Highlights and zooms to the nearest airport,
  - Displays the distance in km.

**What actually happens**

1. User clicks **Nearest Airport**:
   - UI enters a “waiting for click” mode.
2. On map click:
   - `lat` and `lng` are captured.
   - A request is sent to:  
     `CONFIG.API_BASE + '/airports/nearest/?lat=' + lat + '&lon=' + lng`
3. Backend (`views.py`):
   - Builds a `Point(lon, lat, srid=4326)`.
   - Annotates all airports with distance:
     ```python
     qs = Airport.objects.annotate(distance=Distance('geom', pt)).order_by('distance')[:1]
     ```
   - Takes the first (closest) airport.
   - Serializes it to GeoJSON and injects a `distance_km` property into `properties`.
4. Frontend:
   - Draws a small marker at the clicked location (e.g. a blue pin).
   - Locates the nearest airport feature from the response.
   - Zooms to that airport (e.g. `map.flyTo()`).
   - Highlights its marker and opens its popup.
   - Updates the info box with:
     - Airport name / code,
     - Country,
     - Approximate distance in km from the clicked point.

---

### 2.7 Top hubs (countries by airport count)

**What the user sees**

- Clicking **“Top Hubs”** displays a list of countries with the highest number of airports.

**What actually happens**

1. Frontend sends `GET` to:  
   `/api/airports/hubs/?top=<n>`
2. Backend:
   - Performs:
     ```python
     Airport.objects.values('country').annotate(count=Count('id')).order_by('-count')[:top]
     ```
   - Returns a JSON list like:
     ```json
     [
       {"country": "United States", "count": 300},
       {"country": "Canada", "count": 50}
     ]
     ```
3. Frontend:
   - Renders the result in the sidebar info section as a simple ranking list.

---

### 2.8 Layer toggles and clearing state

**Layer toggles**

- The sidebar contains checkboxes for:
  - “Show Airports”
  - “Show Routes”
- Checking/unchecking these:
  - Adds/removes the airport cluster layer.
  - Adds/removes the route layer.

**Clearing routes / resetting**

- A **“Clear Routes”** button removes the current routes layer from the map and resets the info box text.
- Reset buttons for filters/spatial queries:
  - Restore `state.filteredAirports` to all airports,
  - Rebuild the airport layer,
  - Clear any temporary markers (e.g. click location) and circles.

---

## 3. Backend endpoints (summary)

All endpoints live under `/api/` and are handled by DRF viewsets.

- `GET /api/airports/`  
  → All airports as GeoJSON FeatureCollection.

- `GET /api/airports/routes/?origin=<IATA>`  
  → Routes from a given origin airport.

- `GET /api/airports/nearby/?lat=<lat>&lon=<lon>&radius=<km>`  
  → Airports within a radius (km) of the given point.

- `GET /api/airports/nearest/?lat=<lat>&lon=<lon>`  
  → Single nearest airport to the given point (includes `distance_km`).

- `GET /api/airports/hubs/?top=<n>`  
  → Top `n` countries by count of airports.

---

## 4. Running locally with Docker

### 4.1 Prerequisites

- Docker
- Docker Compose
- Git

### 4.2 Setup

```bash
git clone <your-repo-url> ca2-app
cd ca2-app

cp .env.example .env
# Edit .env with your local values
```

Key `.env` values for local Docker:

```env
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DATABASE_NAME=webmapping_db_ca
DATABASE_USER=webmappingca
DATABASE_PASSWORD=change-this-password
DATABASE_HOST=postgres
DATABASE_PORT=5432
```

### 4.3 Start containers

```bash
docker compose up -d --build
docker compose ps
```

### 4.4 Migrations & data loading

```bash
docker compose exec web python manage.py migrate
docker compose exec web python manage.py load_airports airports.dat
docker compose exec web python manage.py load_routes routes.dat
```

### 4.5 Test locally

- Web UI: `http://localhost/`
- API root: `http://localhost/api/`
- Airports: `http://localhost/api/airports/`

---

## 5. Deploying to AWS EC2 (Docker)

### 5.1 SSH into EC2 and pull code

```bash
ssh -i /path/to/ca2-ec2-key.pem ubuntu@YOUR_EC2_IP
cd ~/ca2-app
git pull origin main
```

### 5.2 Configure `.env` on the server

```env
DEBUG=False
SECRET_KEY=your-super-secret-key
ALLOWED_HOSTS=YOUR_EC2_IP,localhost,127.0.0.1

DATABASE_NAME=webmapping_db_ca
DATABASE_USER=webmappingca
DATABASE_PASSWORD=change-this-password
DATABASE_HOST=postgres
DATABASE_PORT=5432
```

### 5.3 Start the production stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### 5.4 Test from EC2 and from your machine

On EC2:

```bash
curl http://localhost/api/airports/
```

From your laptop:

- `http://YOUR_EC2_IP/`
- `http://YOUR_EC2_IP/api/airports/`

> If you **stop/start** the instance and the IP changes, update:
> - `ALLOWED_HOSTS` in `.env`
> - Cordova `window.API_BASE_URL`  
> then run `docker compose ... up -d` again.

---

## 6. Cordova Android app (mobile)

### 6.1 API base configuration

In `www/index.html` (Cordova project):

```html
<script src="cordova.js"></script>

<script>
    // Set to your current EC2 IP
    window.API_BASE_URL = 'http://YOUR_EC2_IP/api';
</script>

<script src="js/main.js"></script>
```

`main.js` reads this into `CONFIG.API_BASE`.

### 6.2 Mixed content & cleartext HTTP

In `config.xml`:

```xml
<preference name="MixedContentMode" value="AlwaysAllow" />

<platform name="android">
    <edit-config file="app/src/main/AndroidManifest.xml"
                 mode="merge"
                 target="/manifest/application">
        <application android:usesCleartextTraffic="true" />
    </edit-config>
</platform>
```

This allows the Android WebView (`https://localhost` internally) to call `http://YOUR_EC2_IP/api`.

### 6.3 Build & run

```bash
cd awmca_mobile
cordova platform add android    # once
cordova build android
cordova run android
```

- After install, the app can be opened from the home screen (no cable needed).
- It uses the same endpoints and behaviours as the web app.

---

## 7. Screenshots (placeholders)

Add images to a `screenshots/` folder and update filenames as needed:

### 7.1 Web app

- Airports map:  
  `![Web – Airports Map](screenshots/web-airports-map.png)`

- Routes from a selected origin:  
  `![Web – Routes from Origin](screenshots/web-routes-from-origin.png)`

- Nearby / nearest examples:  
  `![Web – Nearby Airports](screenshots/web-nearby-airports.png)`  
  `![Web – Nearest Airport](screenshots/web-nearest-airport.png)`

### 7.2 Mobile app

- Main map on Android:  
  `![Mobile – Map View](screenshots/mobile-map-view.png)`

- Nearby / nearest on mobile:  
  `![Mobile – Nearby Airports](screenshots/mobile-nearby-mobile.png)`

---

## 8. Quick troubleshooting

- **400 Bad Request**
  - Check `ALLOWED_HOSTS` in `.env` includes the IP/host you’re using.
- **No airports / routes**
  - Test `http://HOST/api/airports/` in a browser.
  - If it fails, check `docker compose ps` and container logs.
- **Mobile app shows map but no data**
  - Test API in the phone browser.
  - Ensure `window.API_BASE_URL` matches the EC2 IP.
  - Rebuild with `cordova build android` and reinstall.

---
