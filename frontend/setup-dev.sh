#!/usr/bin/env bash
set -euo pipefail

#
# setup-dev.sh - Frontend development environment setup script
#
# Usage: npm run setup-dev [options]
#
# Options:
#   --dev NAME     Developer name (required for non-prod stages)
#   --stage STAGE  Deployment stage (e.g. dev, prod)
#   --profile NAME AWS CLI profile name (optional)
#   --skip-env     Skip CloudFormation fetch and .env generation
#   --help         Show this help message
#

STACK_NAME_BASE="commonground-stack"
ENV_FILE=".env"
ENV_BACKUP=".env.backup"

print_info()    { echo -e "\033[0;34m[INFO]\033[0m $1"; }
print_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
print_error()   { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
print_warning() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

show_help() {
    echo "Usage: npm run setup-dev [-- options]"
    echo ""
    echo "Sets up the frontend development environment by:"
    echo "  1. Checking prerequisites (node, npm, aws cli)"
    echo "  2. Installing npm dependencies"
    echo "  3. Fetching CloudFormation outputs and generating .env file"
    echo ""
    echo "Options:"
    echo "  --dev NAME     Developer name (required for non-prod stages)"
    echo "  --stage STAGE  Deployment stage: dev, beta, or prod (default: prod)"
    echo "  --profile NAME AWS CLI profile name (optional)"
    echo "  --skip-env     Skip CloudFormation fetch and .env generation"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  npm run setup-dev -- --stage prod"
    echo "  npm run setup-dev -- --stage dev --dev alice"
    echo "  npm run setup-dev -- --stage dev --dev alice --profile myprofile"
    echo "  npm run setup-dev -- --skip-env"
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
        echo "  npm should be included with Node.js. Please reinstall Node.js."
        exit 1
    fi
    print_success "npm found: v$(npm --version)"

    if ! command -v aws &> /dev/null; then
        print_warning "AWS CLI is not installed."
        echo "  AWS CLI is required to fetch CloudFormation outputs."
        echo "  Install from: https://aws.amazon.com/cli/"
        echo "  You can use --skip-env to proceed without AWS integration."
        return 1
    fi
    print_success "AWS CLI found: $(aws --version 2>&1 | cut -d' ' -f1)"
    return 0
}

handle_existing_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        return 0
    fi

    print_warning "Existing $ENV_FILE file found."
    echo ""
    echo "What would you like to do?"
    echo "  [b] Backup existing file and create new one"
    echo "  [o] Overwrite existing file"
    echo "  [s] Skip .env generation (keep existing)"
    echo "  [q] Quit"
    echo ""

    while true; do
        read -rp "Choice [b/o/s/q]: " choice
        case "$choice" in
            b|B)
                cp "$ENV_FILE" "$ENV_BACKUP"
                print_success "Backed up existing .env to $ENV_BACKUP"
                return 0 ;;
            o|O)
                print_info "Will overwrite existing .env file"
                return 0 ;;
            s|S)
                print_info "Skipping .env generation, keeping existing file"
                return 1 ;;
            q|Q)
                print_info "Setup cancelled by user"
                exit 0 ;;
            *)
                echo "Invalid choice. Please enter b, o, s, or q." ;;
        esac
    done
}

