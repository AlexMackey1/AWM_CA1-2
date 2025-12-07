# Use Python 3.11 slim image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    gdal-bin \
    libgdal-dev \
    python3-gdal \
    binutils \
    libproj-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL / GEOS / PROJ library paths
ENV GDAL_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgdal.so
ENV GEOS_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgeos_c.so
ENV PROJ_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libproj.so

# Install Python dependencies
COPY docker/django/requirements.txt /app/
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy project code
COPY . /app/

# Create static and media directories (inside container)
RUN mkdir -p /app/staticfiles /app/media

# Copy entrypoint script and make it executable
COPY docker/django/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port 8000 for Django
EXPOSE 8000

# Run entrypoint (will run as root by default)
ENTRYPOINT ["/entrypoint.sh"]
