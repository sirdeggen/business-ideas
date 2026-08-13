.PHONY: test typecheck up down

test:
	cd server && npm test

typecheck:
	cd server && npm run typecheck
	cd frontend && npm run typecheck

up:
	docker compose up --build

down:
	docker compose down
