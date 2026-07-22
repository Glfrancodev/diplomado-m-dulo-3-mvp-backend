#!/usr/bin/env bash
# ============================================================================
# provision.sh — Crea TODA la infra AWS para desplegar phoenix-backend por ECR:
#   1. Repositorio ECR (guarda la imagen Docker).
#   2. IAM Role + Instance Profile para la EC2 (lectura de ECR, sin claves).
#   3. Usuario IAM para GitHub Actions (push a ECR) + access keys.
#   4. Key pair SSH.
#   5. Security Group (22 SSH + 3000 API).
#   6. EC2 Amazon Linux 2023 con Docker + Compose (perfil IAM adjunto).
#
# Requisitos: AWS CLI v2 ya configurado (aws configure). Idempotente: se puede
# re-ejecutar; salta lo que ya exista.
#
# Uso:
#   export AWS_REGION=us-east-1        # opcional (default us-east-1)
#   bash infra/aws/provision.sh
#
# Al final imprime TODOS los valores para cargar en GitHub Secrets.
# ============================================================================
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-phoenix-orders}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
ECR_REPO="${ECR_REPO:-phoenix-orders-backend}"
ECR_REPO_FRONTEND="${ECR_REPO_FRONTEND:-phoenix-frontend}"
KEY_NAME="${KEY_NAME:-${NAME_PREFIX}-key}"
SG_NAME="${SG_NAME:-${NAME_PREFIX}-sg}"
ROLE_NAME="${ROLE_NAME:-${NAME_PREFIX}-ec2-role}"
PROFILE_NAME="${PROFILE_NAME:-${NAME_PREFIX}-ec2-profile}"
CI_USER="${CI_USER:-${NAME_PREFIX}-ci}"
CI_USER_FRONTEND="${CI_USER_FRONTEND:-phoenix-frontend-ci}"

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/output"
mkdir -p "$OUT_DIR"

# Helper: convierte una ruta a file://<ruta-windows> si estamos en Git Bash.
awsfile() {
  if command -v cygpath >/dev/null 2>&1; then
    echo "file://$(cygpath -w "$1")"
  else
    echo "file://$1"
  fi
}

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ---------------------------------------------------------------------------
# 0) Credenciales de la BD: se autogeneran una vez y se PERSISTEN.
#    Se reusan en re-ejecuciones para no romper el volumen de Postgres.
# ---------------------------------------------------------------------------
gen_pw() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24
  fi
}

DB_CREDS_FILE="$OUT_DIR/db-creds.env"
if [[ -f "$DB_CREDS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$DB_CREDS_FILE"
  echo "==> Credenciales de BD reutilizadas de $DB_CREDS_FILE"
else
  DB_USER="${DB_USER:-phoenix}"
  DB_NAME="${DB_NAME:-phoenix_orders}"
  DB_PORT="${DB_PORT:-5432}"
  DB_PASSWORD="$(gen_pw)"
  CORS_ORIGIN="${CORS_ORIGIN:-*}"
  cat > "$DB_CREDS_FILE" <<EOF
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_PORT=$DB_PORT
CORS_ORIGIN=$CORS_ORIGIN
EOF
  echo "==> Credenciales de BD generadas y guardadas en $DB_CREDS_FILE"
fi

echo "==> Cuenta AWS : $ACCOUNT_ID"
echo "==> Región     : $REGION"
echo "==> Registro   : $REGISTRY"
echo ""

# ---------------------------------------------------------------------------
# 1) Repositorio ECR
# ---------------------------------------------------------------------------
for REPO in "$ECR_REPO" "$ECR_REPO_FRONTEND"; do
  if aws ecr describe-repositories --region "$REGION" --repository-names "$REPO" &>/dev/null; then
    echo "==> ECR '$REPO' ya existe."
  else
    echo "==> Creando repositorio ECR '$REPO'..."
    aws ecr create-repository \
      --region "$REGION" \
      --repository-name "$REPO" \
      --image-scanning-configuration scanOnPush=true \
      --query 'repository.repositoryUri' --output text
  fi
done

# ---------------------------------------------------------------------------
# 2) IAM Role + Instance Profile para la EC2 (lectura de ECR)
# ---------------------------------------------------------------------------
TRUST_FILE="$OUT_DIR/ec2-trust-policy.json"
cat > "$TRUST_FILE" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}
JSON

if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "==> IAM Role '$ROLE_NAME' ya existe."
else
  echo "==> Creando IAM Role '$ROLE_NAME'..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$(awsfile "$TRUST_FILE")" >/dev/null
fi

echo "==> Adjuntando política de lectura a ECR al rol..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

if aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" &>/dev/null; then
  echo "==> Instance Profile '$PROFILE_NAME' ya existe."
else
  echo "==> Creando Instance Profile '$PROFILE_NAME'..."
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
fi

# Adjuntar el rol al profile (ignora error si ya está)
aws iam add-role-to-instance-profile \
  --instance-profile-name "$PROFILE_NAME" \
  --role-name "$ROLE_NAME" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3) Usuarios IAM para GitHub Actions (push a ECR) + access keys
