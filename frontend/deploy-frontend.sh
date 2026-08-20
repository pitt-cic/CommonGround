#!/usr/bin/env bash
set -euo pipefail

#
# deploy-frontend.sh - Build and deploy the frontend to Amplify via zip upload
#
# Standalone script for frontend-only deploys. For full-stack deploys
# (infra + frontend), use the root deploy.sh instead.
#
# Usage: ./deploy-frontend.sh [options]
#
# Options:
#   --stage STAGE      Deployment stage: dev, beta, or prod (required)
#   --dev NAME         Developer name (required for non-prod stages)
#   --branch NAME      Amplify branch name (default: main)
#   --profile NAME     AWS CLI profile name (optional)
#   --skip-build       Skip frontend build, deploy existing dist/
#   --no-wait          Don't wait for Amplify deployment to finish
#   --yes / -y         Skip confirmation prompts
#   --help             Show this help message
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME_BASE="commonground-stack"
DEFAULT_BRANCH="main"

print_info()    { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error()   { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

show_help() {
    cat << 'EOF'
Usage: ./deploy-frontend.sh [options]

Build the React frontend and deploy it to Amplify via zip upload.
Reads CloudFormation outputs to generate .env.production automatically.

Options:
  --stage STAGE      Deployment stage: dev, beta, or prod (required)
  --dev NAME         Developer name (required for non-prod stages)
  --branch NAME      Amplify branch name (default: main)
  --profile NAME     AWS CLI profile name (optional)
  --skip-build       Skip build step, deploy existing dist/
  --no-wait          Don't poll for Amplify deployment completion
  --yes / -y         Skip confirmation prompts
  --help             Show this help message

Examples:
  ./deploy-frontend.sh --stage prod
  ./deploy-frontend.sh --stage dev --dev alice --profile myprofile
  ./deploy-frontend.sh --stage prod --skip-build --no-wait
EOF
    exit 0
}

get_cfn_output() {
    aws cloudformation describe-stacks \
        --stack-name "$1" \
        --query "Stacks[0].Outputs[?OutputKey==\`$2\`].OutputValue" \
        --output text 2>/dev/null || echo ""
}

main() {
    local dev_name=""
    local stage_name=""
    local branch_name="$DEFAULT_BRANCH"
    local skip_build=false
    local no_wait=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev)
                [[ -z "${2:-}" ]] && { print_error "--dev requires a value"; exit 1; }
                dev_name="$2"; shift 2 ;;
            --stage)
                [[ -z "${2:-}" ]] && { print_error "--stage requires a value"; exit 1; }
                stage_name="$2"; shift 2 ;;
            --branch)
                [[ -z "${2:-}" ]] && { print_error "--branch requires a value"; exit 1; }
                branch_name="$2"; shift 2 ;;
            --profile)
                [[ -z "${2:-}" ]] && { print_error "--profile requires a value"; exit 1; }
                export AWS_PROFILE="$2"; shift 2 ;;
            --skip-build)
                skip_build=true; shift ;;
            --no-wait)
                no_wait=true; shift ;;
            --yes|-y)
                shift ;;
            --help|-h)
                show_help ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1 ;;
        esac
    done

    if [[ -z "$stage_name" ]]; then
        print_error "--stage is required (dev, beta, prod)"
        exit 1
    fi

    if [[ "$stage_name" != "prod" && -z "$dev_name" ]]; then
        print_error "--dev is required for non-prod stages"
        exit 1
    fi

    local stack_name
    if [[ "$stage_name" == "prod" ]]; then
        stack_name="${STACK_NAME_BASE}-prod"
    else
        stack_name="${STACK_NAME_BASE}-${dev_name}-${stage_name}"
    fi

    local safe_branch="${branch_name//\//-}"
    local zip_file="/tmp/amplify-deploy-$$.zip"
    trap "rm -f '$zip_file'" RETURN

    echo ""
    echo "=================================="
    echo "  Frontend Deployment"
    echo "  Stack:  $stack_name"
    echo "  Branch: $branch_name"
    echo "=================================="
    echo ""

    # Fetch CloudFormation outputs
    print_info "Fetching stack outputs from: $stack_name"
    if ! aws cloudformation describe-stacks --stack-name "$stack_name" &> /dev/null; then
        print_error "Stack '$stack_name' not found. Deploy infrastructure first."
        echo "  Run: ./deploy.sh --stage $stage_name${dev_name:+ --dev $dev_name}"
        exit 1
    fi

    local amplify_app_id api_url user_pool_id user_pool_client_id aws_region
    amplify_app_id=$(get_cfn_output "$stack_name" "AmplifyAppId")
    api_url=$(get_cfn_output "$stack_name" "ApiUrl")
    user_pool_id=$(get_cfn_output "$stack_name" "UserPoolId")
    user_pool_client_id=$(get_cfn_output "$stack_name" "UserPoolClientId")
    aws_region=$(get_cfn_output "$stack_name" "CognitoRegion")

    if [[ -z "$amplify_app_id" ]]; then
        print_error "Could not retrieve AmplifyAppId from stack '$stack_name'."
        exit 1
    fi
    print_success "Amplify App ID: $amplify_app_id"
    print_success "API URL: $api_url"

    # Install dependencies
    print_info "Installing frontend dependencies..."
    (cd "$SCRIPT_DIR" && npm install)
    print_success "Dependencies installed"

    if [[ "$skip_build" == false ]]; then
        print_info "Generating .env.production..."
        cat > "$SCRIPT_DIR/.env.production" << EOF
