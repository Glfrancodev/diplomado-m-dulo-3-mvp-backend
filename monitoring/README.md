# Monitoreo en tiempo real — Falco + Prometheus + Grafana (Clase 6)

Stack de observabilidad de seguridad **aditivo**: no toca el Dockerfile, el
pipeline ni el `docker-compose.yml` de la app. Se levanta por separado en el
**mismo host** donde corren `backend` y `phoenix-db` (la EC2), para vigilarlos.

## Componentes

| Servicio | Rol | Puerto host |
|---|---|---|
| **falco** | Detecta amenazas en runtime (syscalls por eBPF): shells, gestores de paquetes, etc. | — |
| **falcosidekick** | Recibe alertas de Falco y expone `/metrics` para Prometheus (reemplaza al deprecado `falco-exporter`) | 2801 |
| **cadvisor** | Métricas de recursos (CPU/RAM/IO) de cada contenedor | 8081 |
| **prometheus** | Recolecta métricas de falcosidekick y cadvisor | 9090 |
| **grafana** | Dashboards en tiempo real (datasource + dashboard provisionados) | 3001 |

Flujo: `Falco → (HTTP) → Falcosidekick → /metrics → Prometheus → Grafana`.

## Requisito importante
Falco monitorea a nivel de **kernel**, así que necesita un **host Linux real**.
Funciona en la **EC2 (Amazon Linux 2023, kernel 6.1)** con el driver `modern_ebpf`.
**No** funciona de forma fiable en Docker Desktop (Windows/Mac) porque corre en
una VM. Por eso este stack se prueba en la EC2.

## Cómo levantarlo (en la EC2)

```bash
# 1) Copiar la carpeta monitoring/ a la EC2 (o hacer git pull ahí).
scp -i infra/aws/output/phoenix-orders-key.pem -r monitoring ec2-user@<EC2_HOST>:~/

# 2) En la EC2:
ssh -i infra/aws/output/phoenix-orders-key.pem ec2-user@<EC2_HOST>
cd monitoring
docker compose -f docker-compose.monitoring.yml up -d

# 3) Ver que Falco arrancó y cargó las reglas:
docker logs falco | grep -i "rules loaded\|Loading rules"
```

## Acceso a Grafana (sin abrir puertos al mundo)
El Security Group solo tiene 22 y 80 abiertos (buena práctica). Para ver Grafana
sin exponerlo, usá un **túnel SSH** desde tu máquina:

```bash
ssh -i infra/aws/output/phoenix-orders-key.pem -L 3001:localhost:3001 ec2-user@<EC2_HOST>
```
Luego abrí **http://localhost:3001** (usuario/clave: `admin` / `admin` por
defecto; cambialos con las envs `GRAFANA_USER` / `GRAFANA_PASSWORD`).
El dashboard **"Phoenix Orders — Seguridad (Falco) y Recursos"** ya viene cargado.

> Si preferís acceso directo, abrí el puerto 3001 en el Security Group — pero el
> túnel SSH es más seguro y no requiere tocar la infra.

## Probar que las reglas de Falco funcionan
Disparás una alerta abriendo una shell en el backend (lo que la Regla 1 detecta):

```bash
docker exec -it backend sh
```
En segundos, en `docker logs falco` y en el dashboard de Grafana aparece la
alerta **CRITICAL "Shell abierta en el contenedor backend"**. Probá también:

```bash
docker exec backend apk info      # dispara "Instalacion de paquetes..."
```

## Reglas personalizadas
Están en [`falco/falco_rules.local.yaml`](falco/falco_rules.local.yaml):
1. **Shell abierta en el contenedor backend** (CRITICAL) — excluye la shell
   legítima del arranque (hija de `tini`), así que no da falsos positivos.
2. **Instalación de paquetes en el contenedor backend** (CRITICAL) — `apk`, `npm`,
   `apt`, etc.

## Nota sobre el pipeline
Este stack es de **runtime/observabilidad**, independiente del CI/CD. No se
construye ni despliega con el pipeline de la app. Si quisieras automatizar su
arranque en la EC2, se haría con un paso `docker compose up -d` separado, pero
NO se toca el `deploy.yml` existente.
