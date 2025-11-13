#!/bin/bash

# gibRun MCP Server - Production Deployment Script
set -e

echo "🚀 Starting gibRun MCP Server production deployment..."

# Configuration
DOCKER_IMAGE=${DOCKER_IMAGE:-"ghcr.io/your-org/gibrun-mcp-server:latest"}
ENV_FILE=${ENV_FILE:-".env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"docker-compose.prod.yml"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking deployment requirements..."

    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi

    # Check environment file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Copy .env.example to $ENV_FILE and configure your environment variables"
        exit 1
    fi

    log_info "Requirements check passed"
}

pull_images() {
    log_info "Pulling Docker images..."
    docker pull $DOCKER_IMAGE
    log_info "Images pulled successfully"
}

backup_database() {
    log_info "Creating database backup..."

    # This assumes you have a backup container or script
    # Adjust according to your backup strategy
    if docker-compose -f $COMPOSE_FILE ps postgres | grep -q "Up"; then
        docker-compose -f $COMPOSE_FILE exec -T postgres pg_dumpall -U gibrun > backup_$(date +%Y%m%d_%H%M%S).sql
        log_info "Database backup created"
    else
        log_warn "PostgreSQL container not running, skipping backup"
    fi
}

stop_services() {
    log_info "Stopping existing services..."
    docker-compose -f $COMPOSE_FILE down || true
    log_info "Services stopped"
}

start_services() {
    log_info "Starting services with new deployment..."

    # Start with environment file
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d

    log_info "Waiting for services to be healthy..."
    sleep 30

    # Check if services are healthy
    if docker-compose -f $COMPOSE_FILE ps | grep -q "unhealthy\|Exit"; then
        log_error "Some services failed to start properly"
        docker-compose -f $COMPOSE_FILE logs
        exit 1
    fi

    log_info "Services started successfully"
}

run_migrations() {
    log_info "Running database migrations..."

    # Wait for database to be ready
    docker-compose -f $COMPOSE_FILE exec -T postgres sh -c 'while ! pg_isready -U gibrun; do sleep 1; done'

    # Run migrations if you have any
    # docker-compose -f $COMPOSE_FILE exec app npm run migrate

    log_info "Migrations completed"
}

health_check() {
    log_info "Performing health checks..."

    # Check if the main service is responding
    max_attempts=30
    attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f $COMPOSE_FILE exec -T gibrun-mcp node scripts/healthcheck.js &> /dev/null; then
            log_info "Health check passed"
            return 0
        fi

        log_warn "Health check failed, attempt $attempt/$max_attempts"
        sleep 10
        ((attempt++))
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

cleanup() {
    log_info "Cleaning up old Docker images..."
    docker image prune -f
    log_info "Cleanup completed"
}

rollback() {
    log_error "Deployment failed, initiating rollback..."

    # Stop new deployment
    docker-compose -f $COMPOSE_FILE down

    # Start previous version if available
    # This would require additional logic to manage versions

    log_error "Rollback completed. Manual intervention may be required."
    exit 1
}

# Main deployment flow
main() {
    log_info "Starting deployment of gibRun MCP Server"

    check_requirements
    pull_images
    backup_database
    stop_services

    # Trap errors for rollback
    trap rollback ERR

    start_services
    run_migrations

    if health_check; then
        log_info "🎉 Deployment completed successfully!"
        log_info "Services are running and healthy"
        cleanup
    else
        log_error "Deployment failed health checks"
        rollback
    fi
}

# Run main function
main "$@"