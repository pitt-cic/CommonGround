#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh - Full-stack deployment: infrastructure + frontend
#
# Deploys CDK infrastructure then builds the React frontend locally and uploads
# it to Amplify as a zip. Safe for a first-time (from-scratch) AWS deployment.
#
# Defaults:
#   - If neither --dev nor --stage is given, deploys to PRODUCTION
#     and prompts for confirmation.
#   - CDK approval level defaults to 'broadening'.
#   - Amplify branch defaults to 'main'.
#
# Usage: ./deploy.sh [options]
#
# Options:
#   --dev NAME                Developer name (required for non-prod stages)
#   --stage STAGE             Deployment stage: dev, beta, prod (default: prod)
#   --profile NAME            AWS CLI profile name (optional)
#   --branch NAME             Amplify branch to build (default: main)
#   --skip-bootstrap          Skip the CDK bootstrap step
#   --require-approval LEVEL  CDK approval level (default: broadening)
#                             Values: never, any-change, broadening
#   --skip-build              Skip frontend build, deploy existing dist/
#   --no-wait                 Don't wait for Amplify deployment to finish
#   --infra-only              Deploy infrastructure only (skip frontend)
#   --frontend-only           Deploy frontend only (infra must already exist)
#   --yes / -y                Skip all confirmation prompts
#   --help                    Show this help message
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APPROVAL="broadening"
DEFAULT_BRANCH="main"
AMPLIFY_URL=""

