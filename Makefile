dev-frontend:
	npm run dev --workspace=frontend

build-frontend:
	npm run build --workspace=frontend

dev-backend:
	cd backend && mvn spring-boot:run

build-backend:
	cd backend && mvn clean package

build:
	$(MAKE) build-frontend
	$(MAKE) build-backend
