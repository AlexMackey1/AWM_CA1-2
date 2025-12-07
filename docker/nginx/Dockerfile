FROM nginx:alpine

# Remove default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/

# Copy SSL certificates (if available)
# COPY ssl/ /etc/nginx/ssl/

# Create directory for static files
RUN mkdir -p /app/staticfiles /app/media

# Set proper permissions
RUN chmod 755 /app/staticfiles /app/media

EXPOSE 80 443
