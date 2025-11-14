# K6 Load Testing Integration Feature

## Overview

K6 Load Testing Integration adalah fitur untuk mengintegrasikan k6 (load testing tool) dengan MCP gibrun, memungkinkan automated load testing, stress testing, dan performance validation dalam development workflow.

## 🎯 Problem Statement

### Current Challenges
- Tidak ada built-in load testing capabilities
- Sulit mengintegrasikan load testing dengan development workflow
- Manual script creation untuk setiap API endpoint
- Sulit mengkorlasikan load testing results dengan application metrics
- Tidak ada automated performance regression testing

### Solution
K6 Integration memberikan:
- Automated load testing script generation
- Integrated performance testing dalam development workflow
- Real-time metrics correlation dengan application monitoring
- Automated performance regression detection
- Cloud-based distributed load testing support

## 🔧 Technical Architecture

### K6 Integration Components

#### Core Components
```typescript
// K6 Tool Manager
export class K6ToolManager {
  private k6BinaryPath: string;
  private scriptGenerator: K6ScriptGenerator;
  private resultParser: K6ResultParser;
  private cloudDeployer: K6CloudDeployer;

  async executeTest(config: K6TestConfig): Promise<K6TestResult> {
    // Generate or use existing script
    const script = await this.prepareScript(config);

    // Execute test locally or on cloud
    const result = await this.runTest(script, config);

    // Parse and correlate results
    return this.parseResults(result);
  }
}

// Script Generator
export class K6ScriptGenerator {
  async generateFromSpec(spec: APISpecification): Promise<string> {
    // Generate k6 script from OpenAPI/Postman/HAR
  }

  async generateFromRecording(recording: HTTPRecording): Promise<string> {
    // Generate script from browser recording
  }
}
```

#### MCP Tools Integration
```typescript
// Tool: k6_load_test/execute
{
  name: 'k6_load_test/execute',
  description: 'Execute load testing and stress testing using K6 with advanced scenarios',
  inputSchema: {
    script_type: 'http' | 'websocket' | 'browser' | 'custom',
    target_url: string,
    scenarios: object[], // K6 scenario definitions
    thresholds: object,   // K6 threshold definitions
    duration: string,     // test duration (e.g., '30s', '5m')
    vus: number,         // virtual users
    stages: object[],    // ramp-up/ramp-down stages
    environment: object, // environment variables
    output_format: 'json' | 'html' | 'junit'
  }
}

// Tool: k6_script/generate
{
  name: 'k6_script/generate',
  description: 'Generate K6 test scripts from API specifications or recorded sessions',
  inputSchema: {
    source_type: 'openapi' | 'postman' | 'har' | 'manual',
    source_file: string,
    scenario_template: 'load' | 'stress' | 'spike' | 'volume',
    custom_checks: object[], // custom validation checks
    authentication: object,  // auth configuration
    output_path: string
  }
}
```

## 📋 Implementation Details

### Phase 1: Core K6 Integration

#### 1.1 K6 Binary Management
```typescript
export class K6BinaryManager {
  private k6Version = '0.45.0'; // Latest stable version

  async ensureK6Installed(): Promise<string> {
    // Check if k6 is installed
    // Download and install if not present
    // Return path to k6 binary
  }

  async validateVersion(): Promise<boolean> {
    // Validate k6 version compatibility
  }
}
```

#### 1.2 Script Generation Engine
```typescript
export class K6ScriptGenerator {
  async generateHTTPTest(config: HTTPTestConfig): Promise<string> {
    const script = `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = ${JSON.stringify(config.options, null, 2)};

const BASE_URL = '${config.baseUrl}';

export default function () {
  ${this.generateRequests(config.requests)}
  ${this.generateChecks(config.checks)}
  sleep(${config.sleep || 1});
}

