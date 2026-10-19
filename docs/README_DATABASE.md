# 数据库使用说明

本文按当前代码说明数据库配置、表结构和文件数据迁移流程。默认数据库为 MySQL `goview`，组件元数据通过 Sequelize 读写；组件 JavaScript 文件保存在磁盘上。

## 1. 相关代码

- `db/init.sql`：创建数据库、两张业务表、约束及索引。
- `src/config/index.js`：当前生效的数据库连接配置。
- `src/models/index.js`：创建 Sequelize 实例、加载模型和关联、同步表结构。
- `src/models/components/Component.js`：组件版本模型，对应 `components`。
- `src/models/components/ActiveComponent.js`：活跃组件模型，对应 `active_components`。
- `src/services/componentService.js`：组件查询、发布、活跃配置重建和文件数据迁移。
- `src/controllers/micro.js`、`src/routes/micro.js`：HTTP 接口及文件读写。

`src/utils/db_utils` 中另有 Sequelize/Knex 通用工具，但当前组件业务的连接入口是 `src/models/index.js`。`src/config/env` 和 `src/config copy` 不会被当前配置入口自动加载。

## 2. 初始化和连接配置

### 2.1 创建数据库

准备支持原生 JSON 字段的 MySQL 实例。脚本使用 InnoDB、`utf8mb4` 字符集及 `utf8mb4_unicode_ci` 排序规则。

从项目根目录启动 MySQL 客户端，使用有建库、建表权限的账号：

```powershell
mysql -h 127.0.0.1 -P 3306 -u root -p
```

在 MySQL 客户端中执行以下命令（`SOURCE` 使用实际项目路径）：

```sql
SOURCE C:/z_project/zxz-express-server/db/init.sql;
USE goview;
SHOW TABLES;
```

脚本创建 `goview`、`components` 和 `active_components`；示例 INSERT 均被注释，默认不导入业务数据。若使用自定义库名，应先调整脚本中的 `CREATE DATABASE` 和 `USE`，并同步设置 `DB_NAME`。

注意：建库、建表使用了 `IF NOT EXISTS`，但脚本末尾三个 `CREATE INDEX` 没有重复执行保护。不要把整个脚本当作可反复执行的迁移脚本；已有数据库应先检查实际表结构和索引，再执行需要的变更。

### 2.2 设置环境变量

当前配置支持以下变量：

- `DB_HOST`：默认 `127.0.0.1`。
- `DB_PORT`：默认 `3306`。
- `DB_NAME`：默认 `goview`。
- `DB_USER`：默认 `root`。
- `DB_PWD`：默认 `your_new_password`，需要改为实际密码。
- `PORT`：HTTP 服务端口，默认 `1001`。

在启动服务的同一个 PowerShell 窗口中设置：

```powershell
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
$env:DB_NAME = "goview"
$env:DB_USER = "root"
$env:DB_PWD = "你的MySQL密码"
$env:PORT = "1001"
pnpm run dev
```

生产启动命令为 `pnpm run prod`；安装依赖及其他启动方式见 `README.md`。

项目没有引入 dotenv 或加载 `.env` 的逻辑，`env.example` 也只是占位文件。因此仅创建 `.env` 不会生效，即使连接失败日志中提示可以创建该文件，也仍需通过进程环境变量配置。

### 2.3 连接和启动行为

- 驱动为 `mysql2`，Sequelize 方言固定为 `mysql`。
- 连接时区为 `+08:00`；连接池最多 5 个连接、最少 0 个，获取连接超时 30000 毫秒，空闲超时 10000 毫秒。
- 启动先调用 `sequelize.authenticate()`，成功后调用 `sequelize.sync({ alter: true })`，再监听 HTTP 端口。同步表不会自动创建数据库。
- `alter: true` 会尝试修改已有表结构。对已有数据或生产库操作前应备份，并审查实际 DDL；当前代码没有按环境关闭自动同步，也没有独立的版本化 schema migration 流程。
- `syncDatabase()` 会捕获同步异常而不重新抛出，因此后续“数据库表结构同步完成”日志不代表同步一定成功，需检查前面的错误日志和实际表结构。
- 认证失败后 HTTP 服务仍会启动并打印“文件系统模式”，但组件元数据接口仍调用数据库服务，没有完整的文件存储回退。`GET /health` 只表示进程可响应，不检查数据库连接或表结构。
- SQL 日志由 `DEBUG` 控制；只有 `NODE_ENV=production` 才关闭。现有 `pnpm run prod` 设置的是 `NODE_ENV=prod`，因此仍会输出 SQL 日志。

