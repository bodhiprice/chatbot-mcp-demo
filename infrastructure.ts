import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    const dockerAsset = new assets.DockerImageAsset(this, 'WeatherMcpImage', {
      directory: './mcp-server',
      platform: assets.Platform.LINUX_AMD64
    });

    const appRunnerRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess')
      ]
    });

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com')
    });

    const appRunnerService = new apprunner.CfnService(this, 'WeatherMcpService', {
      serviceName: `weather-mcp-${props.environment}`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerRole.roleArn
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageRepositoryType: 'ECR',
          imageIdentifier: dockerAsset.imageUri,
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'PORT', value: '3000' }
            ]
          }
        }
      },
      instanceConfiguration: {
        cpu: '512',
        memory: '1024',
        instanceRoleArn: instanceRole.roleArn
      }
    });

    new CfnOutput(this, 'WeatherMcpServiceUrl', {
      value: `https://${appRunnerService.attrServiceUrl}`,
      description: 'Weather MCP Server URL'
    });

    new CfnOutput(this, 'WeatherMcpHealthCheck', {
      value: `https://${appRunnerService.attrServiceUrl}/health`,
      description: 'Weather MCP Server Health Check'
    });
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