#    Uno para el backend y otro para el frontend (mismas capacidades, keys
#    independientes). AmazonEC2ContainerRegistryPowerUser permite push/pull a
#    CUALQUIER repo ECR de la cuenta.
# ---------------------------------------------------------------------------
# create_ci_user <username> <creds-file>
# Deja las claves en las globales CI_KEY_ID y CI_KEY_SECRET.
create_ci_user() {
  local user="$1" file="$2" existing json
  if aws iam get-user --user-name "$user" &>/dev/null; then
    echo "==> Usuario IAM CI '$user' ya existe."
  else
    echo "==> Creando usuario IAM '$user'..."
    aws iam create-user --user-name "$user" >/dev/null
  fi
  aws iam attach-user-policy --user-name "$user" \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
  existing="$(aws iam list-access-keys --user-name "$user" --query 'length(AccessKeyMetadata)' --output text)"
  if [[ "$existing" -gt 0 ]]; then
    echo "==> '$user' ya tiene access keys (no se regeneran; el secret no es recuperable)."
    echo "    Si necesitás nuevas: borrá la vieja en IAM y re-ejecutá."
    CI_KEY_ID="(ya existe — ver IAM)"
    CI_KEY_SECRET="(ya existe — no recuperable)"
  else
    echo "==> Generando access keys para '$user'..."
    json="$(aws iam create-access-key --user-name "$user")"
    CI_KEY_ID="$(echo "$json" | grep -o '"AccessKeyId"[^,]*' | sed 's/.*: *"\(.*\)".*/\1/')"
    CI_KEY_SECRET="$(echo "$json" | grep -o '"SecretAccessKey"[^,]*' | sed 's/.*: *"\(.*\)".*/\1/')"
    cat > "$file" <<EOF
AWS_ACCESS_KEY_ID=$CI_KEY_ID
AWS_SECRET_ACCESS_KEY=$CI_KEY_SECRET
EOF
    echo "    Guardadas en: $file (gitignored)."
  fi
}

# Backend CI
create_ci_user "$CI_USER" "$OUT_DIR/ci-credentials.txt"
AWS_ACCESS_KEY_ID_OUT="$CI_KEY_ID"
AWS_SECRET_ACCESS_KEY_OUT="$CI_KEY_SECRET"

# Frontend CI
create_ci_user "$CI_USER_FRONTEND" "$OUT_DIR/ci-credentials-frontend.txt"
FE_AWS_ACCESS_KEY_ID_OUT="$CI_KEY_ID"
FE_AWS_SECRET_ACCESS_KEY_OUT="$CI_KEY_SECRET"

# ---------------------------------------------------------------------------
# 4) Key pair SSH
# ---------------------------------------------------------------------------
KEY_FILE="$OUT_DIR/${KEY_NAME}.pem"
if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" &>/dev/null; then
  echo "==> Key pair '$KEY_NAME' ya existe."
  [[ -f "$KEY_FILE" ]] || echo "    AVISO: no está $KEY_FILE localmente. Si lo perdiste, borrá el key pair y re-ejecutá."
else
  echo "==> Creando key pair '$KEY_NAME'..."
  aws ec2 create-key-pair --region "$REGION" --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  echo "    Guardada en: $KEY_FILE"
fi

# ---------------------------------------------------------------------------
# 5) Security Group (22 SSH + 3000 API)
# ---------------------------------------------------------------------------
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "ERROR: no hay VPC default en $REGION."
  exit 1
fi

SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  echo "==> Creando security group '$SG_NAME'..."
  SG_ID="$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" --description "Phoenix - SSH + HTTP (EC2 compartida front+back)" \
    --vpc-id "$VPC_ID" --query 'GroupId' --output text)"
  # 80 = nginx del frontend (única entrada pública). 22 = SSH del deploy.
  # El backend NO se publica (corre en la red 'web', detrás del proxy) -> sin 3000.
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions \
    'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0,Description=SSH}]' \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]'
else
  echo "==> Security group existente: $SG_ID"
fi

# ---------------------------------------------------------------------------
# 6) EC2 Amazon Linux 2023 con Docker + Compose + perfil IAM
# ---------------------------------------------------------------------------
# ¿Ya hay una instancia viva con nuestro tag? Reutilizarla.
INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=${NAME_PREFIX}" "Name=instance-state-name,Values=pending,running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)"

if [[ -n "$INSTANCE_ID" && "$INSTANCE_ID" != "None" ]]; then
  echo "==> Reutilizando instancia existente: $INSTANCE_ID"
else
  # 1º intento: SSM public parameter (kernel default).
  AMI_ID="$(aws ssm get-parameter --region "$REGION" \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query 'Parameter.Value' --output text 2>/dev/null || true)"
  # 2º intento: describe-images (algunas cuentas/regiones no tienen el SSM param).
  if [[ -z "$AMI_ID" || "$AMI_ID" != ami-* ]]; then
    echo "==> SSM sin AMI; buscando con describe-images..."
    AMI_ID="$(aws ec2 describe-images --region "$REGION" --owners amazon \
      --filters \
        "Name=name,Values=al2023-ami-2023.*-kernel-*-x86_64" \
        "Name=state,Values=available" \
        "Name=architecture,Values=x86_64" \
        "Name=virtualization-type,Values=hvm" \
        "Name=root-device-type,Values=ebs" \
      --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text 2>/dev/null || true)"
  fi
  if [[ -z "$AMI_ID" || "$AMI_ID" != ami-* ]]; then
    echo "ERROR: no se pudo obtener el AMI de Amazon Linux 2023 en $REGION."
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
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# Red Docker COMPARTIDA: la crean acá para que exista antes del primer deploy
# de cualquiera de los dos equipos (frontend nginx <-> backend).
docker network create web 2>/dev/null || true
# AWS CLI v2 ya viene preinstalado en Amazon Linux 2023 (/usr/bin/aws).
EOF
  if command -v cygpath >/dev/null 2>&1; then
    USER_DATA_ARG="fileb://$(cygpath -w "$USER_DATA")"
  else
    USER_DATA_ARG="fileb://$USER_DATA"
  fi

  echo "==> Lanzando EC2 ($INSTANCE_TYPE) con perfil IAM (reintentos por propagación)..."
  for attempt in 1 2 3 4 5 6; do
    if INSTANCE_ID="$(aws ec2 run-instances --region "$REGION" \
      --image-id "$AMI_ID" \
      --instance-type "$INSTANCE_TYPE" \
      --key-name "$KEY_NAME" \
      --security-group-ids "$SG_ID" \
      --iam-instance-profile "Name=$PROFILE_NAME" \
      --user-data "$USER_DATA_ARG" \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME_PREFIX}}]" \
      --query 'Instances[0].InstanceId' --output text 2>/dev/null)"; then
      echo "    InstanceId: $INSTANCE_ID"
      break
    fi
    echo "    Perfil IAM aún propagando, reintento $attempt/6 en 10s..."
    sleep 10
  done

  if [[ -z "${INSTANCE_ID:-}" || "$INSTANCE_ID" == "None" ]]; then
    echo "ERROR: no se pudo lanzar la instancia."
    exit 1
  fi
fi

echo "==> Esperando que la instancia esté running..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
PUBLIC_IP="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"

cat > "$OUT_DIR/infra-info.txt" <<EOF
REGION=$REGION
ACCOUNT_ID=$ACCOUNT_ID
REGISTRY=$REGISTRY
ECR_REPO=$ECR_REPO
INSTANCE_ID=$INSTANCE_ID
PUBLIC_IP=$PUBLIC_IP
KEY_FILE=$KEY_FILE
SSH=ssh -i $KEY_FILE ec2-user@$PUBLIC_IP
EOF