## 3. 数据表与字段

以下类型、默认值按 `db/init.sql` 描述。启动同步后以实际数据库的 `SHOW CREATE TABLE` 为准。

### 3.1 components：组件版本

每行保存一个组件版本。必填字段没有默认值时，插入必须提供。

- `id`：`INT`，非空、自增主键。
- `componentName`：`VARCHAR(100)`，非空，组件名称。
- `version`：`VARCHAR(50)`，非空，版本字符串。
- `filePath`：`VARCHAR(500)`，非空，组件访问路径，例如 `/micro/components/file/button/button-1748876097257.js`，不保存文件内容。
- `fileSize`：`BIGINT`，可空，文件大小；新上传会赋值，历史迁移可能为空。
- `buildTime`：`DATETIME`，可空，构建时间。
- `publishTime`：`DATETIME`，可空，发布时间。
- `publisher`：`VARCHAR(100)`，可空，发布者。
- `description`：`TEXT`，可空，版本说明。
- `status`：`ENUM('draft','published','deprecated')`，可空，默认 `draft`；分别表示草稿、已发布、已弃用。
- `metadata`：`JSON`，可空，包名、依赖、作者等元数据。
- `buildDetails`：`JSON`，可空，构建时间、Git 提交、分支及构建信息。
- `publishInfo`：`JSON`，可空，发布者、发布时间、描述、发布状态等原始发布信息。
- `time`：`VARCHAR(20)`，非空，通常为毫秒时间戳字符串，供更新、删除接口定位版本使用。
- `created_at`：`TIMESTAMP`，非空，SQL 默认当前时间。
- `updated_at`：`TIMESTAMP`，非空，SQL 默认当前时间，并在行更新时自动更新。

约束与索引：

- 主键：`id`。
- 唯一索引 `unique_component_version`：`(componentName, version)`，同一组件不能重复保存相同版本。
- 普通索引：`idx_component_name(componentName)`、`idx_status(status)`、`idx_components_created_at(created_at)`、`idx_components_publish_time(publishTime)`。

`time` 没有唯一约束，代码也不校验版本是否符合语义化版本规范。默认排序规则不区分大小写，组件名和版本的唯一性按数据库排序规则判断。

### 3.2 component_files：组件 JS 文件

每行保存一个已上传组件版本的 JS 文件。`componentId` 唯一并关联 `components.id`；`filePath` 唯一，供下载接口查询。`fileSize` 为字节数，`content` 为 `LONGBLOB` 原始内容。删除组件版本时，外键级联删除关联文件。现有本地文件不自动导入此表。

### 3.3 active_components：活跃组件配置

每个组件名最多一行，保存当前选中的版本引用及其元数据快照。

- `id`：`INT`，非空、自增主键。
- `componentName`：`VARCHAR(100)`，非空、唯一，组件名称。
- `componentId`：`INT`，非空，关联 `components.id`。
- `path`：`VARCHAR(500)`，非空，对应组件版本的 `filePath`。
- `time`：`VARCHAR(20)`，非空，组件时间戳字符串。
- `version`：`VARCHAR(50)`，非空，组件版本。
- `publishInfo`、`buildDetails`、`metadata`：`JSON`，可空，选中版本的元数据快照。
- `created_at`、`updated_at`：`TIMESTAMP`，非空；SQL 默认值及更新时间规则同 `components`。

约束与索引：

- 主键：`id`。
- 唯一索引 `unique_component_name(componentName)`。
- 普通索引：`idx_component_id(componentId)`、`idx_active_components_created_at(created_at)`。
- 外键 `fk_active_component`：`componentId` 引用 `components.id`，初始化 SQL 指定 `ON DELETE CASCADE`。