${this.generateCustomFunctions(config.customFunctions)}
`;

    return script;
  }

  private generateRequests(requests: HTTPRequest[]): string {
    return requests.map(req => `
  let response${req.id} = http.${req.method.toLowerCase()}(
    \`${req.url}\`,
    ${req.body ? JSON.stringify(req.body) : 'null'},
    ${req.headers ? JSON.stringify(req.headers) : '{}'}
  );`).join('\n');
  }

  private generateChecks(checks: CheckConfig[]): string {
    return checks.map(check => `
  check(response${check.responseId}, {
    '${check.name}': (r) => ${check.condition}
  });`).join('\n');
  }
}
```

#### 1.3 Result Parser & Analyzer
```typescript
export class K6ResultParser {
  async parseJSONResult(jsonOutput: string): Promise<K6TestResult> {
    const data = JSON.parse(jsonOutput);

    return {
      summary: {
        totalRequests: data.metrics.http_reqs.values.count,
        failedRequests: data.metrics.http_req_failed.values.rate,
        avgResponseTime: data.metrics.http_req_duration.values.avg,
        p95ResponseTime: data.metrics.http_req_duration.values['p(95)'],
        p99ResponseTime: data.metrics.http_req_duration.values['p(99)']
      },
      thresholds: this.parseThresholds(data.thresholds),
      errors: data.errors || [],
      metrics: data.metrics
    };
  }

  private parseThresholds(thresholds: any): ThresholdResult[] {
    return Object.entries(thresholds).map(([name, threshold]: [string, any]) => ({
      name,
      ok: threshold.ok,
      value: threshold.value
    }));
  }
}
```

### Phase 2: Advanced Features

#### 2.1 OpenAPI/Postman Integration
```typescript
export class OpenAPISpecParser {
  async parseSpec(specPath: string): Promise<APITestConfig> {
    const spec = await this.loadSpec(specPath);

    return {
      baseUrl: spec.servers?.[0]?.url || 'http://localhost:3000',
      requests: this.extractRequests(spec),
      scenarios: this.generateScenarios(spec),
      thresholds: this.generateThresholds(spec)
    };
  }

  private extractRequests(spec: OpenAPISpec): HTTPRequest[] {
    const requests: HTTPRequest[] = [];

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods as any)) {
        requests.push({
          id: `${method}_${path.replace(/\//g, '_')}`,
          method: method.toUpperCase(),
          url: path,
          description: operation.summary || operation.description,
          parameters: operation.parameters,
          requestBody: operation.requestBody
        });
      }
    }

    return requests;
  }
}
```

#### 2.2 HAR File Processing
```typescript
export class HARProcessor {
  async processHAR(harPath: string): Promise<HTTPRecording> {
    const har = JSON.parse(await fs.readFile(harPath, 'utf8'));

    return {
      baseUrl: this.extractBaseUrl(har),
      requests: har.log.entries.map(entry => ({
        id: `req_${Date.now()}_${Math.random()}`,
        method: entry.request.method,
        url: entry.request.url,
        headers: this.extractHeaders(entry.request.headers),
        body: entry.request.postData?.text,
        expectedStatus: entry.response.status
      })),
      timings: har.log.entries.map(entry => entry.time)
    };
  }
}
```

#### 2.3 Browser Recording Integration
```typescript
export class BrowserRecorder {
  async recordSession(config: RecordingConfig): Promise<HTTPRecording> {
    // Launch browser with recording capabilities
    // Navigate to application
    // Record user interactions
    // Extract HTTP requests
    // Generate HAR-like structure
  }
}
```

### Phase 3: Cloud & Enterprise Features

#### 3.1 K6 Cloud Integration
```typescript
export class K6CloudDeployer {
  async deployToCloud(config: CloudConfig): Promise<CloudTestResult> {
    // Authenticate with K6 Cloud
    // Upload test script
    // Configure load zones and VUs
    // Start distributed test
    // Monitor progress
    // Retrieve results
  }

