.PHONY: overlay frontend test up down

overlay:
	cd overlay && npm test && npm run typecheck

frontend:
	cd frontend && npm test && npm run typecheck && npm run build

test: overlay frontend

up:
	docker compose up --build

down:
	docker compose down