Sequelize 关联别名分别是 `Component.hasMany(..., as: 'activeVersions')` 和 `ActiveComponent.belongsTo(..., as: 'component')`。业务通过 `componentName` 唯一约束进一步限制每个组件只选中一个版本。外键只验证 ID 引用，不校验两表的名称、版本和快照内容是否一致。

### 3.4 SQL 与模型同步的差异

模型使用 Sequelize `timestamps` 管理 `created_at` 和 `updated_at`，而初始化 SQL 使用数据库 `TIMESTAMP` 默认值及自动更新规则；模型没有显式声明这些列的 SQL 默认值。

模型定义了业务唯一索引及名称、状态、关联 ID 索引，但没有声明 SQL 脚本末尾的三个时间索引；模型也没有显式命名为 SQL 中的索引名或配置相同的外键删除规则。不要假设两种建表方式生成的 DDL 完全一致，尤其是在 `alter: true` 执行后。

## 4. 数据流和发布规则

### 4.1 数据库与磁盘文件

- 组件查询、版本管理、发布和配置查询接口读取数据库。
- `src/data/components/components-info.json` 和 `active-components.json` 是历史文件数据，供迁移读取；当前数据库写入流程不会自动同步更新这两个文件。
- 新上传的 JS 文件内容写入 `component_files`；下载只从该表读取，不读写本地 JS 文件。
- 上传的版本信息、文件内容和活跃配置更新处于同一事务，失败时一起回滚。
- 历史本地 JS 文件不自动导入；即使版本信息已经入库，缺少文件记录的旧 URL 也返回 404。历史 JSON 迁移仍只导入版本信息和活跃配置。

### 4.2 活跃版本选择

`updateActiveComponents()` 查询所有 `status='published'` 的记录，按组件名升序、`created_at` 降序，为每个组件选取第一条，然后清空并重建整张 `active_components` 表。

“最新”依据是创建时间，不是 `version`、`time` 或 `publishTime`。创建时间相同的记录没有进一步排序规则。重新发布一个较早创建的版本不会保证该版本被选中。

- 上传组件会创建 `published` 记录并重建活跃配置。
- 发布接口将指定版本的顶层 `status` 改为 `published`、`publishTime` 改为当前时间，再重建活跃配置。
- 普通新增、更新、删除版本不会主动重建活跃配置；需要时调用 `POST /micro/config/active-components/update`。
- 发布逻辑不同时更新 `publishInfo` 内的状态和时间；顶层字段与 JSON 可能不同。活跃配置中的冗余字段也不会随版本编辑自动同步。
- 重建活跃配置没有事务保护，清空后逐条插入，失败或并发读取时可能看到空表或部分结果；发布及上传也不是跨步骤事务。

## 5. 从历史 JSON 迁移数据

### 5.1 迁移前检查

1. 备份数据库和 `src/data/components`，检查两张表已可正常读写。
2. 检查 `components-info.json`：顶层键是组件名，值是版本数组；每项至少提供 `version`、`path`、`time`。
3. 检查 `active-components.json`：顶层键是组件名，值为含 `version`、`path`、`time` 的活跃配置对象。
4. 检查 `(componentName, version)` 是否重复，检查引用的文件是否存在。仓库示例中 `card` 有两条 `0.0.1`，且部分 JSON 引用文件不在当前目录中，应先核对。
5. 规范化日期。`buildDetails.buildTime` 直接交给 JavaScript `new Date()` 解析，示例中的中文日期可能解析失败；建议使用带时区的 ISO 时间。`publishInfo.publishTime` 应为毫秒时间戳字符串。

### 5.2 执行迁移

