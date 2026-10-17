# Code Review Orchestration

Patterns for thorough, fast, and actionable code reviews.

## PR Review

### Pattern: Multi-Dimensional Analysis

```
Fan-Out (parallel):
├── Agent 1: Code Quality
│   ├── Style and conventions
│   ├── Code complexity
│   ├── DRY violations
│   └── Naming clarity
│
├── Agent 2: Logic Correctness
│   ├── Algorithm accuracy
│   ├── Edge case handling
│   ├── Error scenarios
│   └── Race conditions
│
├── Agent 3: Security
│   ├── Input validation
│   ├── Authentication checks
│   ├── SQL injection
│   └── XSS vulnerabilities
│
└── Agent 4: Performance
    ├── Time complexity
    ├── Memory usage
    ├── Database queries
    └── Caching opportunities

Reduce:
→ Prioritize by severity
→ Deduplicate overlapping findings
→ Create actionable feedback
```

## Security Audit

### Pattern: OWASP-Parallel

```
Fan-Out (vulnerability categories):
├── Injection (SQL, NoSQL, LDAP, OS)
├── Broken Authentication
├── Sensitive Data Exposure
├── XML External Entities
├── Broken Access Control
├── Security Misconfiguration
├── Cross-Site Scripting
├── Insecure Deserialization
├── Known Vulnerabilities
└── Insufficient Logging

Reduce:
→ Risk score by CVSS
→ Exploitation complexity
→ Remediation priority
```

### Attack Surface Mapping

```
1. Identify all entry points
├── API endpoints
├── File uploads
├── User inputs
└── External integrations

2. Trace data flows
├── Input → processing → storage
└── Identify trust boundaries

3. Assess each surface
├── Authentication requirements
├── Authorization checks
├── Input validation
└── Output encoding
```

## Performance Review

### Pattern: Layer-by-Layer Analysis

```
Fan-Out (architectural layers):
├── Agent 1: Database Layer
│   ├── Query optimization
│   ├── Index usage
│   ├── N+1 problems
│   └── Connection pooling
│
├── Agent 2: API Layer
│   ├── Response times
│   ├── Payload sizes
│   ├── Caching headers
│   └── Compression
│
├── Agent 3: Frontend Layer
│   ├── Bundle size
│   ├── Render performance
│   ├── Network requests
│   └── Image optimization
│
└── Agent 4: Infrastructure
    ├── Resource allocation
    ├── Scaling configuration
    └── CDN usage

Reduce:
→ Identify bottlenecks
→ Measure impact potential
→ Prioritize by ROI
```

### Hot Path Analysis

```
1. Identify critical paths
├── User login flow
├── Checkout process
└── Search functionality

2. Profile each step
├── Time spent
├── Resources used
└── External calls

3. Optimize bottlenecks
├── Caching
├── Batching
├── Async processing
└── Algorithm improvements
```

## Architecture Review

### Pattern: Multi-Perspective Assessment

```
Fan-Out (quality attributes):
├── Scalability
│   ├── Horizontal scaling capability
│   ├── Database bottlenecks
│   └── Stateless design
│
├── Maintainability
│   ├── Code organization
│   ├── Coupling/cohesion
│   └── Documentation quality
│
├── Security Design
│   ├── Defense in depth
│   ├── Principle of least privilege
│   └── Data protection
│
├── Cost Efficiency
│   ├── Resource utilization
│   ├── Scaling costs
│   └── Optimization opportunities
│
└── Developer Experience
    ├── Local development setup
    ├── Testing ease
    └── Debugging capability

Reduce:
→ ADR (Architecture Decision Record) format
→ Trade-off analysis
→ Recommendations with rationale
```

## Pre-Merge Validation

### Pattern: Parallel Checks

```
Fan-Out (validation):
├── Test Suite
│   ├── Unit tests
│   ├── Integration tests
│   └── E2E tests
│
├── Code Review
│   ├── Approval status
│   └── Comment resolution
│
├── Conflict Detection
│   ├── Merge conflicts
│   └── Semantic conflicts
│
└── Documentation
    ├── Changelog updated
    ├── API docs current
    └── README updated

Gate Decision:
→ All green = Auto-merge ready
→ Yellow flags = Manual review needed
→ Red flags = Block merge
```

## Review Output Format

### Standard Template

```markdown
## Review Summary

**Overall**: [APPROVE | REQUEST CHANGES | COMMENT]
**Risk Level**: [Low | Medium | High | Critical]

### Blocking Issues (must fix)
1. [Issue with file:line reference]
   - Problem: [description]
   - Fix: [specific suggestion]

### Non-Blocking Issues (should fix)
1. [Issue with file:line reference]
   - Suggestion: [description]

### Optional Improvements
1. [Enhancement idea]

### Positive Notes
- [What was done well]
```

### Severity Guidelines

| Severity | Criteria | Action |
|----------|----------|--------|
| **Critical** | Security vulnerability, data loss risk | Block merge |
| **High** | Bugs, broken functionality | Request changes |
| **Medium** | Performance issues, maintainability | Should fix |
| **Low** | Style, minor improvements | Consider |
| **Info** | Observations, knowledge sharing | No action needed |
