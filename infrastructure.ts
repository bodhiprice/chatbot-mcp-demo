import { App, Stack, StackProps, CfnOutput, Duration, Fn } from 'aws-cdk-lib';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface ChatbotStackProps extends StackProps {
  environment: string;
}

class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    // S3 bucket and CloudFront distribution
  }
}

class BackendAppRunnerStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const dockerAsset = new assets.DockerImageAsset(this, 'BackendImage', {
      directory: './backend',
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

    const appRunnerService = new apprunner.CfnService(this, 'BackendService', {
      serviceName: `chatbot-backend-apprunner-${props.environment}`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerRole.roleArn
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageRepositoryType: 'ECR',
          imageIdentifier: dockerAsset.imageUri,
          imageConfiguration: {
            port: '3001',
            runtimeEnvironmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'PORT', value: '3001' },
              { name: 'ANTHROPIC_API_KEY', value: process.env.ANTHROPIC_API_KEY || '' },
              { name: 'MCP_SERVER_URL', value: Fn.importValue(`ChatbotMcpServiceUrl-${props.environment}`) }
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

    new CfnOutput(this, 'BackendServiceUrl', {
      value: `https://${appRunnerService.attrServiceUrl}`,
      description: 'Backend Service URL (App Runner)',
      exportName: `ChatbotBackendServiceUrl-${props.environment}`
    });

  }
}

class BackendFargateStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const cluster = new ecs.Cluster(this, 'BackendCluster', {
      vpc,
      clusterName: `backend-cluster-${props.environment}`
    });

    const logGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: `/ecs/backend-server-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK
    });

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'BackendFargateService', {
      cluster,
      serviceName: `backend-server-${props.environment}`,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('./backend', {
          platform: assets.Platform.LINUX_AMD64
        }),
        containerPort: 3001,
        environment: {
          NODE_ENV: 'production',
          PORT: '3001',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          MCP_SERVER_URL: process.env.MCP_SERVER_URL || ''
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'backend-server',
          logGroup
        })
      },
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST
    });

    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3
    });

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleOutCooldown: Duration.minutes(2),
      scaleInCooldown: Duration.minutes(5)
    });

    new CfnOutput(this, 'BackendServiceUrl', {
      value: `http://${fargateService.loadBalancer.loadBalancerDnsName}`,
      description: 'Backend Service URL (Fargate)',
      exportName: `ChatbotBackendServiceUrl-${props.environment}`
    });

  }
}

class McpAppRunnerStack extends Stack {
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
      serviceName: `weather-mcp-apprunner-${props.environment}`,
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
      description: 'Weather MCP Server URL (App Runner)',
      exportName: `ChatbotMcpServiceUrl-${props.environment}`
    });

  }
}

class McpFargateStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const cluster = new ecs.Cluster(this, 'McpCluster', {
      vpc,
      clusterName: `mcp-cluster-${props.environment}`
    });

    const logGroup = new logs.LogGroup(this, 'McpLogGroup', {
      logGroupName: `/ecs/mcp-server-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK
    });

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'McpFargateService', {
      cluster,
      serviceName: `mcp-server-${props.environment}`,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('./mcp-server', {
          platform: assets.Platform.LINUX_AMD64
        }),
        containerPort: 3000,
        environment: {
          NODE_ENV: 'production',
          PORT: '3000'
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'mcp-server',
          logGroup
        })
      },
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST
    });

    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3
    });

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleOutCooldown: Duration.minutes(2),
      scaleInCooldown: Duration.minutes(5)
    });

    new CfnOutput(this, 'WeatherMcpServiceUrl', {
      value: `http://${fargateService.loadBalancer.loadBalancerDnsName}`,
      description: 'Weather MCP Server URL (Fargate)'
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

new FrontendStack(app, `ChatbotFrontend-${environment}`, stackProps);
new BackendAppRunnerStack(app, `ChatbotBackendAppRunner-${environment}`, stackProps);
new BackendFargateStack(app, `ChatbotBackendFargate-${environment}`, stackProps);
new McpAppRunnerStack(app, `ChatbotMcpAppRunner-${environment}`, stackProps);
new McpFargateStack(app, `ChatbotMcpFargate-${environment}`, stackProps);
