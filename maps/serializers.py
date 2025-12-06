from rest_framework import serializers
from django.contrib.gis.geos import GEOSGeometry, Point
import json
from .models import Airport, FlightRoute


class AirportSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    geometry = serializers.SerializerMethodField()
    properties = serializers.SerializerMethodField()

    class Meta:
        model = Airport
        fields = ("type", "geometry", "properties")

    def get_type(self, obj):
        return "Feature"

    def get_geometry(self, obj):
        if obj.geom:
            return json.loads(obj.geom.geojson)
        return None

    def get_properties(self, obj):
        # Everything else goes under properties
        return {
            "id": obj.id,
            "name": obj.name,
            "iata_code": obj.iata_code,
            "city": obj.city,
            "country": obj.country,
            "altitude_ft": obj.altitude_ft,
            "is_major_hub": obj.is_major_hub,  # ✅ ADDED THIS LINE
        }


class FlightRouteSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    geometry = serializers.SerializerMethodField()
    properties = serializers.SerializerMethodField()

    class Meta:
        model = FlightRoute
        fields = ("type", "geometry", "properties")

    def get_type(self, obj):
        return "Feature"

    def get_geometry(self, obj):
        if obj.geom:
            return json.loads(obj.geom.geojson)
        return None

    def get_properties(self, obj):
        return {
            "id": obj.id,
            "origin": obj.origin.iata_code if obj.origin else None,
            "destination": obj.destination.iata_code if obj.destination else None,
            "airline": obj.airline,  # ✅ ADDED airline field
            "distance_km": obj.distance_km,
        }


class AirportCreateSerializer(serializers.ModelSerializer):
    """
    Serializer used for creating or updating Airport records (supports lat/lon input).
    """

    lat = serializers.FloatField(write_only=True)
    lon = serializers.FloatField(write_only=True)

    class Meta:
        model = Airport
        fields = (
            "name",
            "iata_code",
            "city",
            "country",
            "altitude_ft",
            "is_major_hub",
            "lat",
            "lon",
        )

    def create(self, validated_data):
        lat = validated_data.pop("lat")
        lon = validated_data.pop("lon")
        validated_data["geom"] = Point(lon, lat, srid=4326)
        return Airport.objects.create(**validated_data)

    def update(self, instance, validated_data):
        # Handle lat/lon if provided
        if "lat" in validated_data and "lon" in validated_data:
            lat = validated_data.pop("lat")
            lon = validated_data.pop("lon")
            instance.geom = Point(lon, lat, srid=4326)
        
        # Update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance