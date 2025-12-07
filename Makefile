.PHONY: help build up down restart logs clean

help:
	@echo "Docker Management Commands"
	@echo "=========================="
	@echo "make build       - Build all containers"
	@echo "make up          - Start all services"
	@echo "make down        - Stop all services"
	@echo "make restart     - Restart all services"
	@echo "make logs        - View all logs"
	@echo "make logs-web    - View Django logs"
	@echo "make logs-db     - View PostgreSQL logs"
	@echo "make shell       - Django shell"
	@echo "make dbshell     - PostgreSQL shell"
	@echo "make migrate     - Run migrations"
	@echo "make static      - Collect static files"
	@echo "make superuser   - Create superuser"
	@echo "make clean       - Remove all containers and volumes"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

logs-web:
	docker-compose logs -f web

logs-db:
	docker-compose logs -f postgres

shell:
	docker-compose exec web python manage.py shell

dbshell:
	docker-compose exec postgres psql -U webmappingca -d webmapping_db_ca

migrate:
	docker-compose exec web python manage.py migrate

static:
	docker-compose exec web python manage.py collectstatic --noinput

superuser:
	docker-compose exec web python manage.py createsuperuser

clean:
	docker-compose down -v
	docker system prune -f

# Production commands
prod-build:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml down