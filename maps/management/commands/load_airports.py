from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
from maps.models import Airport
import csv
import os

class Command(BaseCommand):
    help = "Load real airports from OpenFlights airports.dat (filters invalid or small/private airports)."

    def add_arguments(self, parser):
        parser.add_argument("dat_path", type=str, help="Path to airports.dat file")

    def handle(self, *args, **opts):
        path = opts["dat_path"]

        if not os.path.exists(path):
            self.stderr.write(self.style.ERROR(f"File not found: {path}"))
            return

        self.stdout.write(f"Loading airports from: {path}")

        imported = skipped = 0

        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                # 1,"Goroka Airport","Goroka","Papua New Guinea","GKA","AYGA",-6.081689834590001,145.391998291,5282,10,"U","Pacific/Port_Moresby","airport","OurAirports"
                if not row or len(row) < 8:
                    continue

                try:
                    name = (row[1] or "").strip('" ')
                    city = (row[2] or "").strip('" ')
                    country = (row[3] or "").strip('" ')
                    iata = (row[4] or "").strip('" ').upper()
                    lat = float(row[6])
                    lon = float(row[7])

                    # Filter logic
                    if not iata or len(iata) != 3:
                        skipped += 1
                        continue
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        skipped += 1
                        continue
                    if "heli" in name.lower() or "seaplane" in name.lower():
                        skipped += 1
                        continue
                    if country.strip().lower() in ["antarctica", "unknown"]:
                        skipped += 1
                        continue

                    Airport.objects.update_or_create(
                        iata_code=iata,
                        defaults=dict(
                            name=name or "Unnamed Airport",
                            city=city,
                            country=country,
                            geom=Point(lon, lat, srid=4326),
                        ),
                    )
                    imported += 1

                except Exception:
                    skipped += 1

        self.stdout.write(self.style.SUCCESS(f"Imported or updated {imported} airports."))
        self.stdout.write(self.style.WARNING(f"Skipped {skipped} rows."))
        self.stdout.write(f"Total in DB: {Airport.objects.count()}")
