"""from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
from django.db import connection
from maps.models import Airport, FlightRoute


class Command(BaseCommand):
    help = "Load sample airports and routes (Lab-style data loader)."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Loading Airport data..."))

        airports = [
            # name, iata_code, city, country, lon, lat
            ("Dublin Airport", "DUB", "Dublin", "Ireland", -6.2700, 53.4213),
            ("Heathrow Airport", "LHR", "London", "United Kingdom", -0.4543, 51.4700),
            ("Charles de Gaulle", "CDG", "Paris", "France", 2.5479, 49.0097),
            ("Amsterdam Schiphol", "AMS", "Amsterdam", "Netherlands", 4.7639, 52.3086),
        ]

        for name, iata, city, country, lon, lat in airports:
            airport, created = Airport.objects.get_or_create(
                iata_code=iata,
                defaults=dict(
                    name=name,
                    city=city,
                    country=country,
                    geom=Point(lon, lat),
                ),
            )
            msg = "Created" if created else "Already exists"
            self.stdout.write(f"{msg}: {airport}")

        self.stdout.write(self.style.SUCCESS("Airports loaded.\n"))

        # --------------------------------------------------------------------
        self.stdout.write(self.style.MIGRATE_HEADING("Loading Flight Route data..."))

        routes = [
            ("DUB", "LHR", "AerLingus"),
            ("DUB", "CDG", "AirFrance"),
            ("LHR", "AMS", "BritishAirways"),
            ("CDG", "AMS", "KLM"),
        ]

        for o_iata, d_iata, airline in routes:
            origin = Airport.objects.get(iata_code=o_iata)
            destination = Airport.objects.get(iata_code=d_iata)
            route, created = FlightRoute.objects.get_or_create(
                origin=origin,
                destination=destination,
                airline=airline,
            )
            msg = "Created" if created else "Already exists"
            self.stdout.write(f"{msg}: {route}")

        self.stdout.write(self.style.SUCCESS("Routes loaded.\n"))

        # --------------------------------------------------------------------
        self.stdout.write(self.style.MIGRATE_HEADING("Calculating distances (PostGIS)..."))
        with connection.cursor() as cursor:
            cursor.execute("""
               # UPDATE maps_flightroute
                #SET distance_km = ST_Length(geom::geography)/1000.0
                #WHERE geom IS NOT NULL;
 #           """)
       # self.stdout.write(self.style.SUCCESS("Distances updated.\n"))

       # self.stdout.write(self.style.SUCCESS("Data load complete."))
        
      #  """
