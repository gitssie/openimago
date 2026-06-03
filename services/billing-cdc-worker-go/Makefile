.PHONY: test test-unit test-integration build run clean

# Run all tests
test:
	go test ./... -v -count=1

# Run only unit tests (skip integration)
test-unit:
	go test ./model/... ./config/... -v -count=1

# Run integration tests
test-integration:
	go test ./repository/... ./cdc/... -v -count=1

# Build binary
build:
	go build -o bin/billing-cdc-worker .

# Run from source
run:
	go run .

# Clean build artifacts
clean:
	rm -rf bin/

# Tidy dependencies
tidy:
	go mod tidy
