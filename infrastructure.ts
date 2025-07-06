import { App, Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsBuild } from 'deploy-time-build';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

interface ChatbotStackProps extends StackProps {
  environment: string;
}

interface FrontendStackProps extends ChatbotStackProps {
  backendUrl: string;
}

class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `chatbot-frontend-${props.environment}-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        '/assets/*': {
          origin: new origins.S3StaticWebsiteOrigin(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.js': {
          origin: new origins.S3StaticWebsiteOrigin(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.css': {
          origin: new origins.S3StaticWebsiteOrigin(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    new NodejsBuild(this, 'FrontendBuild', {
      assets: [
        {
          path: './frontend',
          exclude: ['dist', 'node_modules'],
        },
      ],
      destinationBucket: bucket,
      distribution,
      outputSourceDirectory: 'dist',
      buildCommands: ['npm ci', 'npm run build'],
      buildEnvironment: {
        VITE_BACKEND_URL: props.backendUrl,
      },
    });

    new CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend URL (CloudFront)',
      exportName: `ChatbotFrontendUrl-${props.environment}`,
    });
  }
}

class BackendAppRunnerStack extends Stack {
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const mcpUrl = ssm.StringParameter.valueForStringParameter(
      this,
      `/chatbot/${props.environment}/mcp-url`
    );

    const dockerAsset = new assets.DockerImageAsset(this, 'BackendImage', {
      directory: './backend',
      platform: assets.Platform.LINUX_AMD64,
    });

    const appRunnerRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
      ],
    });

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    const appRunnerService = new apprunner.CfnService(this, 'BackendService', {
      serviceName: `chatbot-backend-apprunner-${props.environment}`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerRole.roleArn,
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
              { name: 'MCP_SERVER_URL', value: mcpUrl },
            ],
          },
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      instanceConfiguration: {
        cpu: '512',
        memory: '1024',
        instanceRoleArn: instanceRole.roleArn,
      },
    });

    this.serviceUrl = `https://${appRunnerService.attrServiceUrl}`;

    new ssm.StringParameter(this, 'BackendUrlParameter', {
      parameterName: `/chatbot/${props.environment}/backend-url`,
      stringValue: this.serviceUrl,
      description: 'Backend Service URL for frontend configuration',
    });

    new CfnOutput(this, 'BackendServiceUrl', {
      value: this.serviceUrl,
      description: 'Backend Service URL (App Runner)',
      exportName: `ChatbotBackendServiceUrl-${props.environment}`,
    });
  }
}

class BackendFargateStack extends Stack {
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const mcpUrl = ssm.StringParameter.valueForStringParameter(
      this,
      `/chatbot/${props.environment}/mcp-url`
    );

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const cluster = new ecs.Cluster(this, 'BackendCluster', {
      vpc,
      clusterName: `backend-cluster-${props.environment}`,
    });

    const logGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: `/ecs/backend-server-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'BackendFargateService', {
      cluster,
      serviceName: `backend-server-${props.environment}`,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('./backend', {
          platform: assets.Platform.LINUX_AMD64,
        }),
        containerPort: 3001,
        environment: {
          NODE_ENV: 'production',
          PORT: '3001',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          MCP_SERVER_URL: mcpUrl,
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'backend-server',
          logGroup,
        }),
      },
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    });

    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleOutCooldown: Duration.minutes(2),
      scaleInCooldown: Duration.minutes(5),
    });

    this.serviceUrl = `http://${fargateService.loadBalancer.loadBalancerDnsName}`;

    new ssm.StringParameter(this, 'BackendUrlParameter', {
      parameterName: `/chatbot/${props.environment}/backend-url`,
      stringValue: this.serviceUrl,
      description: 'Backend Service URL for frontend configuration',
    });

    new CfnOutput(this, 'BackendServiceUrl', {
      value: this.serviceUrl,
      description: 'Backend Service URL (Fargate)',
      exportName: `ChatbotBackendServiceUrl-${props.environment}`,
    });
  }
}

class McpAppRunnerStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const dockerAsset = new assets.DockerImageAsset(this, 'WeatherMcpImage', {
      directory: './mcp-server',
      platform: assets.Platform.LINUX_AMD64,
    });

    const appRunnerRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
      ],
    });

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    const appRunnerService = new apprunner.CfnService(this, 'WeatherMcpService', {
      serviceName: `weather-mcp-apprunner-${props.environment}`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: appRunnerRole.roleArn,
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageRepositoryType: 'ECR',
          imageIdentifier: dockerAsset.imageUri,
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'PORT', value: '3000' },
            ],
          },
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      instanceConfiguration: {
        cpu: '512',
        memory: '1024',
        instanceRoleArn: instanceRole.roleArn,
      },
    });

    const mcpUrl = `https://${appRunnerService.attrServiceUrl}`;

    new ssm.StringParameter(this, 'McpUrlParameter', {
      parameterName: `/chatbot/${props.environment}/mcp-url`,
      stringValue: mcpUrl,
      description: 'MCP Server URL for backend configuration',
    });

    new CfnOutput(this, 'WeatherMcpServiceUrl', {
      value: mcpUrl,
      description: 'Weather MCP Server URL (App Runner)',
      exportName: `ChatbotMcpServiceUrl-${props.environment}`,
    });
  }
}

class McpFargateStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const cluster = new ecs.Cluster(this, 'McpCluster', {
      vpc,
      clusterName: `mcp-cluster-${props.environment}`,
    });

    const logGroup = new logs.LogGroup(this, 'McpLogGroup', {
      logGroupName: `/ecs/mcp-server-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'McpFargateService', {
      cluster,
      serviceName: `mcp-server-${props.environment}`,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('./mcp-server', {
          platform: assets.Platform.LINUX_AMD64,
        }),
        containerPort: 3000,
        environment: {
          NODE_ENV: 'production',
          PORT: '3000',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'mcp-server',
          logGroup,
        }),
      },
      memoryLimitMiB: 1024,
      cpu: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    });

    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleOutCooldown: Duration.minutes(2),
      scaleInCooldown: Duration.minutes(5),
    });

    const mcpUrl = `http://${fargateService.loadBalancer.loadBalancerDnsName}`;

    new ssm.StringParameter(this, 'McpUrlParameter', {
      parameterName: `/chatbot/${props.environment}/mcp-url`,
      stringValue: mcpUrl,
      description: 'MCP Server URL for backend configuration',
    });

    new CfnOutput(this, 'WeatherMcpServiceUrl', {
      value: mcpUrl,
      description: 'Weather MCP Server URL (Fargate)',
      exportName: `ChatbotMcpServiceUrl-${props.environment}`,
    });
  }
}

const app = new App();
const environment = app.node.tryGetContext('environment') || 'dev';
const deploymentType = app.node.tryGetContext('deploymentType') || 'apprunner';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const stackProps: ChatbotStackProps = { env, environment };

if (deploymentType === 'apprunner') {
  const mcpStack = new McpAppRunnerStack(app, `ChatbotMcp-${environment}`, stackProps);
  const backendStack = new BackendAppRunnerStack(app, `ChatbotBackend-${environment}`, stackProps);
  const frontendStack = new FrontendStack(app, `ChatbotFrontend-${environment}`, {
    ...stackProps,
    backendUrl: backendStack.serviceUrl,
  });
  
  frontendStack.addDependency(backendStack);
  backendStack.addDependency(mcpStack);
} else if (deploymentType === 'fargate') {
  const mcpStack = new McpFargateStack(app, `ChatbotMcp-${environment}`, stackProps);
  const backendStack = new BackendFargateStack(app, `ChatbotBackend-${environment}`, stackProps);
  const frontendStack = new FrontendStack(app, `ChatbotFrontend-${environment}`, {
    ...stackProps,
    backendUrl: backendStack.serviceUrl,
  });
  
  frontendStack.addDependency(backendStack);
  backendStack.addDependency(mcpStack);
} else {
  throw new Error(`Invalid deploymentType: ${deploymentType}. Must be 'apprunner' or 'fargate'`);
}
