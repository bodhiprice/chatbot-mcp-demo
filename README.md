# MCP Chatbot Demo

A demonstration of Model Context Protocol (MCP) architecture demonstrating how to build scalable, streaming AI applications on cloud infrastructure.

## What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io/introduction) is Anthropic's open standard that enables AI assistants to securely connect to external data sources and tools. This demo shows how to build a production-ready architecture that leverages MCP servers for enhanced AI capabilities.

### MCP Approach Benefits:

- **Reusability**: One MCP server can serve multiple AI applications
- **Dynamic Discovery**: Tools can be added/removed without changing your app
- **Standardization**: Common protocol across different AI providers
- **Isolation**: Tool logic is separate from your application logic
- **Scalability**: MCP servers can be deployed independently

## Architecture Overview

This project demonstrates a clean, scalable approach to building AI applications with real-time streaming responses:

- **Frontend**: Vite-based React application with Server-Sent Events (SSE) for real-time streaming
- **Backend**: Node.js service with choice of AWS App Runner or Fargate deployment
- **MCP Server**: Fastify-based service with choice of AWS App Runner or Fargate deployment
- **Infrastructure**: Single-file AWS CDK for complete infrastructure as code

## Key Architectural Decisions

### Real Streaming with SSE + ALB

Uses Server-Sent Events through Application Load Balancer. This enables true streaming responses for long-running AI operations.

### Container-First Approach

Backend services run in containers providing:

- Scale-to-zero cost optimization
- Consistent deployment environments
- Easy local development with Docker

### Infrastructure as Code

Single CDK file contains all AWS resources, making it easy to:

- Create/destroy complete environments
- Version control infrastructure changes
- Deploy identical environments for dev/test/prod

### Deployment Flexibility

Provides two deployment options for both backend and MCP server:

- **App Runner**: Simpler deployment, 2-minute timeout, cost-optimized
- **Fargate**: Enterprise-grade, configurable timeouts, full load balancer control

## Technology Stack

- **Frontend**: Vite, React, TypeScript
- **Backend**: Node.js, Fastify, Server-Sent Events
- **MCP Server**: Fastify, Node.js
- **Infrastructure**: AWS CDK, Fargate, ALB, CloudFront
- **AI Integration**: Claude Sonnet 4 via Anthropic API
- **External APIs**: National Weather Service API

## Getting Started

### Prerequisites

- Node.js 22+
- AWS CLI installed and configured with credentials
- Docker (for container deployment)
- Anthropic API key

### Local Development

```bash
# Install dependencies
npm install

# Start MCP server
cd mcp-server
npm run dev

# Start backend (in separate terminal)
cd backend
npm run dev

# Start frontend (in separate terminal)
cd frontend
npm run dev
```

### Deployment

**Infrastructure Deployment**

First, ensure AWS CLI is configured with appropriate credentials and permissions, and set required environment variables.

```bash
# Set required environment variable
export ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Install CDK dependencies
npm install

# Bootstrap CDK (first time only per AWS account/region)
npx cdk bootstrap

# Deploy all services with App Runner
npx cdk deploy --all --context environment=dev --context deploymentType=apprunner --require-approval never

# Deploy all services with Fargate
npx cdk deploy --all --context environment=dev --context deploymentType=fargate --require-approval never

# Deploy to production
export ANTHROPIC_API_KEY=your_production_key
npx cdk deploy --all --context environment=prod --context deploymentType=apprunner --require-approval never

# Destroy environment when no longer needed
npx cdk destroy --all --context environment=dev --context deploymentType=apprunner --require-approval never
```

**Individual Stack Deployment (Alternative)**

If needed, you can deploy services individually in dependency order:

```bash
# Deploy in order: MCP → Backend → Frontend
npx cdk deploy ChatbotMcp-dev --context environment=dev --context deploymentType=apprunner --require-approval never
npx cdk deploy ChatbotBackend-dev --context environment=dev --context deploymentType=apprunner --require-approval never
npx cdk deploy ChatbotFrontend-dev --context environment=dev --require-approval never
```

**Deployment Options**

Both the backend and MCP server offer two deployment options:

- **App Runner** (`ChatbotBackend-{env}`, `ChatbotMcp-{env}`): Simpler, cheaper, 2-minute timeout
  - Best for: Most business use cases, cost optimization, simple deployment
  - Limitations: 2-minute request timeout, less configuration control

- **Fargate** (`ChatbotBackend-{env}`, `ChatbotMcp-{env}`): More robust, configurable, no timeout limits
  - Best for: Enterprise use cases, long-running operations, full control
  - Benefits: Configurable timeouts, auto-scaling, load balancer integration

Choose App Runner for simplicity and cost, Fargate for enterprise robustness.

**Environment Management**
Each environment gets isolated AWS resources with the naming pattern `ServiceName-{environment}`. This allows independent deployment and testing without conflicts.

## Environment Management

The project supports multiple environments with manual promotion control:

- **dev**: Automatic deployment on commits to `dev` branch
- **testing**: Manual promotion from dev
- **prod**: Manual promotion from testing

Each environment is completely isolated with its own AWS resources.

### Demo Architecture Decision

This demo implements a **thin pass-through architecture** where the backend acts as an authentication and API key proxy. This pattern:

- Hides the Anthropic API key from client-side code
- Enables future authentication without fundamental architecture changes
- Demonstrates real-world SSE streaming patterns

## Cost Optimization

- Fargate and App Runner scale to zero when not in use
- CloudFront caches static frontend assets
- MCP server only runs when processing requests
- No always-on resources except S3/CloudFront (minimal cost)

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Client [Client]
        UI[React Frontend<br/>Vite + SSE]
    end

    subgraph AWS [AWS Infrastructure]
        subgraph CDN [CDN & Storage]
            CF[CloudFront]
            S3[S3 Bucket]
        end

        subgraph Compute [Compute Layer]
            ALB1[Backend ALB<br/>Load Balancer]
            FARGATE1[Backend Fargate<br/>Node.js Service]
            ALB2[MCP ALB<br/>Load Balancer]
            FARGATE2[MCP Fargate<br/>Weather Service]
        end
    end

    subgraph External [External Services]
        CLAUDE[Claude Sonnet 4<br/>API]
        WEATHER[National Weather<br/>Service API]
    end

    UI -.->|Static Assets| CF
    CF --> S3
    UI -->|SSE Connection| ALB1
    ALB1 --> FARGATE1
    FARGATE1 -->|Streaming Response| ALB1
    FARGATE1 -->|AI Requests| CLAUDE
    CLAUDE -->|MCP Calls| ALB2
    ALB2 --> FARGATE2
    FARGATE2 --> WEATHER

    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef external fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff
    classDef client fill:#50C878,stroke:#2E7D32,stroke-width:2px,color:#fff
    classDef container fill:#E6F3FF,stroke:#87CEEB,stroke-width:2px,color:#000

    class CF,S3,ALB1,FARGATE1,ALB2,FARGATE2 aws
    class CLAUDE,WEATHER external
    class UI client
    class Client,AWS,CDN,Compute,External container
```

## License

MIT
