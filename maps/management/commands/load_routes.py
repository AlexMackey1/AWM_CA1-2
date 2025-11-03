from django.core.management.base import BaseCommand
from django.contrib.gis.geos import LineString
from django.db import transaction
from maps.models import Airport, FlightRoute
import csv, os, math

def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance (km) between two lat/lon points."""
    R = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(a))

class Command(BaseCommand):
    help = "Load flight routes from OpenFlights routes.dat, linking them to Airport objects efficiently."

    def add_arguments(self, parser):
        parser.add_argument("dat_path", type=str, help="Path to routes.dat file")

    @transaction.atomic
    def handle(self, *args, **opts):
        path = opts["dat_path"]
        if not os.path.exists(path):
            self.stderr.write(self.style.ERROR(f"File not found: {path}"))
            return

        self.stdout.write(f"Loading routes from: {path}")

        # Preload all airports into a dict for instant lookups
        airports = {
            a.iata_code.upper(): a
            for a in Airport.objects.all()
            if a.iata_code and len(a.iata_code) == 3
        }
        self.stdout.write(f"Cached {len(airports)} airports in memory")

        imported = skipped = 0
        batch = []

        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row or len(row) < 6:
                    continue

                try:
                    airline = (row[0] or "").strip().upper()
                    src = (row[2] or "").strip().upper()
                    dst = (row[4] or "").strip().upper()

                    if len(src) != 3 or len(dst) != 3 or src == dst:
                        skipped += 1
                        continue

                    a1 = airports.get(src)
                    a2 = airports.get(dst)
                    if not a1 or not a2:
                        skipped += 1
                        continue

                    dist = haversine_km(a1.geom.y, a1.geom.x, a2.geom.y, a2.geom.x)
                    geom = LineString(a1.geom, a2.geom, srid=4326)

                    batch.append(
                        FlightRoute(
                            origin=a1,
                            destination=a2,
                            airline=airline,
                            geom=geom,
                            distance_km=dist,
                        )
                    )

                    imported += 1

                    # Insert in batches of 1000 for performance
                    if len(batch) >= 1000:
                        FlightRoute.objects.bulk_create(batch, ignore_conflicts=True)
                        batch = []

                except Exception:
                    skipped += 1

        # Final batch insert
        if batch:
            FlightRoute.objects.bulk_create(batch, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS(f"Imported {imported} routes"))
        self.stdout.write(self.style.WARNING(f"Skipped {skipped} rows"))
        self.stdout.write(f"Total routes in DB: {FlightRoute.objects.count()}")
