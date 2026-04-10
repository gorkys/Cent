# Cent

基于原版 [glink25/Cent](https://github.com/glink25/Cent) 改造的 MySQL 自托管版本。

这个版本保留了原项目的前端账本模型、IndexedDB 本地缓存、同步调度和统计分析能力，把默认自托管链路改成了：

- `账号密码注册 / 登录`
- `Node.js API + MySQL 持久化`
- `Docker 一键编排部署`

默认部署形态为 `nginx + frontend + api + mysql`。

## 项目定位

Cent 仍然是一个以账本、账单、分类、标签、预算、统计为核心的前端记账应用。

这次改造没有重写账单业务层，而是在原有存储抽象之上新增了 MySQL 端点，因此这些能力仍然保留：

- 多账本
- 本地 IndexedDB 缓存
- 批量同步
- 协作者机制
- 图片附件
- 统计分析、预算、标签、分类

## 本次升级了什么

### 1. 新增 MySQL 后端

后端目录在 [`server/`](./server)，主要职责：

- 用户注册与账号密码登录
- 账本与成员关系管理
- 账单与元数据持久化
- 附件存储
- MySQL 自动建表

核心文件：

- [`server/index.mjs`](./server/index.mjs)
- [`server/db.mjs`](./server/db.mjs)
- [`server/repository.mjs`](./server/repository.mjs)
- [`server/auth.mjs`](./server/auth.mjs)

### 2. 前端新增 MySQL 存储端点

前端通过已有的存储抽象接入 MySQL 模式，关键文件：

- [`src/api/endpoints/mysql/index.ts`](./src/api/endpoints/mysql/index.ts)
- [`src/api/endpoints/mysql/client.ts`](./src/api/endpoints/mysql/client.ts)
- [`src/api/endpoints/mysql/storage.ts`](./src/api/endpoints/mysql/storage.ts)
- [`src/api/endpoints/mysql/auth.ts`](./src/api/endpoints/mysql/auth.ts)

默认仍然保留本地缓存和同步状态管理，MySQL 负责远端持久化。

### 3. 登录页支持账号密码链路

登录页已经加入：

- `账号密码登录`
- `注册账号`

用户首次进入后可以直接注册、创建账本并开始记账。

### 4. 默认支持 Docker 部署

已新增以下 Docker 物料：

- [`Dockerfile`](./Dockerfile)
- [`server/Dockerfile`](./server/Dockerfile)
- [`docker-compose.yml`](./docker-compose.yml)
- [`docker/nginx/default.conf`](./docker/nginx/default.conf)
- [`.dockerignore`](./.dockerignore)
- [`.env.docker.example`](./.env.docker.example)

## 目录说明

```text
.
├─ src/                      # 前端 React + Vite 代码
├─ server/                   # Node.js + MySQL API
├─ docker/nginx/             # Nginx 反向代理配置
├─ docs/                     # 额外说明文档
├─ Dockerfile                # 前端生产镜像
├─ server/Dockerfile         # 后端生产镜像
└─ docker-compose.yml        # 默认部署编排
```

## 本地开发

### 环境要求

- Node.js 20+
- pnpm
- MySQL 8+

### 前端环境变量

复制 [`.env.example`](./.env.example)：

```bash
cp .env.example .env.local
```

默认关键项：

```env
VITE_MYSQL_API_HOST="/api/mysql"
VITE_MYSQL_PROXY_TARGET="http://127.0.0.1:8787"
```

这意味着：

- 本地 `vite dev` 访问前端时，`/api/mysql` 会自动代理到 `127.0.0.1:8787`
- Docker 部署时，前端也继续使用 `/api/mysql`，由 Nginx 反代到 API 容器

### 后端环境变量

复制 [`server/.env.example`](./server/.env.example)：

```bash
cp server/.env.example server/.env
```

然后根据你的本地 MySQL 修改：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=replace-me
MYSQL_DATABASE=cent
```

### 启动方式

```bash
pnpm install
npm run server
pnpm dev
```

启动后：

- 前端默认在 `http://localhost:5173`
- 后端默认在 `http://127.0.0.1:8787/api/mysql`

进入登录页后，选择 `注册账号` 或 `账号密码登录`，即可走 MySQL 链路。

## Docker 部署

### 默认架构

`docker-compose.yml` 会启动三个服务：

- `mysql`: MySQL 8 容器，账本数据持久化到 `mysql-data` volume
- `api`: Node.js API 容器，处理注册、登录、账本、账单、附件
- `web`: Nginx 容器，提供静态前端并反代 `/api/mysql`

### 第一步：准备环境变量

复制 Docker 环境模板：

```bash
cp .env.docker.example .env
```

至少修改以下几项：

```env
WEB_PORT=8080

MYSQL_ROOT_PASSWORD=replace-with-a-strong-root-password
MYSQL_DATABASE=cent
MYSQL_USER=cent
MYSQL_PASSWORD=replace-with-a-strong-app-password

MYSQL_API_AUTH_SECRET=replace-with-a-long-random-secret
MYSQL_API_CORS_ORIGIN=http://localhost:8080
```

说明：

- `MYSQL_API_AUTH_SECRET` 必须替换成强随机字符串
- `MYSQL_API_CORS_ORIGIN` 要与你实际访问前端的地址一致
- 如果以后挂域名，也在这里同步改掉

### 第二步：构建并启动

```bash
docker compose up -d --build
```

启动完成后访问：

```text
http://localhost:8080
```

### 第三步：初始化使用

1. 打开首页
2. 选择 `注册账号`
3. 注册第一个用户
4. 创建账本
5. 开始记账

### 常用命令

查看服务状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f web
docker compose logs -f api
docker compose logs -f mysql
```

停止服务：

```bash
docker compose down
```

删除容器并清空数据库卷：

```bash
docker compose down -v
```

`docker compose down -v` 会删除 MySQL 数据卷，属于不可恢复操作，执行前请先确认。

## 生产环境建议

默认 Docker 方案已经能直接启动，但如果要长期使用，建议至少做这些配置：

- 使用域名并通过 Nginx/外层网关接入 HTTPS
- 修改所有默认密码和 `MYSQL_API_AUTH_SECRET`
- 定期备份 MySQL volume
- 如果附件很多，后续考虑把附件存储迁到对象存储

## 以后推到 GitHub 后怎么更新

后续你把代码推到 GitHub 后，服务器侧更新方式可以保持很简单：

```bash
git pull
docker compose up -d --build
```

如果只改了后端配置，不改前端构建变量，也可以只重启 API：

```bash
docker compose up -d --build api
```

如果改了 `VITE_*` 变量，需要重建 `web` 镜像：

```bash
docker compose up -d --build web
```

## 如何同步上游 glink25/Cent

这个仓库最初不是通过 fork clone 下来的，而是后补的 Git 历史。因此已经额外做过一次“保留当前工作树内容”的上游历史连接，后续可以按标准 Git 方式同步上游。

如果你换了一台机器重新 clone 自己的仓库，先补上 `upstream`：

```bash
git remote add upstream https://github.com/glink25/Cent.git
```

后续同步上游主分支的常规流程：

```bash
git checkout main
git fetch upstream
git merge upstream/main
```

如果 merge 过程中出现冲突，优先检查这些位置：

- `server/`
- `src/api/endpoints/mysql/`
- `src/components/login/index.tsx`
- `src/components/settings/user.tsx`
- `Dockerfile`
- `server/Dockerfile`
- `docker-compose.yml`
- `docker/nginx/default.conf`
- `README.md`
- `README_EN.md`

同步完成后，建议立即验证并推回自己的仓库：

```bash
npm run lint
npm run build
git push origin main
```

如果服务器已经部署了 Docker 版本，再执行：

```bash
docker compose up -d --build
```

## 已验证内容

当前版本已经完成以下验证：

- `npm run lint`
- `npm run build`
- MySQL 注册
- MySQL 登录
- 创建账本
- 浏览器新增账单
- 账单同步写入 MySQL

## 许可证

沿用原项目许可证：`CC BY-NC-SA 4.0`

## 上游项目

- Upstream: [glink25/Cent](https://github.com/glink25/Cent)