VITE_API_URL=$api_url
VITE_USER_POOL_ID=$user_pool_id
VITE_USER_POOL_CLIENT_ID=$user_pool_client_id
VITE_AWS_REGION=$aws_region
EOF
        print_success "Created .env.production"

        print_info "Building frontend..."
        (cd "$SCRIPT_DIR" && npm run build)
        print_success "Build complete"
    else
        print_info "Skipping build (--skip-build)"
        if [[ ! -d "$SCRIPT_DIR/dist" ]]; then
            print_error "dist/ not found. Run without --skip-build first."
            exit 1
        fi
    fi

    # SPA redirect rule
    echo "/* /index.html 200" > "$SCRIPT_DIR/dist/_redirects"

    # Create zip from dist/
    print_info "Creating deployment package..."
    (cd "$SCRIPT_DIR/dist" && zip -r -q "$zip_file" . -x "*.DS_Store")
    local zip_size
    zip_size=$(du -h "$zip_file" | cut -f1)
    print_success "Package created ($zip_size)"

    # Map stage to Amplify branch stage
    local amplify_stage
    [[ "$stage_name" == "prod" ]] && amplify_stage="PRODUCTION" || amplify_stage="DEVELOPMENT"

    # Ensure branch exists with correct stage
    if ! aws amplify get-branch --app-id "$amplify_app_id" --branch-name "$safe_branch" &> /dev/null; then
        print_info "Creating Amplify branch '$safe_branch' (stage: $amplify_stage)..."
        AWS_PAGER="" aws amplify create-branch \
            --app-id "$amplify_app_id" \
            --branch-name "$safe_branch" \
            --stage "$amplify_stage" \
            --no-enable-auto-build \
            2>/dev/null || true
    else
        AWS_PAGER="" aws amplify update-branch \
            --app-id "$amplify_app_id" \
            --branch-name "$safe_branch" \
            --stage "$amplify_stage" \
            --no-enable-auto-build \
            2>/dev/null || true
    fi

    # Create deployment and get presigned upload URL
    print_info "Creating Amplify deployment..."
    local deployment_response job_id upload_url
    deployment_response=$(AWS_PAGER="" aws amplify create-deployment \
        --app-id "$amplify_app_id" \
        --branch-name "$safe_branch" \
        --output json)

    job_id=$(echo "$deployment_response"     | grep -o '"jobId"[[:space:]]*:[[:space:]]*"[^"]*"'       | cut -d'"' -f4)
    upload_url=$(echo "$deployment_response" | grep -o '"zipUploadUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [[ -z "$job_id" || -z "$upload_url" ]]; then
        print_error "Failed to create Amplify deployment."
        exit 1
    fi
    print_success "Deployment created (Job ID: $job_id)"

    # Upload zip to presigned S3 URL
    print_info "Uploading deployment package..."
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -T "$zip_file" "$upload_url")
    if [[ "$http_code" != "200" ]]; then
        print_error "Upload failed (HTTP $http_code)."
        exit 1
    fi
    print_success "Package uploaded"

    # Start the deployment
    print_info "Starting deployment..."
    AWS_PAGER="" aws amplify start-deployment \
        --app-id "$amplify_app_id" \
        --branch-name "$safe_branch" \
        --job-id "$job_id" \
        --output text > /dev/null
    print_success "Deployment started"

    local app_url="https://${safe_branch}.${amplify_app_id}.amplifyapp.com"

    if [[ "$no_wait" == true ]]; then
        print_info "Not waiting for deployment completion (--no-wait)"
        echo ""
        echo "=================================="
        print_success "Frontend deployment complete!"
        echo "=================================="
        echo ""
        echo "  URL: $app_url"
        echo ""
        return 0
    fi

    # Poll until complete (max 10 minutes)
    print_info "Waiting for deployment to complete..."
    local attempts=0
    local max_attempts=60
    while [[ $attempts -lt $max_attempts ]]; do
        local status
        status=$(aws amplify get-job \
            --app-id "$amplify_app_id" \
            --branch-name "$safe_branch" \
            --job-id "$job_id" \
            --query 'job.summary.status' \
            --output text)

        case "$status" in
            SUCCEED)
                echo ""
                print_success "Deployment complete!"
                break ;;
            FAILED|CANCELLED)
                echo ""
                print_error "Deployment $status (Job ID: $job_id)"
                echo "  Logs: https://${aws_region}.console.aws.amazon.com/amplify/home?region=${aws_region}#/${amplify_app_id}/${safe_branch}/${job_id}"
                exit 1 ;;
            RUNNING|PENDING|PROVISIONING)
                echo -n "."; sleep 10; (( attempts++ )) ;;
            *)
                echo -n "?"; sleep 10; (( attempts++ )) ;;
        esac
    done

    if [[ $attempts -ge $max_attempts ]]; then
        echo ""
        print_warning "Timed out waiting for deployment."
        echo "  Check status: https://${aws_region}.console.aws.amazon.com/amplify/home?region=${aws_region}#/${amplify_app_id}/${safe_branch}/${job_id}"
    fi

    echo ""
    echo "=================================="
    print_success "Frontend deployment complete!"
    echo "=================================="
    echo ""
    echo "  URL: $app_url"
    echo ""
}

main "$@"
