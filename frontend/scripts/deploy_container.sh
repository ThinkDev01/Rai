#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rai Frontend — CodeDeploy container swap
#
# The ONE script CodeDeploy runs on the EC2 host (via the ApplicationStart hook
# in appspec.yml). It pulls the image CodeBuild already built + pushed to ECR and
# swaps the running container — it does NOT rebuild. The whole pipeline is:
#
#   GitHub → CodePipeline → CodeBuild (buildspec.yml → image → ECR)
#          → CodeDeploy (appspec.yml → THIS script) → EC2 (Docker + host Nginx)
#
# WHY no rebuild here: NEXT_PUBLIC_* are baked into the client bundle at BUILD
# time inside buildspec.yml (--build-arg). The ECR image is already complete, so
# the runtime container needs zero env vars — just pull and run.
#
# WHO OWNS WHAT:
#   - This file + appspec.yml + Dockerfile → us (dev).
#   - The env vars below → devops sets them on the EC2 instance (or the CodeDeploy
#     deployment-group environment), same three names buildspec.yml uses:
#       AWS_ACCOUNT_ID, AWS_DEFAULT_REGION, ECR_REPO (e.g. rai-frontend)
#     plus optional IMAGE_TAG (defaults to "latest").
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RAI_ENV=$(cat /etc/rai-environment 2>/dev/null || echo "")
if [ -z "${RAI_ENV}" ]; then
  echo "ERROR: /etc/rai-environment not found — cannot determine environment" >&2
  exit 1
fi

# --- Config --------------------------------------------------------------
AWS_DEFAULT_REGION="ap-south-2"

CONTAINER_NAME="rai-frontend"
HOST_BIND="3000:3000"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# --- Helper: fetch SSM parameter ---------------------------------------
get_param () {
  aws ssm get-parameter \
    --name "$1" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text \
    --region "${AWS_DEFAULT_REGION}"
}

echo "Fetching configuration from SSM (region: ${AWS_DEFAULT_REGION})..."

# --- Required parameters -------------------------------------------------
AWS_ACCOUNT_ID=$(get_param /rai/${RAI_ENV}/frontend/account-id)
ECR_REPO=$(get_param /rai/${RAI_ENV}/frontend/ecr-repo)

# --- Build image ---------------------------------------------------------
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

echo "Deploying: ${IMAGE}"
echo "Container: ${CONTAINER_NAME}"

# --- 1. Login to ECR -----------------------------------------------------
echo "Logging into ECR..."
aws ecr get-login-password --region "${AWS_DEFAULT_REGION}" \
  | docker login --username AWS --password-stdin "${REGISTRY}"

# --- 2. Pull image -------------------------------------------------------
echo "Pulling image..."
docker pull "${IMAGE}"

# --- 3. Stop old container ----------------------------------------------
if docker ps -aq --filter "name=^/${CONTAINER_NAME}$" | grep -q .; then
  echo "Stopping existing container..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

# --- 4. Env file ---------------------------------------------------------
ENV_FILE="/tmp/rai-frontend.env"

cat > "${ENV_FILE}" <<EOF
AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID}
ECR_REPO=${ECR_REPO}
IMAGE_TAG=${IMAGE_TAG}
EOF

echo "Created env file: ${ENV_FILE}"

# --- 5. Run container ----------------------------------------------------
echo "Starting container..."

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${HOST_BIND}" \
  --env-file "${ENV_FILE}" \
  "${IMAGE}"

# --- 6. Health check -----------------------------------------------------
echo "Waiting for application to become healthy..."

for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3000/"; then
    echo "✅ Healthy after ${i} attempts. Deployment successful."

    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi

  sleep 2
done

echo "Deployment failed: container not healthy"
docker logs --tail 50 "${CONTAINER_NAME}" >&2 || true
exit 1
