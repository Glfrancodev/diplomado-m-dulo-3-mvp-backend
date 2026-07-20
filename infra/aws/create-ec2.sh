#!/usr/bin/env bash
# Crea 1 EC2 (Amazon Linux 2023) con Docker listo para phoenix-backend y phoenix-frontend.
# Requisitos: AWS CLI v2 configurado (aws configure) + permisos EC2.
# Uso:
#   export AWS_REGION=us-east-1
#   bash infra/aws/create-ec2.sh
#
# Al terminar imprime: Public IP, Instance ID, y dónde está la clave SSH.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-phoenix-orders}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
KEY_NAME="${KEY_NAME:-${NAME_PREFIX}-key}"
SG_NAME="${SG_NAME:-${NAME_PREFIX}-sg}"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/output"
mkdir -p "$OUT_DIR"

echo "==> Región: $REGION"

# --- Key pair ---
KEY_FILE="$OUT_DIR/${KEY_NAME}.pem"
if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" &>/dev/null; then
  echo "==> Key pair '$KEY_NAME' ya existe (no se regenera el .pem)."
  if [[ ! -f "$KEY_FILE" ]]; then
    echo "AVISO: no está $KEY_FILE. Si perdiste el .pem, borrá el key pair en AWS y reejecutá."
  fi
else
  echo "==> Creando key pair '$KEY_NAME'..."
  aws ec2 create-key-pair \
    --region "$REGION" \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' \
    --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  echo "    Guardada en: $KEY_FILE"
fi

# --- Security group ---
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "ERROR: no hay VPC default en $REGION. Creá una VPC default o editá el script."
  exit 1
fi

SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  echo "==> Creando security group '$SG_NAME'..."
  SG_ID="$(aws ec2 create-security-group \
    --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "Phoenix Orders - SSH, HTTP, API" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)"

  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions \
    'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0,Description=SSH}]' \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP-front}]' \
    'IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges=[{CidrIp=0.0.0.0/0,Description=API-back}]'
else
  echo "==> Security group existente: $SG_ID"
fi

# --- AMI Amazon Linux 2023 ---
AMI_ID=""
AMI_ID="$(aws ssm get-parameter \
  --region "$REGION" \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text 2>/dev/null || true)"

if [[ -z "$AMI_ID" || "$AMI_ID" == "None" ]]; then
  echo "==> SSM no devolvió AMI; buscando con describe-images..."
  AMI_ID="$(aws ec2 describe-images \
    --region "$REGION" \
    --owners amazon \
    --filters \
      "Name=name,Values=al2023-ami-202*-kernel-*-x86_64" \
      "Name=state,Values=available" \
      "Name=architecture,Values=x86_64" \
      "Name=virtualization-type,Values=hvm" \
      "Name=root-device-type,Values=ebs" \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' \
    --output text 2>/dev/null || true)"
fi

if [[ -z "$AMI_ID" || "$AMI_ID" == "None" ]]; then
  # Fallback más amplio por nombre
  AMI_ID="$(aws ec2 describe-images \
    --region "$REGION" \
    --owners amazon \
    --filters \
      "Name=name,Values=al2023-ami-*-x86_64" \
      "Name=state,Values=available" \
      "Name=architecture,Values=x86_64" \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' \
    --output text 2>/dev/null || true)"
fi

if [[ -z "$AMI_ID" || "$AMI_ID" == "None" || "$AMI_ID" != ami-* ]]; then
  echo "ERROR: no se pudo obtener un AMI ID válido en $REGION (obtuve: '$AMI_ID')."
  echo "Probá: aws ssm get-parameter --region $REGION --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
  exit 1
fi

echo "==> AMI: $AMI_ID"

USER_DATA="$OUT_DIR/user-data.sh"
cat > "$USER_DATA" <<'EOF'
#!/bin/bash
set -e
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
# Compose plugin (opcional)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
EOF

# AWS CLI en Windows no entiende rutas Git Bash (/c/...). Usamos ruta Windows (cygpath)
# o, si no hay cygpath, el contenido en texto plano (CLI lo encodea solo).
if command -v cygpath >/dev/null 2>&1; then
  USER_DATA_ARG="fileb://$(cygpath -w "$USER_DATA")"
else
  USER_DATA_ARG="$(cat "$USER_DATA")"
fi

echo "==> Lanzando EC2 ($INSTANCE_TYPE)..."
INSTANCE_ID="$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --user-data "$USER_DATA_ARG" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME_PREFIX}}]" \
  --query 'Instances[0].InstanceId' --output text)"

echo "    InstanceId: $INSTANCE_ID"
echo "==> Esperando que esté running..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"

cat > "$OUT_DIR/ec2-info.txt" <<EOF
REGION=$REGION
INSTANCE_ID=$INSTANCE_ID
PUBLIC_IP=$PUBLIC_IP
KEY_FILE=$KEY_FILE
SSH=ssh -i $KEY_FILE ec2-user@$PUBLIC_IP
EOF

echo ""
echo "========== LISTO =========="
echo "Instance ID : $INSTANCE_ID"
echo "Public IP   : $PUBLIC_IP"
echo "SSH         : ssh -i \"$KEY_FILE\" ec2-user@$PUBLIC_IP"
echo ""
echo "GitHub Secrets a actualizar (backend Y frontend):"
echo "  EC2_HOST     = $PUBLIC_IP"
echo "  EC2_USER     = ec2-user"
echo "  EC2_SSH_KEY  = (contenido completo del archivo .pem)"
echo ""
echo "Esperá ~1-2 min a que user-data instale Docker antes del primer deploy."
echo "Info guardada en: $OUT_DIR/ec2-info.txt"
