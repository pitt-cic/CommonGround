#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {InfraStack} from '../lib/infra-stack';

const app = new cdk.App();

// Determine the dynamic values cast as strings
const devName = app.node.tryGetContext('devName') as string | undefined;
const stageName = app.node.tryGetContext('stageName') as string;

const validStages = ['dev', 'beta', 'prod'];

if (!stageName || !validStages.includes(stageName)) {
    throw new Error('Please provide a valid stageName: cdk deploy -c stageName=dev|beta|prod');
}

if ((!devName && stageName != 'prod')) {
    throw new Error('Please provide devName for non-prod deployments: cdk deploy -c devName=yourname -c stageName=dev|beta');
}

const isProd = stageName === 'prod';
const stackName = isProd
    ? `commonground-stack-${stageName}`
    : `commonground-stack-${devName}-${stageName}`;

// Removal policy based on the stage
const removalPolicy = isProd
    ? cdk.RemovalPolicy.RETAIN
    : cdk.RemovalPolicy.DESTROY

// Pass everything explicityly via custom Props
new InfraStack(app, stackName, {
    stackName,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'Summarizes research papers for different audiences',
    developerName: isProd ? undefined : devName,
    stageName: stageName,
    tableRemovalPolicy: removalPolicy,
    allowedOrigins: [],
});