  async getCloudResults(testId: string): Promise<K6TestResult> {
    // Fetch results from K6 Cloud API
    // Parse cloud-specific metrics
    // Correlate with geographic data
  }
}
```

#### 3.2 Metrics Correlation
```typescript
export class MetricsCorrelator {
  async correlateWithApplicationMetrics(
    k6Results: K6TestResult,
    appMetrics: ApplicationMetrics
  ): Promise<CorrelatedAnalysis> {
    return {
      performance: this.analyzePerformanceCorrelation(k6Results, appMetrics),
      errors: this.analyzeErrorCorrelation(k6Results, appMetrics),
      bottlenecks: this.identifyBottlenecks(k6Results, appMetrics),
      recommendations: this.generateRecommendations(k6Results, appMetrics)
    };
  }
}
```

## 🎬 Testing Scenarios

### Scenario 1: API Load Testing
```javascript
// Generated K6 script for API testing
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(99)<1500'], // 99% of requests must complete below 1.5s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  let response = http.get(`${BASE_URL}/api/users`);
  check(response, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

### Scenario 2: Stress Testing dengan Spike
```javascript
// Spike testing scenario
export let options = {
  stages: [
    { duration: '10s', target: 10 },   // Normal load
    { duration: '10s', target: 1000 }, // Spike to 1000 users
    { duration: '10s', target: 10 },   // Back to normal
  ],
};

export default function () {
  let response = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
    userId: __VU, // Virtual user ID
    amount: Math.random() * 100
  }));
  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 2000ms': (r) => r.timings.duration < 2000
  });
}
```

### Scenario 3: WebSocket Real-time Testing
```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export let options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  const url = 'ws://localhost:3000/ws';
  const params = { tags: { my_tag: 'websocket_test' } };

  const res = ws.connect(url, params, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'updates' }));
    });

    socket.on('message', (data) => {
      check(data, {
        'received message': (d) => d && d.length > 0,
      });
    });

    socket.on('close', () => {
      // Connection closed
    });
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
```

### Scenario 4: Database Connection Pool Testing
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'], // Error rate < 10%
    http_req_duration: ['p(95)<1000'], // 95% of requests < 1s
  },
};

