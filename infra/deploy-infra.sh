#!/usr/bin/env bash
set -euo pipefail

#
# deploy-infra.sh - Deploy CDK infrastructure to AWS (standalone)
#
# For full-stack deploys (infra + frontend), use the root deploy.sh instead.
#
# Usage: npm run deploy [-- options]
#        ./deploy-infra.sh [options]
#
# Options:
#   --dev NAME                Developer name (required for non-prod stages)
#   --stage STAGE             Deployment stage: dev, beta, or prod (required)
#   --profile NAME            AWS CLI profile name (optional)
#   --skip-bootstrap          Skip the CDK bootstrap step
#   --require-approval LEVEL  CDK approval level (default: broadening)
#                             Values: never, any-change, broadening
#   --yes / -y                Skip AWS identity confirmation prompt
#   --help                    Show this help message
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME_BASE="commonground-stack"
DEFAULT_APPROVAL="broadening"
CDK_CONTEXT=()

print_info()    { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error()   { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

show_help() {
    cat << 'EOF'
Usage: npm run deploy [-- options]
       ./deploy-infra.sh [options]

Deploy the CDK infrastructure to AWS.

Steps performed:
  1. Check prerequisites (node, npm, docker, aws cli, credentials)
  2. Confirm AWS identity
  3. Install npm dependencies
  4. Build TypeScript
  5. Run CDK bootstrap (unless --skip-bootstrap)
  6. Run CDK deploy

Options:
  --dev NAME                Developer name (required for non-prod stages)
  --stage STAGE             Deployment stage: dev, beta, or prod (required)
  --profile NAME            AWS CLI profile name (optional)
  --skip-bootstrap          Skip CDK bootstrap (for re-deploys)
  --require-approval LEVEL  CDK approval level (default: broadening)
                            Values: never, any-change, broadening
  --yes / -y                Skip AWS identity confirmation prompt
  --help                    Show this help message

Examples:
  npm run deploy -- --stage prod
  npm run deploy -- --stage dev --dev alice --profile myprofile
  npm run deploy -- --stage prod --skip-bootstrap --require-approval never
EOF
    exit 0
}

check_prerequisites() {
    print_info "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed."
        echo "  Install from: https://nodejs.org/ or via nvm: https://github.com/nvm-sh/nvm"
        exit 1
    fi
    print_success "Node.js found: $(node --version)"

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi
    print_success "npm found: v$(npm --version)"

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed."
        echo "  Install from: https://docs.docker.com/get-docker/"
        echo "  Required by CDK to bundle Python Lambda functions."
        exit 1
    fi
    if ! docker info &> /dev/null; then
        print_error "Docker is installed but not running. Start Docker and retry."
        exit 1
    fi
    print_success "Docker found and running: $(docker --version | cut -d' ' -f3 | tr -d ',')"

    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed."
        echo "  Install from: https://aws.amazon.com/cli/"
        exit 1
    fi
    print_success "AWS CLI found: $(aws --version 2>&1 | cut -d' ' -f1)"

    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid."
        echo ""
        echo "  Configure credentials with one of:"
        echo "    aws configure"
        echo "    export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=..."
        echo "    aws sso login --profile <profile>"
        exit 1
    fi
    local account
    account=$(aws sts get-caller-identity --query 'Account' --output text)
    print_success "AWS credentials valid (Account: $account)"
}

confirm_aws_identity() {
    local skip_confirm="${1:-false}"

    echo ""
    echo "=================================================="
    echo "  AWS Identity Check"
    echo "=================================================="

    local identity
    identity=$(aws sts get-caller-identity --output json 2>/dev/null)

    if [[ -z "$identity" ]]; then
        print_error "Could not retrieve AWS identity."
        exit 1
    fi

    local account arn
    account=$(echo "$identity" | grep -o '"Account"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    arn=$(echo "$identity"    | grep -o '"Arn"[[:space:]]*:[[:space:]]*"[^"]*"'     | cut -d'"' -f4)

    echo "  Profile: ${AWS_PROFILE:-(default)}"
    echo "  Account: $account"
    echo "  ARN:     $arn"
    echo "=================================================="
    echo ""

    if [[ "$skip_confirm" == true ]]; then
        print_info "Skipping confirmation (--yes flag)"
        return 0
    fi

    read -r -p "Proceed with this AWS identity? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

main() {
    local dev_name=""
    local stage_name=""
    local skip_bootstrap=false
    local require_approval="$DEFAULT_APPROVAL"
    local skip_confirm=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev)
                [[ -z "${2:-}" ]] && { print_error "--dev requires a value"; exit 1; }
                dev_name="$2"; shift 2 ;;
            --stage)
                [[ -z "${2:-}" ]] && { print_error "--stage requires a value"; exit 1; }
                stage_name="$2"; shift 2 ;;
            --profile)
                [[ -z "${2:-}" ]] && { print_error "--profile requires a value"; exit 1; }
                export AWS_PROFILE="$2"; shift 2 ;;
            --skip-bootstrap)
                skip_bootstrap=true; shift ;;
            --require-approval)
                case "${2:-}" in
                    never|any-change|broadening) require_approval="$2"; shift 2 ;;
                    *) print_error "--require-approval must be: never, any-change, broadening"; exit 1 ;;
                esac ;;
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

    if [[ -z "$stage_name" ]]; then
        print_error "--stage is required (dev, beta, prod)"
        exit 1
    fi

    # Build stack name and CDK context array
    local stack_name
    if [[ "$stage_name" == "prod" ]]; then
        stack_name="${STACK_NAME_BASE}-prod"
        CDK_CONTEXT+=("-c" "stageName=prod")
    else
        if [[ -z "$dev_name" ]]; then
            print_error "--dev is required for non-prod stages"
            exit 1
        fi
        stack_name="${STACK_NAME_BASE}-${dev_name}-${stage_name}"
        CDK_CONTEXT+=("-c" "stageName=$stage_name")
        CDK_CONTEXT+=("-c" "devName=$dev_name")
    fi

    echo ""
    echo "=================================="
    echo "  CDK Infrastructure Deployment"
    echo "  Target Stack: $stack_name"
    echo "=================================="
    echo ""

    check_prerequisites
    echo ""

    confirm_aws_identity "$skip_confirm"
    echo ""

    print_info "Installing npm dependencies..."
    (cd "$SCRIPT_DIR" && npm install)
    print_success "Dependencies installed"
    echo ""

    print_info "Building TypeScript..."
    (cd "$SCRIPT_DIR" && npm run build)
    print_success "TypeScript compiled"
    echo ""

    if [[ "$skip_bootstrap" == false ]]; then
        print_info "Bootstrapping CDK..."
        (cd "$SCRIPT_DIR" && npx cdk bootstrap "${CDK_CONTEXT[@]}")
        print_success "CDK bootstrap complete"
        echo ""
    else
        print_info "Skipping CDK bootstrap (--skip-bootstrap)"
        echo ""
    fi

    print_info "Deploying CDK stack (approval: $require_approval)..."
    (cd "$SCRIPT_DIR" && npx cdk deploy --require-approval "$require_approval" "${CDK_CONTEXT[@]}")
    echo ""

    echo "=================================="
    print_success "Infrastructure deployment complete!"
    echo "=================================="
    echo ""
    echo "Next steps:"
    echo "  - Run './deploy.sh --frontend-only --stage $stage_name${dev_name:+ --dev $dev_name}' to deploy the frontend"
    echo "  - Run 'npx cdk diff ${CDK_CONTEXT[*]}' to see pending changes"
    echo "  - Run 'npx cdk destroy ${CDK_CONTEXT[*]}' to tear down the stack"
    echo ""
}

main "$@"
