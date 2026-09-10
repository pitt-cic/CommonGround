import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

const BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-6';

interface ComponentBoilerplateProps extends cdk.StackProps {
    readonly stackName: string;
    readonly stageName: string;
    readonly developerName?: string;
    readonly tableRemovalPolicy: cdk.RemovalPolicy;
    readonly allowedOrigins?: string[];
}

export class InfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: ComponentBoilerplateProps) {
        super(scope, id, props);

        const CommonGroundBucket = new s3.Bucket(this, `CommonGround-bucket-${props?.stackName}`, {
            bucketName: `commonground-bucket-${props?.stackName}`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: props?.tableRemovalPolicy,
            autoDeleteObjects: props?.tableRemovalPolicy === cdk.RemovalPolicy.DESTROY,
            cors: [{
                allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
                allowedOrigins: [
                    'http://localhost:5173',
                    'http://localhost:5176',
                    'http://localhost:3000',
                    'https://*.amplifyapp.com',
                    ...(props?.allowedOrigins ?? []),
                ],
                allowedHeaders: ['*'],
            }],
        });

        const jobsTable = new dynamodb.Table(this, `CommonGroundJobs-${props?.stackName}`, {
            tableName: `CommonGroundJobs-${props?.stackName}`,
            partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props?.tableRemovalPolicy,
            timeToLiveAttribute: 'ttl',
        });

        // Cognito User Pool for authentication (admin-only user creation)
        const userPool = new cognito.UserPool(this, `UserPool-${props?.stackName}`, {
            userPoolName: `user-pool-${props?.stackName}`,
            selfSignUpEnabled: false,
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            mfa: cognito.Mfa.OFF,
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: props?.tableRemovalPolicy ?? cdk.RemovalPolicy.RETAIN,
        });

        // User Pool Client
        const userPoolClient = new cognito.UserPoolClient(this, `UserPoolClient-${props?.stackName}`, {
            userPool,
            userPoolClientName: `userpool-app-client-${props?.stackName}`,
            authFlows: {
                userSrp: true,
                userPassword: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
                callbackUrls: ['http://localhost:5173/', 'http://localhost:3000/'],
                logoutUrls: ['http://localhost:5173/', 'http://localhost:3000/'],
            },
            preventUserExistenceErrors: true,
        });

