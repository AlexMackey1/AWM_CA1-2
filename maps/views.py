from django.shortcuts import render
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import Distance
from django.contrib.gis.db.models.functions import Distance as GDistance
from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Airport, FlightRoute
from .serializers import AirportSerializer, FlightRouteSerializer, AirportCreateSerializer


#  FRONTEND MAP VIEW
def index(request):
    """Serves the Leaflet front-end map page."""
    return render(request, "maps/index.html")


#  AIRPORT VIEWSET
class AirportViewSet(viewsets.ModelViewSet):
    """
    Handles CRUD operations and spatial queries for Airport data.
    """

    queryset = Airport.objects.all()
    serializer_class = AirportSerializer

    def list(self, request, *args, **kwargs):
        """
        Return all airports as a GeoJSON FeatureCollection.
        """
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "type": "FeatureCollection",
                "features": serializer.data,
            }
        )

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return AirportCreateSerializer
        return AirportSerializer

    # ORIGINAL FUNCTIONALITY: ROUTES (NOW WITH LIMIT PARAMETER)
    @action(detail=False, methods=["get"])
    def routes(self, request):
        """
        Return all routes originating from a given airport.
        Example: /api/airports/routes/?origin=DUB&limit=50
        """
        origin_code = request.query_params.get("origin")
        if not origin_code:
            return Response(
                {"error": "Please provide ?origin=<IATA>"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        origin_airport = Airport.objects.filter(iata_code__iexact=origin_code).first()
        if not origin_airport:
            return Response(
                {"error": f"No airport found with IATA '{origin_code}'"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ✅ ADDED: Support for limit parameter
        limit = int(request.query_params.get("limit", 1000))
        # Cap the limit to prevent excessive data
        limit = min(limit, 1000)

        routes = FlightRoute.objects.filter(origin=origin_airport)[:limit]
        data = FlightRouteSerializer(routes, many=True).data
        return Response({"type": "FeatureCollection", "features": data})

    @action(detail=False, methods=["get"])
    def nearby(self, request):
        """
        Return airports within a radius (km) of a given lat/lon.
        Example: /api/airports/nearby/?lat=53.3&lon=-6.2&radius=100
        """
        try:
            lat = float(request.query_params["lat"])
            lon = float(request.query_params["lon"])
            radius = float(request.query_params.get("radius", 100))
        except (KeyError, ValueError):
            return Response(
                {"error": "Use ?lat=<value>&lon=<value>&radius=<km>"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pt = Point(lon, lat, srid=4326)
        qs = (
            Airport.objects.filter(geom__distance_lte=(pt, Distance(km=radius)))
            .annotate(distance=GDistance("geom", pt))
            .order_by("distance")[:300]
        )
        data = AirportSerializer(qs, many=True).data
        return Response({"type": "FeatureCollection", "features": data})

    @action(detail=False, methods=["get"])
    def nearest(self, request):
        """
        Return the single nearest airport to a given lat/lon.
        Example: /api/airports/nearest/?lat=53.3&lon=-6.2
        """
        try:
            lat = float(request.query_params["lat"])
            lon = float(request.query_params["lon"])
        except (KeyError, ValueError):
            return Response(
                {"error": "Use ?lat=<value>&lon=<value>"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pt = Point(lon, lat, srid=4326)
        qs = Airport.objects.annotate(distance=GDistance("geom", pt)).order_by("distance")[:1]

        # ✅ ADDED: Include distance in response
        if qs.exists():
            airport = qs.first()
            data = AirportSerializer([airport], many=True).data
            # Add distance to properties
            if data and len(data) > 0:
                data[0]["properties"]["distance_km"] = round(airport.distance.km, 2)
        else:
            data = []

        return Response({"type": "FeatureCollection", "features": data})

    @action(detail=False, methods=["get"])
    def hubs(self, request):
        """
        Return top countries ranked by number of airports.
        Example: /api/airports/hubs/?top=10
        """
        top = int(request.query_params.get("top", 10))
        rows = (
            Airport.objects.values("country")
            .annotate(count=Count("id"))
            .order_by("-count")[:top]
        )
        return Response(list(rows))


#  FLIGHT ROUTE VIEWSET
class FlightRouteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only access to FlightRoute data with spatial query support.
    """

    queryset = FlightRoute.objects.all()
    serializer_class = FlightRouteSerializer
