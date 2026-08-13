.PHONY: overlay frontend test up down seed

overlay:
	cd overlay && npm test && npm run typecheck

frontend:
	cd frontend && npm run typecheck && npm run build

test: overlay frontend

up:
	docker compose up --build

down:
	docker compose down

seed:
	cd overlay && npm run seed
