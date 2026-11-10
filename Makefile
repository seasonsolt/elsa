# Quality gate (PLAN-2 B4). `make check` is what CI runs; run it before every commit.
#   lint        ESLint over src/ and test/ (eslint.config.mjs)
#   typecheck   tsc --checkJs over src/*.js, src/lib/*.js, src/view/*.js (tsconfig.json)
#   test        node test/run.mjs (rooms, unit tests, content keys, exposure report)
#   build-check a fresh build must be byte-identical to ice-castle.html as it is in the working tree (staged or not),
#               so a source change cannot be committed without the rebuilt page. Needs no clean git state.

FRESH := .tools/fresh-ice-castle.html

.PHONY: check lint typecheck test build-check build

check: lint typecheck test build-check
	@echo "make check: all gates passed"

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

lint: node_modules
	npx eslint .

typecheck: node_modules
	npx tsc -p tsconfig.json

test:
	node test/run.mjs

build:
	python3 art/build_page.py

build-check:
	@mkdir -p .tools
	@python3 art/build_page.py --out $(FRESH) > /dev/null
	@if cmp -s $(FRESH) ice-castle.html; then echo "build-check: ice-castle.html equals a fresh build"; \
	 else echo "build-check FAILED: ice-castle.html differs from a fresh build; run 'make build' and keep the result" >&2; exit 1; fi