        const api = new apigateway.RestApi(this, `CommonGroundApi-${props?.stackName}`, {
            restApiName: `CommonGround-api-${props?.stackName}`,
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization', 'X-Viewport-Size'],
            },
            deployOptions: {
                throttlingRateLimit: 10,
                throttlingBurstLimit: 20,
            },
        });

        // Cognito authorizer for protected endpoints
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, `ApiAuthorizer-${props?.stackName}`, {
            cognitoUserPools: [userPool],
            authorizerName: `cognito-authorizer-${props?.stackName}`,
            identitySource: 'method.request.header.Authorization',
        });

        // Add CORS headers to error responses (401, 403, 500, etc.)
        api.addGatewayResponse('Unauthorized', {
            type: apigateway.ResponseType.UNAUTHORIZED,
            statusCode: '401',
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            },
        });

        api.addGatewayResponse('AccessDenied', {
            type: apigateway.ResponseType.ACCESS_DENIED,
            statusCode: '403',
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            },
        });

        api.addGatewayResponse('Default4XX', {
            type: apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            },
        });

        api.addGatewayResponse('Default5XX', {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            },
        });

        // Shared layer: shared Python utilities (response helpers, pricing, etc.) used across all Lambdas
        const sharedLayer = new lambda.LayerVersion(this, `SharedLayer-${props?.stackName}`, {
            layerVersionName: `SharedLayer-${props?.stackName}`,
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'mkdir -p /asset-output/python && cp -r shared /asset-output/python/',
                        ],
                    },
                }
            ),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
            compatibleArchitectures: [lambda.Architecture.ARM_64],
        });

        // SQS Dead Letter Queues
        const summarizeDlq = new sqs.Queue(this, `SummarizeDLQ-${props?.stackName}`, {
            queueName: `SummarizeDLQ-${props?.stackName}`,
            retentionPeriod: cdk.Duration.days(14),
        });

        const infographicDlq = new sqs.Queue(this, `InfographicDLQ-${props?.stackName}`, {
            queueName: `InfographicDLQ-${props?.stackName}`,
            retentionPeriod: cdk.Duration.days(14),
        });

        // SQS Main Queues
        const summarizeQueue = new sqs.Queue(this, `SummarizeQueue-${props?.stackName}`, {
            queueName: `SummarizeQueue-${props?.stackName}`,
            visibilityTimeout: cdk.Duration.seconds(930), // 15min Lambda timeout + 30s buffer
            receiveMessageWaitTime: cdk.Duration.seconds(20),
            retentionPeriod: cdk.Duration.days(4),
            deadLetterQueue: {
                queue: summarizeDlq,
                maxReceiveCount: 3,
            },
        });

        const infographicQueue = new sqs.Queue(this, `InfographicQueue-${props?.stackName}`, {
            queueName: `InfographicQueue-${props?.stackName}`,
            visibilityTimeout: cdk.Duration.seconds(150), // 2min Lambda timeout + 30s buffer
            receiveMessageWaitTime: cdk.Duration.seconds(20),
            retentionPeriod: cdk.Duration.days(4),
            deadLetterQueue: {
                queue: infographicDlq,
                maxReceiveCount: 3,
            },
        });

        //lambda for upload
        const uploadFn = new lambda.Function(this, `UploadFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/upload'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `UploadFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(30),
            layers: [sharedLayer],
            environment: {
                BUCKET_NAME: CommonGroundBucket.bucketName
            },
        });

        // Summarize enqueue Lambda - fast API handler, sends to SQS
        const summarizeEnqueueFn = new lambda.Function(this, `SummarizeEnqueueFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/summarize_enqueue'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `SummarizeEnqueueFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(30),
            layers: [sharedLayer],
            environment: {
                SUMMARIZE_QUEUE_URL: summarizeQueue.queueUrl,
                BUCKET_NAME: CommonGroundBucket.bucketName,
                TABLE_NAME: jobsTable.tableName,
                BEDROCK_MODEL_ID: BEDROCK_MODEL_ID,
            },
        });

        // Summarize worker Lambda - SQS-triggered, processes jobs (15 min)
        const summarizeWorkerFn = new lambda.Function(this, `SummarizeWorkerFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r summarize_worker/requirements.txt -t /asset-output && cp -r summarize_worker/. /asset-output && cp -r shared /asset-output/shared',
                        ],
                    },
                }
            ),
            functionName: `SummarizeWorkerFn-${props?.stackName}`,
            timeout: cdk.Duration.minutes(15),
            memorySize: 512,
            environment: {
                BUCKET_NAME: CommonGroundBucket.bucketName,
                BEDROCK_MODEL_ID: BEDROCK_MODEL_ID,
                TABLE_NAME: jobsTable.tableName,
                INFOGRAPHIC_QUEUE_URL: infographicQueue.queueUrl,
            },
        });

        //lambda for job status
        const jobStatusFn = new lambda.Function(this, `JobStatusFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/job_status'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `JobStatusFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(10),
            environment: {
                TABLE_NAME: jobsTable.tableName,
                BUCKET_NAME: CommonGroundBucket.bucketName,
            },
        });


        //lambda for save edit - allows users to save manually edited output
        const saveEditFn = new lambda.Function(this, `SaveEditFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/save_edit'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `SaveEditFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(10),
            memorySize: 128,
            layers: [sharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
            },
        });

        // Shared layer: render.py, schemas.py, templates/ used by generate/edit/polish infographic fns
        const infographicSharedLayer = new lambda.LayerVersion(this, `InfographicSharedLayer-${props?.stackName}`, {
            layerVersionName: `InfographicSharedLayer-${props?.stackName}`,
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'mkdir -p /asset-output/python && ' +
                            'cp infographic_worker/render.py infographic_worker/schemas.py /asset-output/python/ && ' +
                            'cp -r infographic_worker/templates /asset-output/python/',
                        ],
                    },
                }
            ),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
            compatibleArchitectures: [lambda.Architecture.ARM_64],
        });

        // Infographic worker Lambda - SQS-triggered, processes jobs (2 min)
        const infographicWorkerFn = new lambda.Function(this, `InfographicWorkerFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r infographic_worker/requirements.txt -t /asset-output && ' +
                            'cp infographic_worker/handler.py /asset-output/ && ' +
                            'cp -r shared /asset-output/shared',
                        ],
                    },
                }
            ),
            functionName: `InfographicWorkerFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(120),
            memorySize: 256,
            layers: [infographicSharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
                BUCKET_NAME: CommonGroundBucket.bucketName,
                BEDROCK_MODEL_ID: BEDROCK_MODEL_ID,
            },
        });

        // Infographic enqueue Lambda - fast API handler, sends to SQS
        const infographicEnqueueFn = new lambda.Function(this, `InfographicEnqueueFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/infographic_enqueue'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `InfographicEnqueueFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(10),
            layers: [sharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
                INFOGRAPHIC_QUEUE_URL: infographicQueue.queueUrl,
            },
        });

        // Lambda for infographic content editing (human-in-the-loop)
        const editInfographicFn = new lambda.Function(this, `EditInfographicFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r edit_infographic/requirements.txt -t /asset-output && ' +
                            'cp -r edit_infographic/. /asset-output',
                        ],
                    },
                }
            ),
            functionName: `EditInfographicFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            layers: [infographicSharedLayer, sharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
                BUCKET_NAME: CommonGroundBucket.bucketName,
            },
        });

        // Polish enqueue Lambda - validates request, sends to InfographicQueue
        const polishEnqueueFn = new lambda.Function(this, `PolishEnqueueFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/polish_enqueue'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `PolishEnqueueFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(10),
            layers: [sharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
                INFOGRAPHIC_QUEUE_URL: infographicQueue.queueUrl,
            },
        });

        // Refine enqueue Lambda - validates request, sends to SummarizeQueue
        const refineEnqueueFn = new lambda.Function(this, `RefineEnqueueFn-${props?.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../../backend/lambda/refine_enqueue'),
                {
                    bundling: {
                        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                        platform: 'linux/arm64',
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -r . /asset-output',
                        ],
                    },
                }
            ),
            functionName: `RefineEnqueueFn-${props?.stackName}`,
            timeout: cdk.Duration.seconds(10),
            layers: [sharedLayer],
            environment: {
                TABLE_NAME: jobsTable.tableName,
                SUMMARIZE_QUEUE_URL: summarizeQueue.queueUrl,
            },
        });

        // SQS event source mappings for worker Lambdas
        summarizeWorkerFn.addEventSource(new lambdaEventSources.SqsEventSource(summarizeQueue, {
            batchSize: 1,
            reportBatchItemFailures: true,
            maxConcurrency: 30,
            maxBatchingWindow: cdk.Duration.seconds(0),
        }));

        infographicWorkerFn.addEventSource(new lambdaEventSources.SqsEventSource(infographicQueue, {
            batchSize: 1,
            reportBatchItemFailures: true,
            maxConcurrency: 50,
            maxBatchingWindow: cdk.Duration.seconds(0),
        }));

        //grant permissions
        CommonGroundBucket.grantReadWrite(uploadFn);
        CommonGroundBucket.grantReadWrite(summarizeWorkerFn);
        CommonGroundBucket.grantRead(jobStatusFn);
        CommonGroundBucket.grantReadWrite(infographicWorkerFn);
        CommonGroundBucket.grantReadWrite(editInfographicFn);

        // SQS permissions: enqueue functions send, workers receive (granted via event source)
        summarizeQueue.grantSendMessages(summarizeEnqueueFn);
        summarizeQueue.grantSendMessages(refineEnqueueFn);
        infographicQueue.grantSendMessages(infographicEnqueueFn);
        infographicQueue.grantSendMessages(polishEnqueueFn);
        infographicQueue.grantSendMessages(summarizeWorkerFn); // worker triggers infographic after summary

        jobsTable.grantReadWriteData(summarizeEnqueueFn);
        jobsTable.grantReadWriteData(summarizeWorkerFn);
        jobsTable.grantReadWriteData(jobStatusFn);
        jobsTable.grantReadWriteData(refineEnqueueFn);
        jobsTable.grantReadWriteData(saveEditFn);
        jobsTable.grantReadWriteData(infographicWorkerFn);
        jobsTable.grantReadWriteData(infographicEnqueueFn);
        jobsTable.grantReadWriteData(polishEnqueueFn);
        jobsTable.grantReadWriteData(editInfographicFn);

        const bedrockPolicy = new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            resources: [
                // Claude Sonnet 4.6
                `arn:aws:bedrock:*:${this.account}:inference-profile/us.anthropic.claude-sonnet-4-6`,
                'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6',
            ],
        });

        summarizeWorkerFn.addToRolePolicy(bedrockPolicy);
        infographicWorkerFn.addToRolePolicy(bedrockPolicy);

        const papersResource = api.root.addResource('papers');

        const uploadResource = papersResource.addResource('upload');
        uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        const summarizeResource = papersResource.addResource('summarize');
        summarizeResource.addMethod('POST', new apigateway.LambdaIntegration(summarizeEnqueueFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add GET endpoint for job status: /papers/summarize/{job_id}
        const jobIdResource = summarizeResource.addResource('{job_id}');
        jobIdResource.addMethod('GET', new apigateway.LambdaIntegration(jobStatusFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add POST endpoint for refine: /papers/summarize/{job_id}/refine
        const refineResource = jobIdResource.addResource('refine');
        refineResource.addMethod('POST', new apigateway.LambdaIntegration(refineEnqueueFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add PUT endpoint for save edit: /papers/summarize/{job_id}/edit
        const editResource = jobIdResource.addResource('edit');
        editResource.addMethod('PUT', new apigateway.LambdaIntegration(saveEditFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add POST endpoint for infographic: /papers/summarize/{job_id}/infographic
        // Enqueues to SQS — returns 202 immediately, frontend polls job_status for completion
        const infographicResource = jobIdResource.addResource('infographic');
        infographicResource.addMethod('POST', new apigateway.LambdaIntegration(infographicEnqueueFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add POST endpoint for infographic polish: /papers/summarize/{job_id}/infographic/polish
        const infographicPolishResource = infographicResource.addResource('polish');
        infographicPolishResource.addMethod('POST', new apigateway.LambdaIntegration(polishEnqueueFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        // Add GET/PUT endpoints for infographic content editing: /papers/summarize/{job_id}/infographic/content
        const infographicContentResource = infographicResource.addResource('content');
        infographicContentResource.addMethod('GET', new apigateway.LambdaIntegration(editInfographicFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        infographicContentResource.addMethod('PUT', new apigateway.LambdaIntegration(editInfographicFn), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'API Gateway URL',
        });

        // Amplify App (ready for Git connection)
        const amplifyApp = new amplify.CfnApp(this, `Commonground-frontend-${props?.stackName}`, {
            name: `commonground-frontend-${props?.stackName}`,
            environmentVariables: [
                {name: 'VITE_USER_POOL_ID', value: userPool.userPoolId},
                {name: 'VITE_USER_POOL_CLIENT_ID', value: userPoolClient.userPoolClientId},
                {name: 'VITE_API_URL', value: api.url},
                {name: 'VITE_AWS_REGION', value: this.region},
            ],
            buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*`,
            customRules: [
                {
                    source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
                    target: '/index.html',
                    status: '200',
                },
            ],
        });

        // Cognito Outputs
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: userPool.userPoolId,
            description: 'Cognito User Pool ID',
        });

        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
        });

        new cdk.CfnOutput(this, 'CognitoRegion', {
            value: this.region,
            description: 'AWS Region for Cognito',
        });

        // Amplify Output
        new cdk.CfnOutput(this, 'AmplifyAppId', {
            value: amplifyApp.attrAppId,
            description: 'Amplify App ID',
        });
    }
}