get_cfn_output() {
    local output_key="$1"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey==\`$output_key\`].OutputValue" \
        --output text 2>/dev/null
}

fetch_cloudformation_outputs() {
    print_info "Fetching CloudFormation outputs from stack: $STACK_NAME"

    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null; then
        print_error "CloudFormation stack '$STACK_NAME' not found."
        echo ""
        echo "  The infrastructure stack must be deployed first."
        echo "  From the project root, run:"
        echo ""
        echo "    ./deploy.sh --stage $STAGE_NAME${DEV_NAME:+ --dev $DEV_NAME}"
        echo ""
        exit 1
    fi

    API_URL=$(get_cfn_output "ApiUrl")
    USER_POOL_ID=$(get_cfn_output "UserPoolId")
    USER_POOL_CLIENT_ID=$(get_cfn_output "UserPoolClientId")
    COGNITO_REGION=$(get_cfn_output "CognitoRegion")

    if [[ -z "$API_URL" || -z "$USER_POOL_ID" || -z "$USER_POOL_CLIENT_ID" || -z "$COGNITO_REGION" ]]; then
        print_error "Failed to fetch all required CloudFormation outputs."
        echo "  Please ensure the stack has been deployed successfully."
        exit 1
    fi

    print_success "CloudFormation outputs fetched successfully"
}

generate_env_file() {
    print_info "Generating $ENV_FILE file..."

    cat > "$ENV_FILE" << EOF
VITE_API_URL=$API_URL
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
VITE_AWS_REGION=$COGNITO_REGION
EOF

    print_success "Generated $ENV_FILE:"
    echo "  VITE_API_URL=$API_URL"
    echo "  VITE_USER_POOL_ID=$USER_POOL_ID"
    echo "  VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID"
    echo "  VITE_AWS_REGION=$COGNITO_REGION"
}

main() {
    local skip_env=false
    local dev_name=""
    local stage_name="prod"

    # Expose to fetch_cloudformation_outputs for the error message
    DEV_NAME=""
    STAGE_NAME="prod"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev)
                [[ -z "${2:-}" ]] && { print_error "--dev requires a value"; exit 1; }
                dev_name="$2"; DEV_NAME="$2"; shift 2 ;;
            --stage)
                [[ -z "${2:-}" ]] && { print_error "--stage requires a value"; exit 1; }
                stage_name="$2"; STAGE_NAME="$2"; shift 2 ;;
            --profile)
                [[ -z "${2:-}" ]] && { print_error "--profile requires a value"; exit 1; }
                export AWS_PROFILE="$2"; shift 2 ;;
            --skip-env)
                skip_env=true; shift ;;
            --help|-h)
                show_help ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1 ;;
        esac
    done

    # Derive stack name
    if [[ "$stage_name" == "prod" ]]; then
        STACK_NAME="${STACK_NAME_BASE}-prod"
    else
        if [[ -z "$dev_name" ]]; then
            print_error "--dev is required for non-prod stages"
            exit 1
        fi
        STACK_NAME="${STACK_NAME_BASE}-${dev_name}-${stage_name}"
    fi

    echo ""
    echo "=================================="
    echo "  Frontend Development Setup"
    echo "  Target Stack: $STACK_NAME"
    echo "=================================="
    echo ""

    local aws_available=true
    if ! check_prerequisites; then
        aws_available=false
    fi
    echo ""

    if [[ "$skip_env" == true ]]; then
        print_info "Skipping .env generation (--skip-env flag)"
        if [[ ! -f "$ENV_FILE" ]]; then
            print_warning "No $ENV_FILE file found. Create one manually before running 'npm run dev'."
        fi
    elif [[ "$aws_available" == false ]]; then
        print_warning "AWS CLI not available — skipping .env generation"
        if [[ ! -f "$ENV_FILE" ]]; then
            print_warning "No $ENV_FILE file found. Create one manually before running 'npm run dev'."
        fi
    else
        if ! aws sts get-caller-identity &> /dev/null; then
            print_error "AWS credentials are not configured or are invalid."
            echo ""
            echo "  Configure credentials with one of:"
            echo "    aws configure"
            echo "    export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=..."
            echo "    aws sso login --profile <profile>"
            exit 1
        fi

        if handle_existing_env; then
            fetch_cloudformation_outputs
            generate_env_file
        fi
    fi
    echo ""

    print_info "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
    echo ""

    echo "=================================="
    print_success "Setup complete!"
    echo "=================================="
    echo ""
    echo "To start the development server, run:"
    echo ""
    echo "  npm run dev"
    echo ""
}

main "$@"
