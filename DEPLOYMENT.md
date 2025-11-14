# gibRun MCP Server - Production Deployment Guide

This guide covers deploying the gibRun MCP Server to production environments.

## Prerequisites

- Docker and Docker Compose
- GitHub Container Registry access (for pulling images)
- Environment-specific configuration

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/gibrun-mcp-server.git
   cd gibrun-mcp-server
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.production
   # Edit .env.production with your production values
   ```

3. **Deploy**
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```

## Environment Configuration

### Required Environment Variables

Copy `.env.example` to your environment file and configure:

```bash
# Database
DB_HOST=your-db-host
DB_PASSWORD=your-secure-db-password
DB_NAME=gibrun_prod

# Security
JWT_SECRET=your-jwt-secret
API_KEY=your-api-key

# External Services
REDIS_URL=redis://redis:6379
SENTRY_DSN=your-sentry-dsn

# Docker
DOCKER_IMAGE=ghcr.io/your-org/gibrun-mcp-server:latest
```

### Environment Files

- `.env.staging` - Staging environment
- `.env.production` - Production environment
- `.env.example` - Template with all variables

## Deployment Options

### Option 1: Automated Deployment Script

```bash
# For production
ENV_FILE=.env.production ./scripts/deploy.sh

# For staging
ENV_FILE=.env.staging ./scripts/deploy.sh
```

### Option 2: Manual Docker Compose

```bash
# Production
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# With monitoring
docker-compose -f docker-compose.prod.yml --profile monitoring --env-file .env.production up -d
```

### Option 3: Kubernetes

Use the provided Helm chart or Kubernetes manifests in the `k8s/` directory.

## Services Overview

### Core Services

- **gibrun-mcp**: Main MCP server application
- **postgres**: PostgreSQL database
- **redis**: Redis cache (optional)

### Monitoring Stack (Optional)

- **prometheus**: Metrics collection
- **grafana**: Dashboards and visualization
- **nginx**: Reverse proxy and load balancer

## Health Checks

The application includes comprehensive health checks:

```bash
# Check application health
curl http://localhost:3000/health

# Check Docker containers
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs gibrun-mcp
```

## Monitoring

### Accessing Grafana

1. Open http://localhost:3000
2. Default credentials: admin/admin
3. Import the gibRun dashboard from `monitoring/grafana/dashboards/`

### Key Metrics to Monitor

- **Application**: Response times, error rates, throughput
- **Database**: Connection count, query performance, disk usage
- **System**: CPU, memory, disk I/O

## Backup and Recovery

### Database Backup

```bash
# Manual backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U gibrun gibrun_prod > backup.sql

# Automated backup (configured in docker-compose.prod.yml)
# Runs daily at 2 AM UTC
```

### Recovery

```bash
# Restore from backup
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U gibrun gibrun_prod < backup.sql
```

## Scaling

### Horizontal Scaling

```bash
# Scale the application
docker-compose -f docker-compose.prod.yml up -d --scale gibrun-mcp=3
```

### Database Scaling

- Use PostgreSQL read replicas for read-heavy workloads
- Implement connection pooling
- Monitor and optimize query performance

## Security

### Network Security

- All services run in isolated Docker networks
- Use HTTPS in production with proper SSL certificates
- Implement proper firewall rules

### Application Security

- Regular dependency updates
- Security scanning in CI/CD pipeline
- Proper secret management (use Docker secrets or external vaults)

### Database Security

- Strong passwords and proper authentication
- SSL/TLS encryption for connections
- Regular security updates

## Troubleshooting

### Common Issues

1. **Container fails to start**
   ```bash
   docker-compose -f docker-compose.prod.yml logs <service-name>
   ```

2. **Database connection issues**
   ```bash
   docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U gibrun
   ```

3. **Application health check fails**
   ```bash
   docker-compose -f docker-compose.prod.yml exec gibrun-mcp node scripts/healthcheck.js
   ```

### Logs

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs

# Follow logs
docker-compose -f docker-compose.prod.yml logs -f gibrun-mcp

# View specific service logs
docker-compose -f docker-compose.prod.yml logs postgres
```

## Maintenance

### Updates

```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Update and restart
docker-compose -f docker-compose.prod.yml up -d
```

### Cleanup

```bash
# Remove unused images
docker image prune -f

# Remove unused volumes
docker volume prune -f

# Remove stopped containers
docker container prune -f
```

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review logs for error messages
3. Check GitHub Issues for known problems
4. Contact the development team

## Performance Benchmarks

Expected performance metrics:

- **Response Time**: <100ms for typical requests
- **Concurrent Users**: 1000+ simultaneous connections
- **Database Queries**: <10ms average response time
- **Memory Usage**: <512MB under normal load
- **CPU Usage**: <20% under normal load