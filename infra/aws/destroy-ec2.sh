#!/usr/bin/env bash
# Elimina la EC2 y recursos asociados creados por create-ec2.sh (ahorra créditos).
# Uso:
#   export AWS_REGION=us-east-1
#   bash infra/aws/destroy-ec2.sh
# Opcional: INSTANCE_ID=i-xxxx bash infra/aws/destroy-ec2.sh

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-phoenix-orders}"
KEY_NAME="${KEY_NAME:-${NAME_PREFIX}-key}"
SG_NAME="${SG_NAME:-${NAME_PREFIX}-sg}"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/output"
INFO_FILE="$OUT_DIR/ec2-info.txt"

INSTANCE_ID="${INSTANCE_ID:-}"
if [[ -z "$INSTANCE_ID" && -f "$INFO_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$INFO_FILE"
fi

if [[ -z "${INSTANCE_ID:-}" || "$INSTANCE_ID" == "None" ]]; then
  INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=${NAME_PREFIX}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)"
fi

if [[ -n "${INSTANCE_ID:-}" && "$INSTANCE_ID" != "None" ]]; then
  echo "==> Terminando instancia $INSTANCE_ID..."
  aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
  aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID"
  echo "    Terminada."
else
  echo "==> No se encontró instancia para terminar."
fi

# Security group (solo si no queda en uso)
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"

if [[ -n "$SG_ID" && "$SG_ID" != "None" ]]; then
  echo "==> Eliminando security group $SG_ID..."
  # Reintentos por si AWS aún asocia la ENI
  for i in 1 2 3 4 5; do
    if aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID" 2>/dev/null; then
      echo "    Eliminado."
      break
    fi
    echo "    En uso, reintento $i/5 en 10s..."
    sleep 10
  done
fi

if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" &>/dev/null; then
  echo "==> Eliminando key pair '$KEY_NAME'..."
  aws ec2 delete-key-pair --region "$REGION" --key-name "$KEY_NAME"
fi

rm -f "$OUT_DIR/ec2-info.txt" "$OUT_DIR/user-data.sh"
# Conservamos el .pem local por si acaso; descomentá para borrarlo:
# rm -f "$OUT_DIR/${KEY_NAME}.pem"

echo "========== DESTRUIDO =========="
echo "Recordá: Docker Hub no se borra con este script (no genera costo de cómputo)."
