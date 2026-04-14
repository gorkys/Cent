# PostgreSQL Self-Host Guide

PostgreSQL 自托管说明已经整合进根目录的 [`README.md`](../README.md) 和 [`README_EN.md`](../README_EN.md)。

如果你只想快速启动，最短路径是：

```bash
cp .env.docker.example .env
docker compose up -d
```

默认生产编排通常只需要修改这 3 项：

- `WEB_PORT`
- `POSTGRES_PASSWORD`
- `POSTGRES_API_AUTH_SECRET`

对应示例：

```env
WEB_PORT=3458
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_API_AUTH_SECRET=<auth-secret>
```

启动后访问：

```text
http://localhost:3458
```

同源健康检查地址：

```text
http://localhost:3458/api/postgres/health
```

默认部署只对外暴露 `web` 服务端口。`api` 保持在容器内部网络中，由 `web` 容器内的 nginx 转发 `/api/postgres` 请求。
