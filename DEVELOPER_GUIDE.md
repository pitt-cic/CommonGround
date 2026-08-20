# Developer Guide

## Prerequisites

Before getting started, ensure you have the following installed on your system:

### Python 3.13
- Download from [python.org](https://www.python.org/downloads/) or use your system's package manager
- Verify installation: `python --version`

### Node.js 24
- Download from [nodejs.org](https://nodejs.org/) or use a version manager like `nvm`
- Verify installation: `node --version`

### Docker
- Download from [docker.com](https://www.docker.com/get-started)
- Verify installation: `docker --version`
- Ensure the Docker daemon is running

### AWS CDK
- Install globally via npm: `npm install -g aws-cdk`
- Verify installation: `cdk --version`
- Requires AWS CLI configured with appropriate credentials

## AWS Credentials Setup

### Configure SSO Profile (One-Time Setup)

```bash
aws configure sso
```

You will be prompted for:
- **SSO session name**: A name for this SSO session
- **SSO start URL**: Your organization's SSO portal URL (e.g., `https://my-org.awsapps.com/start`)
- **SSO region**: Region where SSO is configured
- **SSO registration scopes**: Press enter for default

Then select your AWS account and role from the list.

### Login to SSO

```bash
aws sso login --profile <profile-name>
```

This opens a browser for authentication. After successful login, your credentials are cached locally.

### Using the Profile

```bash
# Set as default for current session
export AWS_PROFILE=<profile-name>

# Or specify per command
aws s3 ls --profile <profile-name>
cdk deploy --profile <profile-name>
```

### Verifying Credentials

Check that your credentials are working:

```bash
aws sts get-caller-identity
```

This should return your AWS account ID, user ARN, and user ID.

## Infrastructure Deployment

### Using the Deployment Script (Recommended)

The easiest way to deploy infrastructure is using the provided script:

```bash
cd infra
npm run deploy
```

This script will:
1. Check prerequisites (Node.js, npm, AWS CLI, credentials)
2. Install npm dependencies
3. Build TypeScript
4. Run CDK bootstrap
5. Deploy the CDK stack

#### Script Options

```bash
# Skip bootstrap (for subsequent deploys after initial setup)
npm run deploy -- --skip-bootstrap

# Deploy without approval prompts
npm run deploy -- --require-approval never

# Show help
npm run deploy -- --help
```

### Manual Deployment

If you prefer to run commands individually:

```bash
cd infra

# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Bootstrap CDK (first time only, per account/region)
npx cdk bootstrap

# 4. Deploy the stack
npx cdk deploy
```

### Useful CDK Commands

```bash
# Preview changes before deploying
npx cdk diff

# List all stacks
npx cdk list

# Synthesize CloudFormation template
npx cdk synth

# Destroy the stack (remove all resources)
npx cdk destroy
```

## Frontend Deployment

The frontend deploys to AWS Amplify Hosting. **Note:** Infrastructure must be deployed first.

### Using the Deployment Script (Recommended)

```bash
cd frontend
npm run deploy
```

This script will:
1. Check prerequisites (AWS CLI, credentials, zip, curl)
2. Fetch Amplify App ID from CloudFormation
3. Build the frontend
4. Create and upload deployment package
5. Wait for deployment to complete

#### Script Options

```bash
# Deploy to a specific branch
npm run deploy -- --branch dev

# Skip build (use existing dist/)
npm run deploy -- --skip-build

# Don't wait for deployment to complete
npm run deploy -- --no-wait

# Show help
npm run deploy -- --help
```

### Manual Deployment

If you prefer to run commands individually:

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Build the frontend
npm run build

# 3. Get the Amplify App ID from CloudFormation
AMPLIFY_APP_ID=$(aws cloudformation describe-stacks \
    --stack-name TemplateInfraStack \
    --query "Stacks[0].Outputs[?OutputKey=='AmplifyAppId'].OutputValue" \
    --output text)

# 4. Create deployment package
cd dist && zip -r /tmp/deploy.zip . && cd ..

# 5. Create deployment and get upload URL
aws amplify create-deployment \
    --app-id $AMPLIFY_APP_ID \
    --branch-name main

# 6. Upload the zip file to the returned URL and start deployment
# (Use the zipUploadUrl and jobId from the previous command)
curl --request PUT --upload-file /tmp/deploy.zip "<zipUploadUrl>"

aws amplify start-deployment \
    --app-id $AMPLIFY_APP_ID \
    --branch-name main \
    --job-id <jobId>
```

### Local Development

```bash
cd frontend

# Generate .env file from CloudFormation outputs
npm run setup-dev

# Start development server
npm run dev

# Preview production build locally
npm run build && npm run preview
```