export default function () {
  // Test database-backed API endpoints
  let responses = http.batch([
    ['GET', `${BASE_URL}/api/users`],
    ['GET', `${BASE_URL}/api/products`],
    ['POST', `${BASE_URL}/api/search`, JSON.stringify({ query: 'test' })],
  ]);

  responses.forEach(response => {
    check(response, {
      'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    });
  });

  sleep(Math.random() * 2 + 1); // Random sleep 1-3 seconds
}
```

### Scenario 5: Microservices Integration Testing
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    user_journey: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 10 },
      ],
      tags: { test_type: 'user_journey' },
    },
    api_stress: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      startTime: '1m',
      tags: { test_type: 'api_stress' },
    },
  },
  thresholds: {
    'http_req_duration{test_type:user_journey}': ['p(99)<2000'],
    'http_req_duration{test_type:api_stress}': ['avg<1000'],
  },
};

export default function () {
  // Simulate user journey across microservices
  let authResponse = http.post(`${BASE_URL}/auth/login`, {
    email: `user${__VU}@test.com`,
    password: 'password123'
  });

  check(authResponse, {
    'login successful': (r) => r.status === 200,
    'has token': (r) => r.json('token') !== undefined,
  });

  let token = authResponse.json('token');

  // API calls with authentication
  let headers = { 'Authorization': `Bearer ${token}` };

  let profileResponse = http.get(`${BASE_URL}/api/profile`, { headers });
  check(profileResponse, { 'profile loaded': (r) => r.status === 200 });

  let ordersResponse = http.get(`${BASE_URL}/api/orders`, { headers });
  check(ordersResponse, { 'orders loaded': (r) => r.status === 200 });

  sleep(2);
}
```

## 🔗 Integration Points

### MCP Tool Integration
```typescript
// Integration with existing MCP tools
export class K6MCPIntegration {
  async integrateWithProjectAnalyzer(k6Results: K6TestResult): Promise<AnalysisResult> {
    // Send k6 results to project analyzer for correlation
    return await this.mcpClient.executeTool('project_analyzer/performance', {
      k6_metrics: k6Results,
      correlation_analysis: true
    });
  }

  async integrateWithMonitoring(k6Results: K6TestResult): Promise<void> {
    // Send metrics to monitoring system
    await this.mcpClient.executeTool('monitoring/send_metrics', {
      source: 'k6_load_test',
      metrics: k6Results.metrics
    });
  }
}
```

### CI/CD Pipeline Integration
```yaml
# .github/workflows/load-test.yml
name: Load Testing
on:
  push:
    branches: [main]
  pull_request:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run K6 Load Test
        run: |
          npx mcp-tool k6_load_test/execute \
            --target-url ${{ secrets.APP_URL }} \
            --duration 5m \
            --vus 50 \
            --output-format junit
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: k6-results/
```

### Development Workflow Integration
```typescript
// Integration with LSP and real-time analysis
export class K6DevelopmentIntegration {
  async onFileChange(filePath: string): Promise<void> {
    // Trigger relevant load tests when API changes
    if (this.isAPIFile(filePath)) {
      await this.runAPITests(filePath);
    }
  }

  async onDeployment(): Promise<void> {
    // Run smoke tests after deployment
    await this.runSmokeTests();
  }

  async onPerformanceRegression(metrics: PerformanceMetrics): Promise<void> {
    // Trigger detailed load testing on regression
    await this.runRegressionTests(metrics);
  }
}
```

## 📊 Success Metrics

### Performance Metrics
- **Test Execution Time**: < 30 seconds untuk basic tests
- **Script Generation**: < 5 seconds dari OpenAPI spec
- **Result Processing**: < 10 seconds untuk comprehensive analysis
- **Memory Usage**: < 100MB untuk local execution
- **Cloud Deployment**: < 60 seconds untuk test initialization

### Feature Completeness
- **Script Generation**: Support 5+ input formats (OpenAPI, Postman, HAR, manual)
- **Test Types**: 4 scenario types (load, stress, spike, volume)
- **Protocol Support**: HTTP, WebSocket, browser automation
- **Output Formats**: 3 formats (JSON, HTML, JUnit)
- **Cloud Integration**: Full K6 Cloud API support

### Integration Quality
- **MCP Compatibility**: 100% MCP protocol compliance
- **CI/CD Integration**: Support 3+ platforms (GitHub, GitLab, Jenkins)
- **Monitoring Correlation**: Integration dengan 2+ monitoring systems
- **Error Handling**: Graceful degradation dan detailed error reporting

## 🚀 Implementation Roadmap

### Phase 1: Core K6 Integration (4-6 weeks)
- [ ] Implement K6 binary management
- [ ] Create basic script generation (manual input)
- [ ] Add local test execution
- [ ] Implement result parsing
- [ ] Basic MCP tool integration

### Phase 2: Advanced Script Generation (4-6 weeks)
- [ ] OpenAPI/Postman spec parsing
- [ ] HAR file processing
- [ ] Browser recording integration
- [ ] Custom scenario templates
- [ ] Authentication handling

### Phase 3: Enterprise Features (4-6 weeks)
- [ ] K6 Cloud integration
- [ ] Distributed testing support
- [ ] Metrics correlation
- [ ] Advanced result analysis
- [ ] Performance regression detection

### Phase 4: Ecosystem Integration (2-4 weeks)
- [ ] CI/CD pipeline integration
- [ ] Monitoring system correlation
- [ ] Development workflow integration
- [ ] Documentation and examples
- [ ] Performance optimization

---

**K6 Load Testing Integration akan mentransformasi gibrun menjadi comprehensive performance testing platform dengan seamless development workflow integration!** 🚀</content>
<parameter name="filePath">doc/feat_k6_load_testing.md