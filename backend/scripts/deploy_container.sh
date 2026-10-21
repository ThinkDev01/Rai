#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rai Backend — CodeDeploy container swap
#
# The ONE script CodeDeploy runs on the EC2 host (via the ApplicationStart hook
# in appspec.yml). It pulls the image CodeBuild already built + pushed to ECR and
# swaps the running container — it does NOT rebuild. The whole pipeline is:
#
#   GitHub → CodePipeline → CodeBuild (buildspec.yml → image → ECR)
#          → CodeDeploy (appspec.yml → THIS script) → EC2 (Docker + host Nginx)
#
# WHY backend differs from frontend (compare frontend/scripts/deploy_container.sh):
#   - The frontend bakes NEXT_PUBLIC_* at BUILD time, so its runtime container
#     needs zero env vars. The backend reads ENVIRONMENT, DB creds, Cognito, etc.
#     at RUNTIME from a MOUNTED .env (same contract as docker-compose.prod.yml).
#   - The backend ships its stdout straight to CloudWatch via the awslogs driver
#     (the frontend does not). These --log-opt flags mirror docker-compose.prod.yml.
#
# WHO OWNS WHAT:
#   - This file + appspec.yml + Dockerfile → us (dev).
#   - Deployment config below → devops stores it in SSM Parameter Store:
#       /rai/backend/account-id
#       /rai/backend/aws-region
#       /rai/backend/ecr-repo
#     plus optional IMAGE_TAG (defaults to "latest").
#   - The runtime secrets file (ENV_FILE) → devops places it on the host; it is
#     NEVER in the repo or the image (it is .gitignored + .dockerignored).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RAI_ENV=$(cat /etc/rai-environment 2>/dev/null || echo "")
if [ -z "${RAI_ENV}" ]; then
  echo "ERROR: /etc/rai-environment not found — cannot determine environment" >&2
  exit 1
fi

# --- Config (devops-provided from SSM Parameter Store) ------------------------
AWS_ACCOUNT_ID="$(aws ssm get-parameter \
  --name "/rai/${RAI_ENV}/frontend/account-id" \
  --query "Parameter.Value" \
  --output text)"

AWS_DEFAULT_REGION="$(aws ssm get-parameter \
  --name "/rai/${RAI_ENV}/frontend/aws-region" \
  --query "Parameter.Value" \
  --output text)"

ECR_REPO="$(aws ssm get-parameter \
  --name "/rai/${RAI_ENV}/backend/ecr-repo" \
  --query "Parameter.Value" \
  --output text)"

IMAGE_TAG="${IMAGE_TAG:-latest}"          # pin to a commit sha for traceable rollbacks
CONTAINER_NAME="rai-api"                  # matches docker-compose.prod.yml
HOST_BIND="4000:4000"                     # ALB direct access; EC2 SG allows 4000 only from ALB SG

# Runtime secrets: mounted read-only at /app/.env, exactly like the compose file.
# The container will not boot correctly without it (no ENVIRONMENT, DB, Cognito).
ENV_FILE="${ENV_FILE:-/opt/rai/backend/.env}"

# CloudWatch (awslogs driver) — mirrors docker-compose.prod.yml's logging block.
# Clean field-parsable JSON in CloudWatch also needs ENVIRONMENT=prod in ENV_FILE
# (so the app emits JSON, not the dev pretty-printer). The EC2 instance role must
# allow CreateLogGroup, CreateLogStream, PutLogEvents.
AWSLOGS_REGION="${AWSLOGS_REGION:-ap-south-2}"
AWSLOGS_GROUP="${AWSLOGS_GROUP:-/rai/${RAI_ENV}/backend/app}"
AWSLOGS_STREAM="${AWSLOGS_STREAM:-rai-api}"

if [ -z "${AWS_ACCOUNT_ID:-}" ]; then
  echo "ERROR: AWS_ACCOUNT_ID is not available from SSM Parameter Store." >&2
  exit 1
fi

if [ -z "${AWS_DEFAULT_REGION:-}" ]; then
  echo "ERROR: AWS_DEFAULT_REGION is not available from SSM Parameter Store." >&2
  exit 1
fi

if [ -z "${ECR_REPO:-}" ]; then
  echo "ERROR: ECR_REPO is not available from SSM Parameter Store." >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: runtime env file not found at '${ENV_FILE}' — devops must place it" >&2
  echo "       (set ENV_FILE to override). The API cannot boot without it." >&2
  exit 1
fi

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

echo "Deploying ${IMAGE} as container '${CONTAINER_NAME}'..."

# --- 1. Authenticate to ECR --------------------------------------------------
echo "Logging in to Amazon ECR (${REGISTRY})..."
aws ecr get-login-password --region "${AWS_DEFAULT_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

# --- 2. Pull the new image (fail the deploy if it isn't there) ----------------
echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

# --- 3. Stop + remove the old container (idempotent; first deploy is a no-op) --
if docker ps -aq --filter "name=^/${CONTAINER_NAME}$" | grep -q .; then
  echo "Stopping + removing existing '${CONTAINER_NAME}'..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

# --- 4. Start the new container ----------------------------------------------
# unless-stopped: survives EC2 reboot / crash, but an intentional stop stays
# stopped (per dev-deployment.md "Container restart policy").
echo "Starting new '${CONTAINER_NAME}'..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -v "${ENV_FILE}:/app/.env:ro" \
  -p "${HOST_BIND}" \
  --log-driver awslogs \
  --log-opt awslogs-region="${AWSLOGS_REGION}" \
  --log-opt awslogs-group="${AWSLOGS_GROUP}" \
  --log-opt awslogs-create-group=true \
  --log-opt awslogs-stream="${AWSLOGS_STREAM}" \
  "${IMAGE}"

# --- 5. Validate (gives CodeDeploy a real success/fail signal) ----------------
# The API answers GET /api/health with 200 — poll until it does, fail otherwise.
echo "Waiting for the container to become healthy..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:4000/api/health"; then
    echo "Healthy after ${i} attempt(s). Deploy complete."
    # Reclaim disk from the now-untagged previous image layers.
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "ERROR: container did not become healthy in time — dumping last logs:" >&2
docker logs --tail 50 "${CONTAINER_NAME}" >&2 || true
exit 1