# Contenido del .pem (para el secret EC2_SSH_KEY). Puede no estar si el key
# pair ya existía de antes y se perdió el archivo local.
if [[ -f "$KEY_FILE" ]]; then
  EC2_SSH_KEY_OUT="$(cat "$KEY_FILE")"
else
  EC2_SSH_KEY_OUT="(no disponible: falta $KEY_FILE — borrá el key pair en AWS y re-ejecutá)"
fi

# Ensamblar el archivo de secrets listo para copiar/pegar.
SECRETS_FILE="$OUT_DIR/github-secrets.txt"
cat > "$SECRETS_FILE" <<EOF
# ====== GitHub Secrets — Settings > Secrets and variables > Actions ======
# Copiá el nombre y el valor de cada uno. (AWS_REGION y ECR_REPOSITORY NO van
# como secrets: ya están fijos en el env del workflow.)

AWS_ACCESS_KEY_ID
$AWS_ACCESS_KEY_ID_OUT

AWS_SECRET_ACCESS_KEY
$AWS_SECRET_ACCESS_KEY_OUT

EC2_HOST
$PUBLIC_IP

EC2_USER
ec2-user

DB_USER
$DB_USER

DB_PASSWORD
$DB_PASSWORD

DB_NAME
$DB_NAME

DB_PORT
$DB_PORT

CORS_ORIGIN
$CORS_ORIGIN

EC2_SSH_KEY
$EC2_SSH_KEY_OUT
EOF

# Secrets del FRONTEND (mismo esquema de keys; sin DB, sin OIDC).
SECRETS_FILE_FE="$OUT_DIR/github-secrets-frontend.txt"
cat > "$SECRETS_FILE_FE" <<EOF
# ====== GitHub Secrets del FRONTEND — Settings > Secrets and variables > Actions ======
# Mismo esquema que el backend: access keys (NO OIDC). AWS_REGION y el nombre del
# repo ECR (phoenix-frontend) van fijos en el env del workflow del frontend.

AWS_ACCESS_KEY_ID
$FE_AWS_ACCESS_KEY_ID_OUT

AWS_SECRET_ACCESS_KEY
$FE_AWS_SECRET_ACCESS_KEY_OUT

EC2_HOST
$PUBLIC_IP

EC2_USER
ec2-user

EC2_SSH_KEY
$EC2_SSH_KEY_OUT
EOF

echo ""
echo "================= LISTO ================="
echo "Instance ID : $INSTANCE_ID"
echo "Public IP   : $PUBLIC_IP"
echo "SSH         : ssh -i \"$KEY_FILE\" ec2-user@$PUBLIC_IP"
echo "Entrada web : http://$PUBLIC_IP/   (nginx del frontend, tras su deploy)"
echo "El backend NO se publica: corre como 'backend:3000' en la red Docker 'web'."
echo ""
echo "===== GitHub Secrets del BACKEND (copiar/pegar) ====="
cat "$SECRETS_FILE"
echo ""
echo "====================================================="
echo "Todo lo de arriba también quedó guardado en:"
echo "  $SECRETS_FILE   (gitignored)"
echo ""
echo "Nota: el workflow ya usa AWS_REGION=$REGION y ECR_REPOSITORY=$ECR_REPO (env del YAML)."
echo ""
echo "===== GitHub Secrets del FRONTEND (copiar/pegar) ====="
cat "$SECRETS_FILE_FE"
echo ""
echo "====================================================="
echo "Guardado también en: $SECRETS_FILE_FE   (gitignored)"
echo ""
echo "Este script YA creó TODO lo que el frontend necesita en AWS:"
echo "  - Repo ECR '$ECR_REPO_FRONTEND' (scanOnPush)."
echo "  - Usuario IAM CI '$CI_USER_FRONTEND' con sus access keys (arriba)."
echo "  - EC2 compartida + Instance Profile (pull de cualquier ECR)."
echo "  - Security Group con 22 (SSH) y 80 (HTTP/nginx)."
echo "  - Red Docker 'web' creada en la instancia."
echo "El frontend NO debe crear otra EC2 ni nada en AWS: solo pega estos secrets,"
echo "y en su workflow usa AWS_REGION=$REGION y ECR_REPOSITORY=$ECR_REPO_FRONTEND (env)."
echo "Su nginx corre en la red 'web', publica :80 y proxya /api -> http://backend:3000."
echo ""
echo "Esperá ~1-2 min a que user-data instale Docker antes del primer deploy."
