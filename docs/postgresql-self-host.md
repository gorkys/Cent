# PostgreSQL Self-Host Guide

PostgreSQL 自托管方案已经整合进根目录 [`README.md`](../README.md) 和 [`README_EN.md`](../README_EN.md)。

优先查看以下章节：

- `本次升级了什么`
- `本地开发`
- `Docker 部署`
- `以后推到 GitHub 后怎么更新`

如果你只是想快速启动，最短路径是：

```bash
cp .env.docker.example .env
docker compose up -d --build
```

然后访问：

```text
http://localhost:3458
```

后端健康检查默认地址：

```text
http://localhost:3459/api/postgres/health
```
