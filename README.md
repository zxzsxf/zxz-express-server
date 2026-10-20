# zxz-express-server

ZXZ 前端组件服务端，基于 Node.js、Express 和 Sequelize。服务提供组件版本元数据、发布状态、组件文件及 goview 微服务示例接口。默认使用 MySQL 保存组件元数据；组件配置 JSON 和组件源码也保存在本地文件中。

完整接口说明、请求示例、响应格式及已知限制见 [接口文档](docs/API.md)。

```
测试接口：
http://localhost:1001/health
http://localhost:1001/test
```

## 项目结构

```text
zxz-express-server/
├─ db/
│  └─ init.sql                    # MySQL 数据库和组件表初始化脚本
├─ src/
│  ├─ config/
│  │  ├─ index.js                 # 当前生效配置：端口、MySQL 连接等
│  │  └─ env/                     # 历史/备用环境配置
│  ├─ controllers/
│  │  └─ micro.js                 # 组件接口的请求处理及本地 JSON 文件读写
│  ├─ data/components/
│  │  ├─ components-info.json     # 组件版本元数据
│  │  ├─ active-components.json   # 当前活跃组件配置
│  │  ├─ button/                  # 示例组件文件
│  │  └─ card/
│  ├─ models/
│  │  ├─ components/              # Sequelize 模型：Component、ActiveComponent
│  │  └─ index.js                 # 模型加载、关联和数据库表同步
│  ├─ routes/
│  │  ├─ index.js                 # 根路由及子路由挂载
│  │  ├─ micro.js                 # /micro 组件接口
│  │  └─ goview.js                # /goview 示例接口
│  ├─ services/
│  │  └─ componentService.js      # 组件元数据和发布业务逻辑
│  ├─ utils/db_utils/             # Sequelize/Knex 数据库工具
│  └─ server.js                   # Express 初始化和服务启动入口
├─ env.example                    # 环境变量示例，复制为 .env 后加载
├─ nodemon.json                  # 本地开发热重载配置
├─ pm2.json                      # PM2 生产进程配置
└─ package.json                  # 依赖和 npm/pnpm scripts
```

### 请求处理流程

`src/server.js` 初始化 CORS、JSON/表单解析和根路由；`src/routes` 将请求分发给控制器；控制器调用 `src/services` 处理组件业务；服务层通过 Sequelize 模型读写 MySQL。组件配置 JSON 由控制器直接读写 `src/data/components` 下的文件。

## 启动

### 环境要求

- Node.js（项目未声明最低版本；建议使用当前受支持的 LTS 版本）
- pnpm（仓库提供 `pnpm-lock.yaml`）
- MySQL 5.7+ 或兼容版本，默认连接 `127.0.0.1:3306`

### 1. 安装依赖

在项目目录执行：

```powershell
corepack enable
pnpm install --frozen-lockfile
```

如果本机已经安装 pnpm，可以直接执行第二条命令。

### 2. 初始化数据库

确保 MySQL 已启动，然后用有创建数据库权限的账号执行 `db/init.sql`。脚本会创建默认数据库 `goview` 及 `components`、`active_components` 两张表。

例如使用 MySQL CLI：

```powershell
mysql -u root -p < db/init.sql
```

也可以在 MySQL 客户端中打开并执行 `db/init.sql`。

### 3. 配置数据库和端口

当前生效配置在 `src/config/index.js`，支持以下环境变量：

| 变量        | 默认值                | 用途                           |
| ----------- | --------------------- | ------------------------------ |
| `DB_HOST` | `127.0.0.1`         | MySQL 主机                     |
| `DB_PORT` | `3306`              | MySQL 端口                     |
| `DB_NAME` | `goview`            | 数据库名                       |
| `DB_USER` | `root`              | 数据库用户                     |
| `DB_PWD`  | `your_new_password` | 数据库密码，需按本机实际值设置 |
| `PORT`    | `1001`              | HTTP 服务端口                  |

PowerShell 中可在启动服务的同一个窗口设置：

```powershell
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
$env:DB_NAME = "goview"
$env:DB_USER = "root"
$env:DB_PWD = "你的MySQL密码"
$env:PORT = "1001"
```

macOS/Linux (bash/zsh) 示例：

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=goview
export DB_USER=root
export DB_PWD='你的MySQL密码'
export PORT=1001
```

也可以将 `env.example` 复制为项目根目录的 `.env` 并填写配置。服务及低代码 CLI 脚本会自动加载它，已有进程环境变量优先。低代码认证还需设置至少 32 个字符的随机 `LOWCODE_SESSION_SECRET`；修改后重启服务。`.env` 已被 Git 忽略，不要提交真实密钥。

### 4. 启动开发服务

```powershell
pnpm run dev
```

服务默认监听 `http://localhost:1001`。`dev` 脚本启用 nodemon，修改 `src/**/*.js` 后会自动重启。

其他脚本：

```powershell
pnpm start       # 直接运行 Node.js
pnpm run prod    # 以 NODE_ENV=prod 运行
pnpm run pm2     # 使用 pm2.json 启动 PM2 进程
```

## 验证服务

浏览器或 PowerShell 中访问：

```text
GET http://localhost:1001/health
GET http://localhost:1001/test
GET http://localhost:1001/goview/list
```

健康检查返回服务状态、应用名和运行环境。组件 API 挂载在 `/micro`，例如：

```text
GET    /micro/components
POST   /micro/components/find
POST   /micro/components/publish
POST   /micro/components/version
GET    /micro/components/version/list/:componentName
PUT    /micro/components/version/:componentName/:timestamp
DELETE /micro/components/version/:componentName/:timestamp
GET    /micro/components/file/:componentName/:filename
POST   /micro/components/file/upload
GET    /micro/config/components-info
GET    /micro/config/active-components
POST   /micro/config/active-components/update
POST   /micro/migrate
```

组件接口的请求体字段由 `src/controllers/micro.js` 中对应处理函数定义；文件上传使用 `multipart/form-data`，字段名为 `file`，并需要提供 `componentName`。

注意：当前 `POST /micro/components/version` 路由没有在 URL 中声明 `componentName`，但对应控制器从 `req.params.componentName` 读取它。新增版本接口调用前需先核对/修正这处路由与控制器参数不一致。

## 数据库行为与注意事项

- 启动时服务先验证 MySQL 连接，再调用 Sequelize `sync({ alter: true })` 尝试同步模型表结构。首次启动建议先备份已有数据库；`alter: true` 可能修改表结构。
- 数据库连接失败时，`src/server.js` 仍会启动 HTTP 服务，但组件上传、下载、查询、版本和发布等接口不可用；`/health`、`/test` 等非数据库接口仍可用于检查进程。
- MySQL 账号需能访问配置的数据库；如果使用自定义库名，请同时创建该数据库，并将 `DB_NAME` 设置一致。`db/init.sql` 默认创建 `goview`。
- 本地组件信息文件位于 `src/data/components`。提交或部署时请根据实际需要保留该目录中的 JSON 和组件文件。
- 如果启动日志显示数据库认证或连接失败，先核对 MySQL 是否运行、库是否创建，以及 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PWD` 是否在当前终端生效。
