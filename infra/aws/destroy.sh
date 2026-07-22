#!/usr/bin/env bash
# ============================================================================
# destroy.sh — Elimina TODO lo creado por provision.sh (ahorra créditos):
#   EC2, Security Group, Key pair, Instance Profile + Role, usuario IAM CI y
#   (opcional) el repositorio ECR con sus imágenes.
#
# Uso:
#   export AWS_REGION=us-east-1
#   bash infra/aws/destroy.sh
#   KEEP_ECR=true bash infra/aws/destroy.sh   # conserva el repo/imagen ECR
# ============================================================================
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-phoenix-orders}"
ECR_REPO="${ECR_REPO:-phoenix-orders-backend}"
ECR_REPO_FRONTEND="${ECR_REPO_FRONTEND:-phoenix-frontend}"
KEY_NAME="${KEY_NAME:-${NAME_PREFIX}-key}"
SG_NAME="${SG_NAME:-${NAME_PREFIX}-sg}"
ROLE_NAME="${ROLE_NAME:-${NAME_PREFIX}-ec2-role}"
PROFILE_NAME="${PROFILE_NAME:-${NAME_PREFIX}-ec2-profile}"
CI_USER="${CI_USER:-${NAME_PREFIX}-ci}"
CI_USER_FRONTEND="${CI_USER_FRONTEND:-phoenix-frontend-ci}"
KEEP_ECR="${KEEP_ECR:-false}"

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/output"

# --- EC2 ---
INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=${NAME_PREFIX}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)"
if [[ -n "$INSTANCE_ID" && "$INSTANCE_ID" != "None" ]]; then
  echo "==> Terminando instancia $INSTANCE_ID..."
  aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
  aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID"
  echo "    Terminada."
else
  echo "==> No se encontró instancia para terminar."
fi

# --- Security Group ---
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"
if [[ -n "$SG_ID" && "$SG_ID" != "None" ]]; then
  echo "==> Eliminando security group $SG_ID..."
  for i in 1 2 3 4 5; do
    if aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID" 2>/dev/null; then
      echo "    Eliminado."; break
    fi
    echo "    En uso, reintento $i/5 en 10s..."; sleep 10
  done
fi

# --- Key pair ---
if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" &>/dev/null; then
  echo "==> Eliminando key pair '$KEY_NAME'..."
  aws ec2 delete-key-pair --region "$REGION" --key-name "$KEY_NAME"
fi

# --- Instance Profile + Role ---
if aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" &>/dev/null; then
  echo "==> Desmontando instance profile '$PROFILE_NAME'..."
  aws iam remove-role-from-instance-profile --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE_NAME" 2>/dev/null || true
  aws iam delete-instance-profile --instance-profile-name "$PROFILE_NAME" 2>/dev/null || true
fi
if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "==> Eliminando IAM role '$ROLE_NAME'..."
  aws iam detach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly 2>/dev/null || true
  aws iam delete-role --role-name "$ROLE_NAME" 2>/dev/null || true
fi

# --- Usuarios IAM CI (backend y frontend; borra sus access keys primero) ---
for U in "$CI_USER" "$CI_USER_FRONTEND"; do
  if aws iam get-user --user-name "$U" &>/dev/null; then
    echo "==> Eliminando usuario IAM CI '$U'..."
    for KID in $(aws iam list-access-keys --user-name "$U" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
      aws iam delete-access-key --user-name "$U" --access-key-id "$KID" 2>/dev/null || true
    done
    aws iam detach-user-policy --user-name "$U" \
      --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser 2>/dev/null || true
    aws iam delete-user --user-name "$U" 2>/dev/null || true
  fi
done

# --- ECR (opcional) ---
if [[ "$KEEP_ECR" == "true" ]]; then
  echo "==> Conservando repositorios ECR (KEEP_ECR=true)."
else
  for REPO in "$ECR_REPO" "$ECR_REPO_FRONTEND"; do
    if aws ecr describe-repositories --region "$REGION" --repository-names "$REPO" &>/dev/null; then
      echo "==> Eliminando repositorio ECR '$REPO' (con sus imágenes)..."
      aws ecr delete-repository --region "$REGION" --repository-name "$REPO" --force >/dev/null
    fi
  done
fi

rm -f "$OUT_DIR/infra-info.txt" "$OUT_DIR/user-data.sh" "$OUT_DIR/ec2-trust-policy.json"
# Se conservan el .pem y ci-credentials.txt locales por si acaso.

echo "================= DESTRUIDO ================="