服务启动后，在 PowerShell 中执行：

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:1001/micro/migrate"
```

主要映射规则：

- JSON 顶层组件名 → `componentName`；`version`、`time` 原值写入；`path` → `filePath`。
- `publisher` 默认 `publishInfo.publisher` 或 `system`；`description` 默认 `publishInfo.description` 或空字符串。
- `status` 默认 `publishInfo.status` 或 `published`；三个 JSON 字段缺失时使用空对象。
- `buildTime` 来源为 `buildDetails.buildTime`；`publishTime` 来源为 `publishInfo.publishTime` 的毫秒时间戳；缺失时为空。
- 活跃配置按组件名与版本查找已入库记录，将其 ID 写入 `componentId`；找不到对应版本时不插入。

迁移不会在启动时自动执行。缺少 `components-info.json` 时直接跳过；缺少活跃配置文件时只导入组件版本。迁移不会调用活跃版本重建逻辑，导入顺序及新生成的 `created_at` 也不能代表历史版本先后。

重复组件版本或活跃组件会被跳过，不更新已有记录。其他单条写入失败也只记日志后继续，整个迁移没有事务回滚。因此响应 `code: 200` 或日志“数据迁移完成”不保证全部数据导入成功；重跑也不是覆盖同步，必须检查日志、行数及具体版本内容。

## 6. 验证与常用查询

先在 MySQL 客户端确认实际结构、索引和数量：

```sql
USE goview;
SHOW CREATE TABLE components;
SHOW CREATE TABLE active_components;
SHOW INDEX FROM components;
SHOW INDEX FROM active_components;

SELECT componentName, COUNT(*) AS version_count
FROM components GROUP BY componentName;

SELECT id, componentName, version, status, time, created_at
FROM components ORDER BY componentName, created_at DESC;

SELECT a.componentName, a.version, a.componentId, c.filePath, c.status
FROM active_components AS a
LEFT JOIN components AS c ON c.id = a.componentId;
```

再查询数据库业务接口，除 HTTP 状态外也检查响应体的 `code` 和 `msg`：

```powershell
Invoke-RestMethod -Uri "http://localhost:1001/micro/components"
Invoke-RestMethod -Uri "http://localhost:1001/micro/components/version/list/button"
Invoke-RestMethod -Uri "http://localhost:1001/micro/config/active-components"
```

如需按当前发布记录重建活跃配置，可执行下列写操作；它会清空并重建活跃表，执行前应确认第 4.2 节的选择规则符合预期：

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:1001/micro/config/active-components/update"
```

## 7. 排查与备份

- **Access denied**：检查当前服务进程的 `DB_USER`、`DB_PWD`、用户允许连接的主机和数据库权限。
- **ECONNREFUSED / 连接超时**：检查 MySQL 是否启动，以及 `DB_HOST`、`DB_PORT` 和网络连通性。
- **Unknown database**：先创建配置对应的库；Sequelize 表同步不能代替建库。
- **表不存在或同步失败**：检查最早出现的同步错误、账号 DDL 权限及 `SHOW CREATE TABLE`；HTTP 已启动不能证明同步成功。
- **Duplicate key name**：先用 `SHOW INDEX` 确认索引是否存在，避免直接重复执行完整初始化脚本。
- **唯一约束冲突**：检查组件名称与版本组合，或活跃表中的同名组件；重复上传相同版本不会自动覆盖旧记录。
- **迁移缺数据或日期错误**：检查逐条迁移日志、重复版本和日期格式；响应成功不能替代数据核对。
- **配置仍是旧版本**：确认顶层状态为 `published`，并检查创建时间排序及是否执行了活跃配置重建。
- **元数据存在但文件 404**：检查 `filePath` 对应文件和上传、下载目录差异。数据库备份不包含组件源码。

可使用 MySQL 工具备份元数据（在项目根目录的 PowerShell 中执行，账号需有相应权限）：

```powershell
mysqldump -h 127.0.0.1 -P 3306 -u root -p --single-transaction --result-file=goview-backup.sql goview
```

备份时避免并发执行表结构变更，并同时保存 `src/data/components` 及实际上传使用的根目录 `components`。恢复时先导入 SQL、恢复文件并核对路径，再启动服务；启动前仍需考虑自动 `alter` 对恢复后表结构的影响。备份文件可能包含业务数据，不应提交到仓库。
