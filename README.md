# Cent

Cent 是基于上游 [glink25/Cent](https://github.com/glink25/Cent) 改造的 PostgreSQL 自托管版本。它保留了原项目成熟的账本体验、IndexedDB 本地缓存和同步机制，同时补齐了账号体系、服务端持久化和更适合生产使用的 Docker 部署方案。

## 核心能力

- 多账本、多成员、分类、标签、预算、统计分析
- IndexedDB 本地缓存与同步机制
- PostgreSQL 持久化与自动建表
- 用户注册、登录、令牌鉴权
- 首个注册用户自动成为 `admin`
- 管理员可管理用户，并动态开关开放注册
- Docker 自托管，默认拓扑为 `postgres + api + web`

## 与上游的主要差异

相较于上游 [glink25/Cent](https://github.com/glink25/Cent)，当前版本新增了：

- `server/` Node.js API
- PostgreSQL 存储实现
- 前端 PostgreSQL 端点接入
- 账号密码注册与登录
- 默认生产可用的 Docker Compose 编排

## 部署结构

默认生产部署包含 3 个服务：

- `postgres`：负责数据持久化
- `api`：负责鉴权、账本、账单、附件和用户接口
- `web`：负责提供前端静态资源，并将 `/api/postgres` 转发到内部 `api`

默认情况下只对外暴露 `web` 服务端口。外层反向代理只需要指向 `127.0.0.1:3458`，仓库内的 nginx 会继续负责前端静态资源和 API 转发。

## 快速开始

仓库根目录的 [`docker-compose.yml`](./docker-compose.yml) 已经是简化后的生产编排。常规部署下，通常只需要修改这 3 个值：

```env
WEB_PORT=3458
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_API_AUTH_SECRET=<auth-secret>
```

### 使用仓库默认编排

复制 [`.env.docker.example`](./.env.docker.example) 为 `.env`：

```bash
cp .env.docker.example .env
```

修改其中带尖括号的值后，直接启动：

```bash
docker compose up -d
```

启动后访问：

- 前端：`http://localhost:3458`
- 同源健康检查：`http://localhost:3458/api/postgres/health`

### 可直接复制的最简编排

下面这份示例与仓库默认拓扑等价，适合需要直接复制粘贴使用的场景。需要你手动修改的地方都用 `<...>` 标出：

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cent
      POSTGRES_PASSWORD: <postgres-password>
      POSTGRES_DB: cent
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -h 127.0.0.1 -p 5432 -U $$POSTGRES_USER -d $$POSTGRES_DB",
        ]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 30s

  api:
    image: gorkys/cent-api:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      POSTGRES_API_AUTH_SECRET: <auth-secret>
      POSTGRES_HOST: postgres
      POSTGRES_USER: cent
      POSTGRES_PASSWORD: <postgres-password>
      POSTGRES_DATABASE: cent
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3459/api/postgres/health').then((response)=>{if(!response.ok)process.exit(1);}).catch(()=>process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s

  web:
    image: gorkys/cent:latest
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "<web-port>:80"

volumes:
  postgres-data:
```

如果你不需要改端口，`<web-port>` 直接写成 `3458` 即可。

## 初始化流程

服务启动后：

1. 打开首页
2. 点击 `注册账号`
3. 创建第一个用户
4. 第一个注册用户会自动成为 `admin`
5. 创建账本并开始使用

## 管理员与注册机制

当前版本已经补齐基础管理能力：

- 首个注册用户自动成为管理员
- 管理员可在界面中查看、创建、编辑、删除用户
- 管理员可动态开关“是否允许开放注册”
- 登录页会根据系统设置自动显示或隐藏“注册账号”

Docker 部署下，用户不需要手动输入 PostgreSQL API 地址。

## 本地开发

### 环境要求

- Node.js 20+
- pnpm
- PostgreSQL 15+

### 前端环境变量

复制 [`.env.example`](./.env.example)：

```bash
cp .env.example .env.local
```

关键默认值：

```env
VITE_POSTGRES_API_HOST="/api/postgres"
VITE_POSTGRES_PROXY_TARGET="http://127.0.0.1:3459"
```

### 后端环境变量

复制 [`server/.env.example`](./server/.env.example)：

```bash
cp server/.env.example server/.env
```

最小配置示例：

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_DATABASE=cent
```

### 启动开发环境

```bash
pnpm install
npm run server
pnpm dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:3459/api/postgres`

## 常用运维命令

查看服务状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f web
docker compose logs -f api
docker compose logs -f postgres
```

停止服务：

```bash
docker compose down
```

删除容器和数据库卷：

```bash
docker compose down -v
```

`docker compose down -v` 会删除 PostgreSQL 数据卷，执行前请先确认已完成备份。

## 项目结构

```text
.
├─ src/                      # React + Vite 前端
├─ server/                   # Node.js + PostgreSQL API
├─ docker/nginx/             # Web 容器内的 Nginx 配置
├─ docs/                     # 补充说明文档
├─ Dockerfile                # 前端镜像构建
├─ server/Dockerfile         # 后端镜像构建
└─ docker-compose.yml        # 默认生产编排
```

补充文档：

- [`docs/postgresql-self-host.md`](./docs/postgresql-self-host.md)
- [`docs/postgresql-migration-todo.md`](./docs/postgresql-migration-todo.md)

## 与上游同步

如果需要继续同步上游 [glink25/Cent](https://github.com/glink25/Cent)，建议使用标准 Git 流程：

```bash
git checkout main
git fetch upstream
git merge upstream/main
```

同步后建议至少执行：

```bash
npm run lint
npm run build
```

## 许可与上游

- License: `CC BY-NC-SA 4.0`
- Upstream: [glink25/Cent](https://github.com/glink25/Cent)
