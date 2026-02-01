# Load Testing

## Overview

Load tests verify the API can handle expected traffic loads while maintaining acceptable response times.

## Tools

### k6 (Recommended)

Modern load testing tool written in Go with JavaScript scripting.

**Installation:**
```bash
# macOS
brew install k6

# Windows
choco install k6

# Ubuntu/Debian
sudo apt install k6

# Docker
docker run -i grafana/k6 run - <script.js
```

**Running Tests:**
```bash
# Default configuration
k6 run load-tests/k6-load-test.js

# Custom virtual users and duration
k6 run --vus 100 --duration 5m load-tests/k6-load-test.js

# With environment variables
k6 run -e BASE_URL=https://api.fieldledger.io -e AUTH_TOKEN=xxx load-tests/k6-load-test.js

# Output to JSON
k6 run --out json=results.json load-tests/k6-load-test.js

# Output to InfluxDB for Grafana dashboards
k6 run --out influxdb=http://localhost:8086/k6 load-tests/k6-load-test.js
```

## Test Scenarios

### Standard Load Test
- Ramp up to 50 concurrent users
- Tests health check, login, jobs list, pagination, filters
- Duration: ~6 minutes

### Stress Test
```bash
k6 run --vus 200 --duration 10m load-tests/k6-load-test.js
```

### Spike Test
```bash
k6 run --stage 1m:10,30s:200,1m:200,30s:10 load-tests/k6-load-test.js
```

### Soak Test (Extended Duration)
```bash
k6 run --vus 25 --duration 2h load-tests/k6-load-test.js
```

## Performance Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration` | p(95) < 500ms | 95th percentile response time |
| `http_req_failed` | rate < 1% | Request failure rate |
| `login_duration` | p(95) < 1000ms | Login response time |
| `jobs_list_duration` | p(95) < 800ms | Jobs list response time |

## Authenticated Testing

To test authenticated endpoints, generate a JWT token:

```bash
# Get token via login
TOKEN=$(curl -s -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' | jq -r '.token')

# Run with token
k6 run -e AUTH_TOKEN=$TOKEN load-tests/k6-load-test.js
```

## Interpreting Results

### Good Results
```
✓ http_req_duration..............: avg=45ms  min=12ms  med=38ms  max=234ms  p(95)=89ms
✓ http_req_failed................: 0.00%
✓ errors.........................: 0.00%
```

### Warning Signs
- p(95) response time > 500ms
- Error rate > 1%
- Memory/CPU spikes on server

### Action Items
- If p(95) > threshold: Optimize slow endpoints, add caching
- If error rate high: Check server logs, database connections
- If memory issues: Check for leaks, increase resources

## CI/CD Integration

Add to GitHub Actions:
```yaml
- name: Run load tests
  run: |
    docker run -i grafana/k6 run - < backend/load-tests/k6-load-test.js
```

## Monitoring During Tests

```bash
# Watch server resources
htop

# Watch MongoDB
mongostat

# Watch Node.js memory
node --inspect server.js
```