print_info()    { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error()   { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }
print_step()    { echo ""; echo -e "\033[1;36m━━━ $1 ━━━\033[0m"; echo ""; }

show_help() {
    cat << 'EOF'
Usage: ./deploy.sh [options]

Full-stack deployment: deploys AWS infrastructure via CDK, then builds
the React frontend locally and uploads it to Amplify via zip.

If neither --dev nor --stage is provided, defaults to a PRODUCTION deployment
and prompts for confirmation.

Steps:
  1. Check prerequisites (node, npm, docker, aws cli, zip, curl)
  2. Confirm deployment target (warns if defaulting to production)
  3. Confirm AWS identity
  4. Deploy CDK infrastructure
  5. Build and upload frontend to Amplify

Options:
  --dev NAME                Developer name (required for non-prod stages)
  --stage STAGE             Deployment stage: dev, beta, prod (default: prod)
  --profile NAME            AWS CLI profile name (optional)
  --branch NAME             Amplify branch to build (default: main)
  --skip-bootstrap          Skip CDK bootstrap (use after first deploy)
  --require-approval LEVEL  CDK approval level (default: broadening)
                            Values: never, any-change, broadening
  --no-wait                 Don't wait for Amplify build to finish
  --infra-only              Deploy infrastructure only, skip frontend
  --frontend-only           Trigger Amplify build only (infra must already exist)
  --yes / -y                Skip all confirmation prompts
  --help                    Show this help message

Examples:
  ./deploy.sh                                             # Production deploy (prompts)
  ./deploy.sh --yes                                       # Production deploy, no prompts
  ./deploy.sh --dev alice --stage dev --profile myprofile # Dev deploy
  ./deploy.sh --stage prod --yes                          # Prod, skip prompts
  ./deploy.sh --infra-only --dev alice --stage dev        # Infrastructure only
  ./deploy.sh --frontend-only --yes                       # Frontend only, no prompts
  ./deploy.sh --skip-bootstrap --require-approval never   # Fast re-deploy
EOF
    exit 0
}

# ── Prerequisites ──────────────────────────────────────────────────────────────

check_prerequisites() {
    print_info "Checking prerequisites..."
    local missing=0

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed."
        echo "  Install from: https://nodejs.org/ or via nvm: https://github.com/nvm-sh/nvm"
        missing=1
    else
        print_success "Node.js found: $(node --version)"
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed (should ship with Node.js)."
        missing=1
    else
        print_success "npm found: v$(npm --version)"
    fi

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed."
        echo "  Install from: https://docs.docker.com/get-docker/"
        echo "  Required by CDK to bundle Python Lambda functions."
        missing=1
    elif ! docker info &> /dev/null; then
        print_error "Docker is installed but the daemon is not running. Start Docker and retry."
        missing=1
    else
        print_success "Docker found and running: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    fi

    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed."
        echo "  Install from: https://aws.amazon.com/cli/"
        missing=1
    else
        print_success "AWS CLI found: $(aws --version 2>&1 | cut -d' ' -f1)"
    fi

    if ! command -v zip &> /dev/null; then
        print_error "zip is not installed."
        echo "  macOS:   brew install zip"
        echo "  Linux:   sudo apt install zip"
        echo "  Windows: choco install zip  (via Chocolatey, https://chocolatey.org)"
        missing=1
    else
        print_success "zip found"
    fi

    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed."
        missing=1
    else
        print_success "curl found"
    fi


    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid."
        echo ""
        echo "  Configure credentials with one of:"
        echo "    aws configure"
        echo "    export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=..."
        echo "    aws sso login --profile <profile>"
        missing=1
    else
        local account
        account=$(aws sts get-caller-identity --query 'Account' --output text)
        print_success "AWS credentials valid (Account: $account)"
    fi

    if [[ "$missing" -ne 0 ]]; then
        echo ""
        print_error "One or more prerequisites are missing. Fix the above and re-run."
        exit 1
    fi
}

# ── Confirmation helpers ───────────────────────────────────────────────────────

confirm_production_default() {
    local skip_confirm="$1"
    echo ""
    print_warning "No --dev or --stage specified — defaulting to PRODUCTION deployment."
    echo ""

    if [[ "$skip_confirm" == true ]]; then
        print_warning "Proceeding with production deploy (--yes flag set)."
        return 0
    fi

    read -r -p "This will deploy to PRODUCTION. Continue? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

confirm_aws_identity() {
    local skip_confirm="$1"
    echo ""
    echo "=================================================="
    echo "  AWS Identity"
    echo "=================================================="

    local identity account arn region
    identity=$(aws sts get-caller-identity --output json 2>/dev/null)
    account=$(echo "$identity" | grep -o '"Account"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    arn=$(echo "$identity"    | grep -o '"Arn"[[:space:]]*:[[:space:]]*"[^"]*"'     | cut -d'"' -f4)
    region=$(aws configure get region 2>/dev/null || echo "us-east-1")

    echo "  Profile: ${AWS_PROFILE:-(default)}"
    echo "  Account: $account"
    echo "  ARN:     $arn"
    echo "  Region:  $region"
    echo "=================================================="
    echo ""

    if [[ "$skip_confirm" == true ]]; then
        print_info "Skipping confirmation (--yes)"
        return 0
    fi

    read -r -p "Proceed with this AWS identity? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

# ── Deployment steps ───────────────────────────────────────────────────────────

deploy_infra() {
    local stage_name="$1"
    local dev_name="$2"
    local skip_bootstrap="$3"
    local require_approval="$4"

    # Build CDK context array (used for both bootstrap and deploy)
    local cdk_context=()
    cdk_context+=(-c "stageName=$stage_name")
    [[ -n "$dev_name" ]] && cdk_context+=(-c "devName=$dev_name")

    print_info "Installing npm dependencies..."
    (cd "$SCRIPT_DIR/infra" && npm install)
    print_success "Dependencies installed"
    echo ""

    print_info "Building TypeScript..."
    (cd "$SCRIPT_DIR/infra" && npm run build)
    print_success "TypeScript compiled"
    echo ""

    if [[ "$skip_bootstrap" == false ]]; then
        print_info "Bootstrapping CDK..."
        (cd "$SCRIPT_DIR/infra" && npx cdk bootstrap "${cdk_context[@]}")
        print_success "CDK bootstrap complete"
        echo ""
    else
        print_info "Skipping CDK bootstrap (--skip-bootstrap)"
        echo ""
    fi

    print_info "Deploying CDK stack (stage: $stage_name, approval: $require_approval)..."
    (cd "$SCRIPT_DIR/infra" && npx cdk deploy --require-approval "$require_approval" "${cdk_context[@]}")
}

deploy_frontend() {
    local stack_name="$1"
    local branch_name="$2"
    local no_wait="$3"
    local skip_build="${4:-false}"
    local stage_name="${5:-prod}"

    local frontend_dir="$SCRIPT_DIR/frontend"
    local zip_file="/tmp/amplify-deploy-$$.zip"

    # Sanitize branch name for Amplify (slashes are not allowed)
    local safe_branch="${branch_name//\//-}"

    # Cleanup zip on exit
    trap "rm -f '$zip_file'" RETURN

    get_cfn_output() {
        aws cloudformation describe-stacks \
            --stack-name "$1" \
            --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" \
            --output text 2>/dev/null || echo ""
    }

    # Fetch all required stack outputs
    print_info "Fetching stack outputs from: $stack_name"
    local amplify_app_id api_url user_pool_id user_pool_client_id aws_region
    amplify_app_id=$(get_cfn_output "$stack_name" "AmplifyAppId")
    api_url=$(get_cfn_output "$stack_name" "ApiUrl")
    user_pool_id=$(get_cfn_output "$stack_name" "UserPoolId")
    user_pool_client_id=$(get_cfn_output "$stack_name" "UserPoolClientId")
    aws_region=$(get_cfn_output "$stack_name" "CognitoRegion")

    if [[ -z "$amplify_app_id" ]]; then
        print_error "Could not retrieve AmplifyAppId from stack '$stack_name'."
        echo "  Ensure the infrastructure stack has been deployed first."
        exit 1
    fi

    print_success "Amplify App ID: $amplify_app_id"
    print_success "API URL: $api_url"

    print_info "Installing frontend dependencies..."
    (cd "$frontend_dir" && npm install)
    print_success "Dependencies installed"

    if [[ "$skip_build" == false ]]; then
        # Write .env.production so the build picks up the correct endpoints
        print_info "Generating frontend/.env.production..."
        cat > "$frontend_dir/.env.production" << EOF
VITE_API_URL=$api_url
VITE_USER_POOL_ID=$user_pool_id
VITE_USER_POOL_CLIENT_ID=$user_pool_client_id
VITE_AWS_REGION=$aws_region
EOF
        print_success "Created frontend/.env.production"

        print_info "Building frontend..."
        (cd "$frontend_dir" && npm run build)
        print_success "Build complete"
    else
        print_info "Skipping build (--skip-build)"
        if [[ ! -d "$frontend_dir/dist" ]]; then
            print_error "dist/ not found. Run without --skip-build first."
            exit 1
        fi
    fi

    # SPA redirect rule
    echo "/* /index.html 200" > "$frontend_dir/dist/_redirects"

    # Create zip from dist/
    print_info "Creating deployment package..."
    (cd "$frontend_dir/dist" && zip -r -q "$zip_file" . -x "*.DS_Store")
    local zip_size
    zip_size=$(du -h "$zip_file" | cut -f1)
    print_success "Package created ($zip_size)"

    # Map deployment stage to Amplify branch stage
    local amplify_stage
    [[ "$stage_name" == "prod" ]] && amplify_stage="PRODUCTION" || amplify_stage="DEVELOPMENT"

    # Ensure the Amplify branch exists with the correct stage
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

    # Create deployment and get the presigned upload URL
    print_info "Creating Amplify deployment..."
    local deployment_response job_id upload_url
    deployment_response=$(AWS_PAGER="" aws amplify create-deployment \
        --app-id "$amplify_app_id" \
        --branch-name "$safe_branch" \
        --output json)

    job_id=$(echo "$deployment_response"    | grep -o '"jobId"[[:space:]]*:[[:space:]]*"[^"]*"'       | cut -d'"' -f4)
    upload_url=$(echo "$deployment_response" | grep -o '"zipUploadUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [[ -z "$job_id" || -z "$upload_url" ]]; then
        print_error "Failed to create Amplify deployment."
        exit 1
    fi
    print_success "Deployment created (Job ID: $job_id)"

    # Upload the zip to the presigned S3 URL
    print_info "Uploading deployment package..."
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -T "$zip_file" "$upload_url")
    if [[ "$http_code" != "200" ]]; then
        print_error "Upload failed (HTTP $http_code)."
        exit 1
    fi
    print_success "Package uploaded"

    # Kick off the deployment
    print_info "Starting deployment..."
    AWS_PAGER="" aws amplify start-deployment \
        --app-id "$amplify_app_id" \
        --branch-name "$safe_branch" \
        --job-id "$job_id" \
        --output text > /dev/null
    print_success "Deployment started"

    local app_url="https://${safe_branch}.${amplify_app_id}.amplifyapp.com"
    AMPLIFY_URL="$app_url"

    if [[ "$no_wait" == true ]]; then
        print_info "Not waiting for deployment completion (--no-wait)"
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
                echo -n "."
                sleep 10
                (( attempts++ )) || true ;;
            *)
                echo -n "?"
                sleep 10
                (( attempts++ )) || true ;;
        esac
    done

    if [[ $attempts -ge $max_attempts ]]; then
        echo ""
        print_warning "Timed out waiting for deployment."
        echo "  Check status: https://${aws_region}.console.aws.amazon.com/amplify/home?region=${aws_region}#/${amplify_app_id}/${safe_branch}/${job_id}"
    fi
}

# ── Main ───────────────────────────────────────────────────────────────────────

main() {
    local dev_name=""
    local stage_name=""
    local profile_name=""
    local branch_name="$DEFAULT_BRANCH"
    local skip_bootstrap=false
    local require_approval="$DEFAULT_APPROVAL"
    local skip_build=false
    local no_wait=false
    local infra_only=false
    local frontend_only=false
    local skip_confirm=false
    local dev_explicitly_set=false
    local stage_explicitly_set=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev)
                [[ -z "${2:-}" ]] && { print_error "--dev requires a value"; exit 1; }
                dev_name="$2"; dev_explicitly_set=true; shift 2 ;;
            --stage)
                [[ -z "${2:-}" ]] && { print_error "--stage requires a value"; exit 1; }
                stage_name="$2"; stage_explicitly_set=true; shift 2 ;;
            --profile)
                [[ -z "${2:-}" ]] && { print_error "--profile requires a value"; exit 1; }
                profile_name="$2"; shift 2 ;;
            --branch)
                [[ -z "${2:-}" ]] && { print_error "--branch requires a value"; exit 1; }
                branch_name="$2"; shift 2 ;;
            --skip-bootstrap)
                skip_bootstrap=true; shift ;;
            --require-approval)
                case "${2:-}" in
                    never|any-change|broadening) require_approval="$2"; shift 2 ;;
                    *) print_error "--require-approval must be: never, any-change, broadening"; exit 1 ;;
                esac ;;
            --skip-build)
                skip_build=true; shift ;;
            --no-wait)
                no_wait=true; shift ;;
            --infra-only)
                infra_only=true; shift ;;
            --frontend-only)
                frontend_only=true; shift ;;
            --yes|-y)
                skip_confirm=true; shift ;;
            --help|-h)
                show_help ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1 ;;
        esac
    done

    if [[ "$infra_only" == true && "$frontend_only" == true ]]; then
        print_error "--infra-only and --frontend-only are mutually exclusive."
        exit 1
    fi

    # Default to prod when neither --dev nor --stage was provided
    local defaulted_to_prod=false
    if [[ "$dev_explicitly_set" == false && "$stage_explicitly_set" == false ]]; then
        stage_name="prod"
        defaulted_to_prod=true
    fi

    if [[ "$stage_name" != "prod" && -z "$dev_name" ]]; then
        print_error "--dev is required for non-prod stages"
        exit 1
    fi

    [[ -n "$profile_name" ]] && export AWS_PROFILE="$profile_name"

    # Derive stack name
    local stack_name
    if [[ "$stage_name" == "prod" ]]; then
        stack_name="commonground-stack-prod"
    else
        stack_name="commonground-stack-${dev_name}-${stage_name}"
    fi

    local phases_display
    if [[ "$infra_only" == true ]]; then
        phases_display="infra only"
    elif [[ "$frontend_only" == true ]]; then
        phases_display="frontend only"
    else
        phases_display="infra → frontend"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║       CommonGround Full-Stack Deployment     ║"
    echo "╠══════════════════════════════════════════════╣"
    printf  "║  Stack:      %-32s║\n" "$stack_name"
    printf  "║  Profile:    %-32s║\n" "${AWS_PROFILE:-(default)}"
    printf  "║  Branch:     %-32s║\n" "$branch_name"
    printf  "║  Approval:   %-32s║\n" "$require_approval"
    printf  "║  Phases:     %-32s║\n" "$phases_display"
    echo "╚══════════════════════════════════════════════╝"

    # ── Step 1: Prerequisites ─────────────────────────────────────────────────
    print_step "Step 1 — Prerequisites"
    check_prerequisites

    # ── Step 2: Production default warning ───────────────────────────────────
    if [[ "$defaulted_to_prod" == true ]]; then
        print_step "Step 2 — Deployment Target"
        confirm_production_default "$skip_confirm"
    fi

    # ── Step 3: AWS Identity ──────────────────────────────────────────────────
    print_step "Step 3 — AWS Identity"
    confirm_aws_identity "$skip_confirm"

    # ── Step 4: Infrastructure ────────────────────────────────────────────────
    if [[ "$frontend_only" == false ]]; then
        print_step "Step 4 — Infrastructure (CDK)"
        deploy_infra "$stage_name" "$dev_name" "$skip_bootstrap" "$require_approval"
        echo ""
        print_success "Infrastructure deployment complete."
    else
        print_step "Step 4 — Infrastructure (skipped)"
        print_info "Skipping infrastructure deploy (--frontend-only)"
    fi

    echo ""

    # ── Step 5: Frontend ──────────────────────────────────────────────────────
    if [[ "$infra_only" == false ]]; then
        print_step "Step 5 — Frontend (Amplify)"
        deploy_frontend "$stack_name" "$branch_name" "$no_wait" "$skip_build" "$stage_name"
        echo ""
        print_success "Frontend deployment complete."
    else
        print_step "Step 5 — Frontend (skipped)"
        print_info "Skipping frontend deploy (--infra-only)"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    print_success "Full-stack deployment complete!"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    if [[ -n "${AMPLIFY_URL:-}" ]]; then
        echo "  URL: $AMPLIFY_URL"
        echo ""
    fi
}

main "$@"
