import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface ChatbotStackProps extends StackProps {
  environment: string;
}

class SharedStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);
    
    // ECR repositories and other shared resources
  }
}

class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);
    
    // S3 bucket and CloudFront distribution
  }
}

class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);
    
    // ALB, Fargate, ECS Cluster
  }
}

class McpServerStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);
    
    // App Runner service
  }
}

const app = new App();
const environment = app.node.tryGetContext('environment') || 'dev';
const env = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION 
};

const stackProps: ChatbotStackProps = { env, environment };

new SharedStack(app, `ChatbotShared-${environment}`, stackProps);
new FrontendStack(app, `ChatbotFrontend-${environment}`, stackProps);
new BackendStack(app, `ChatbotBackend-${environment}`, stackProps);
new McpServerStack(app, `ChatbotMcp-${environment}`, stackProps);