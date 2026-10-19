# 接口文档

本文依据当前仓库的路由、控制器、服务及 Sequelize 模型编写，示例数据仅用于说明响应结构，不代表数据库中的实际记录。本文记录当前实现，已知问题见文末。

## 1. 调用约定

- 默认服务地址：`http://localhost:1001`，端口由环境变量 `PORT` 配置。
- 当前已挂载的接口没有鉴权中间件，无需携带 Token。
- JSON 请求使用 `Content-Type: application/json`；文件上传使用 `multipart/form-data`。
- 接口没有实现分页或查询条件；未明确说明的查询参数不会用于筛选。
- 组件元数据、发布、活跃配置和迁移接口依赖 MySQL。数据库连接失败后 HTTP 服务仍可能启动，`/health` 正常不代表数据库可用。
- `version` 是版本字符串，例如 `1.0.0`；`time` 是最长 20 字符的字符串，通常存放毫秒时间戳。更新、删除 URL 中的 `timestamp` 匹配数据库的 `time`，不是 `version`。

### 响应格式与状态码

大部分组件接口返回业务信封：

```json
{
  "code": 200,
  "msg": "获取组件列表成功",
  "data": {}
}
```

这些接口通常始终返回 HTTP 200，需要同时检查业务字段 `code`：成功为 `200`，发布参数缺失为 `400`，数据库或业务异常为 `500`。业务失败的 `data` 保持 `{}`，`msg` 包含错误信息。

`/health`、`/test`、`/goview/*`、组件查找、文件下载和上传使用各自的响应结构，详见对应小节。文件上传、下载及组件查找会使用实际 HTTP 400、404、500。

全局错误处理器返回 HTTP 500：

```json
{
  "status": "error",
  "message": "服务器内部错误"
}
```

仅当 `NODE_ENV=dev` 时，该响应额外包含 `error` 字段。未匹配路由没有自定义 JSON 404 响应。

## 2. 组件数据结构

组件对象由 Sequelize 模型序列化，示例如下。可空字段可能返回 `null`，日期字段的实际字符串格式以运行环境和数据库驱动为准。

```json
{
  "id": 1,
  "componentName": "button",
  "version": "1.0.0",
  "filePath": "/micro/components/file/button/button-1748876097257.js",
  "fileSize": null,
  "time": "1748876097257",
  "publisher": "system",
  "description": "Version 1.0.0",
  "status": "published",
  "metadata": {},
  "buildDetails": {},
  "publishInfo": {},
  "buildTime": null,
  "publishTime": "2025-06-02T17:34:57.257Z",
  "created_at": "2025-06-02T17:34:57.257Z",
  "updated_at": "2025-06-02T17:34:57.257Z"
}
```

- `id`：数据库自动生成的整数主键。
- `componentName`：必填字符串，最长 100 字符。
- `version`：必填字符串，最长 50 字符；与 `componentName` 组成唯一索引。
- `filePath`：必填字符串，最长 500 字符。
- `time`：必填字符串，最长 20 字符。
- `status`：`draft`、`published` 或 `deprecated`，模型默认 `draft`。
- `publisher`：可空字符串，最长 100 字符；`description` 为可空文本。
- `fileSize`：可空 BIGINT；上传处理器没有自动计算并填充该字段。
- `metadata`、`buildDetails`、`publishInfo`：可空 JSON。
- `buildTime`、`publishTime`：可空日期；`created_at`、`updated_at` 由 ORM 管理。

后文中的“组件对象”均指上述结构；组件分组对象为 `{ "组件名": [组件对象, ...] }`。

## 3. 服务与示例接口

### 3.1 健康检查

`GET /health`，无参数。

```json
{
  "status": "ok",
  "message": "服务器运行正常",
  "app": "ZXZ-SERVER",
  "env": "dev"
}
```

`env` 为 `NODE_ENV`，未设置时为 `dev`。此接口不检查数据库连接状态。

### 3.2 API 测试

`GET /test`，无参数。

```json
{
  "status": "success",
  "message": "API 测试成功",
  "timestamp": "2026-10-16T00:00:00.000Z"
}
```

`timestamp` 为请求处理时生成的 ISO 时间。

### 3.3 微服务列表

`GET /goview/list`，无参数。当前为示例接口，固定返回空数组。

```json
{
  "status": "success",
  "data": [],
  "message": "获取微服务列表成功"
}
```

### 3.4 微服务详情

`GET /goview/detail/:id`。路径参数 `id` 为字符串；当前仅回显，不查询数据库或检查是否存在。

```json
{
  "status": "success",
  "data": { "id": "demo" },
  "message": "获取微服务详情成功"
}
```

## 4. 组件查询与发布

### 4.1 获取全部组件

`GET /micro/components`，无参数。

成功：业务 `code=200`，`msg="获取组件列表成功"`，`data` 为组件分组对象，无记录时为 `{}`。组件名升序，每组按 `created_at` 降序排列，包含所有状态的版本。

```json
{
  "code": 200,
  "msg": "获取组件列表成功",
  "data": {}
}
```

数据库异常：业务 `code=500`，`msg` 以 `获取组件信息失败:` 开头。

### 4.2 按组件名和版本查找

`POST /micro/components/find`

请求体中的 `componentName` 和 `version` 都是必填字符串：

```json
{
  "componentName": "button",
  "version": "1.0.0"
}
```

成功返回 HTTP 200，响应直接为组件对象，并增加 `path` 字段。`path` 由请求协议、Host 和组件 `filePath` 拼接，例如：

```text
http://localhost:1001/micro/components/file/button/button-1748876097257.js
```

接口不按发布状态过滤。错误响应：

- HTTP 400：`{"error":"组件名称和版本都是必需的"}`。
- HTTP 404：`{"error":"未找到该组件"}`。
- HTTP 500：`{"error":"查找组件失败: ..."}`。

当前路由包装器还存在重复发送响应的问题，详见第 8 节。

### 4.3 发布组件

`POST /micro/components/publish`

```json
{
  "componentName": "button",
  "version": "1.0.0"
}
```

两个字段均必填。成功：业务 `code=200`、`msg="发布组件成功"`，`data.component` 为发布后的组件对象。

发布将指定记录的 `status` 改为 `published`，将 `publishTime` 更新为当前时间，然后重建所有活跃组件配置。不会同步修改该记录 JSON 字段 `publishInfo` 的内容。

- 缺少名称或版本：业务 `code=400`、`msg="组件名称和版本都是必需的"`。
- 记录不存在：业务 `code=500`、`msg="发布组件失败: 组件不存在"`。
- 其他异常：业务 `code=500`，`msg` 包含具体错误。

活跃版本按记录创建时间选择，发布一个创建时间更早的版本并不保证它成为活跃版本。

## 5. 版本管理

### 5.1 新增组件版本（当前不可正常调用）

`POST /micro/components/version`

当前路由没有 `:componentName`，但控制器从 `req.params.componentName` 读取组件名，并覆盖请求体的同名字段。因此即使 JSON 中提供了 `componentName`，仍会被覆盖为 `undefined`，通常触发模型非空约束并返回业务 `code=500`、`msg="添加组件失败: ..."`。

模型所需最小数据如下，仅用于说明字段，当前请求不能作为新增成功示例：

```json
{
  "componentName": "button",
  "version": "1.0.0",
  "filePath": "/micro/components/file/button/button-1748876097257.js",
  "time": "1748876097257"
}
```

其余模型字段见第 2 节。控制器的成功分支为业务 `code=200`、`msg="新增组件信息成功"`，`data` 为新增组件对象；当前需先修正代码参数来源才能正常使用。

### 5.2 获取组件版本列表

`GET /micro/components/version/list/:componentName`

路径参数 `componentName` 为组件名。

成功：业务 `code=200`、`msg="获取组件版本列表成功"`，`data` 为组件对象数组，按 `created_at` 降序排列，包含所有状态。组件不存在时返回 `[]`。

失败：业务 `code=500`，`msg` 以 `获取组件版本失败:` 开头。

### 5.3 更新组件版本

`PUT /micro/components/version/:componentName/:timestamp`

路径参数分别为组件名和记录的 `time` 字符串。请求体直接传入 ORM 更新方法，没有定义独立字段白名单；普通调用应仅提供需要修改的模型业务字段，例如：

```json
{
  "description": "更新按钮样式",
  "metadata": {
    "name": "button",
    "author": "demo"
  }
}
```

JSON 字段按本次提供的字段值更新，不应假设会自动深度合并。

成功：业务 `code=200`、`msg="更新组件信息成功"`，`data` 为更新后的组件对象。

记录不存在：业务 `code=500`、`msg="更新组件失败: 组件不存在"`；其他错误也返回业务 `500`。此接口不会自动重建活跃配置。

### 5.4 删除组件版本

`DELETE /micro/components/version/:componentName/:timestamp`

路径参数含义同更新接口，无请求体。

成功：`{"code":200,"msg":"删除组件信息成功","data":{}}`。

记录不存在：业务 `code=500`、`msg="删除组件失败: 组件不存在"`。删除条件为组件名与 `time`，不是主键；若多条记录具有相同组合，可能一起删除。数据库关联约束也可能导致删除失败。

此接口只删除数据库记录，不删除本地 JS 文件，也不显式重建活跃配置。

## 6. 组件文件

### 6.1 获取组件文件

`GET /micro/components/file/:componentName/:filename`

路径参数 `componentName` 为组件名，`filename` 为完整文件名，例如 `button-1748876097257.js`。

成功从数据库返回 HTTP 200 和 JS 文件原始内容，不使用 JSON 信封。只查询改造后上传并保存于 `component_files` 表中的文件；现有本地文件不会自动迁移。

- 文件不存在：HTTP 404，`{"status":"error","message":"文件不存在"}`。
- 处理异常：HTTP 500，`{"status":"error","message":"具体错误信息"}`。

```powershell
curl.exe "http://localhost:1001/micro/components/file/button/button-1748876097257.js"
```

### 6.2 上传组件文件

`POST /micro/components/file/upload`，请求类型为 `multipart/form-data`。

表单字段：

- `componentName`：必需的组件名字符串。
- `file`：必需，单个文件，字段名固定为 `file`。
- `version`：可选字符串，默认 `unknown`。同名组件版本重复时会触发数据库唯一约束。
- `timestamp`：可选的毫秒时间戳字符串；文件名、数据库 `time` 和 `publishTime` 使用同一个值。不传时生成一次当前时间戳。
- `publisher`：可选字符串，默认 `system`。
- `description`：可选字符串，默认 `Version <version>`。
- `buildInfo`：可选字符串，默认空字符串，写入 `publishInfo.buildInfo`。
- `metadata`：可选的 JSON 字符串，默认 `{}`；不是直接发送 JSON 对象。

`metadata` 接受的内容示例：

```json
{
  "name": "button",
  "dependencies": {},
  "peerDependencies": {},
  "author": "demo",
  "license": "MIT",
  "repository": {},
  "buildDetails": {
    "buildTime": "2025-06-02T17:34:57.257Z"
  }
}
```

处理器将 `name`、`dependencies`、`peerDependencies`、`author`、`license`、`repository` 写入组件 `metadata`，将 `metadata.buildDetails` 单独写入 `buildDetails`；其他 metadata 字段不会原样保留。`buildTime` 从 `buildDetails.buildTime` 转为日期。

PowerShell 调用示例（需先准备本地 `button.js`；服务端只写入数据库）：

```powershell
curl.exe -X POST "http://localhost:1001/micro/components/file/upload" `
  -F "componentName=button" `
  -F "version=1.0.0" `
  -F "timestamp=1748876097257" `
  -F "publisher=demo" `
  -F "file=@./button.js"
```

上传成功返回 HTTP 200，格式如下；`info` 在实际响应中为第 2 节所示的完整组件对象：

```text
{
  "status": "success",
  "data": {
    "filename": "button-1748876097257.js",
    "path": "/micro/components/file/button/button-1748876097257.js",
    "info": <组件对象>
  },
  "message": "上传组件文件成功"
}
```

上传会在同一数据库事务中保存 `status=published` 的版本记录、JS 文件内容及活跃配置，无需再调用发布接口。失败时事务回滚。

- 未提供文件：HTTP 400，`{"status":"error","message":"未上传文件"}`。
- metadata JSON 无效、数据库写入或活跃配置更新失败：HTTP 500，`{"status":"error","message":"具体错误信息"}`。
- Multer 中间件转交的错误使用全局错误响应；缺少组件名会导致数据库校验失败。

## 7. 配置与迁移

### 7.1 获取组件信息配置

`GET /micro/config/components-info`，无参数。

成功：业务 `code=200`、`msg="获取组件信息配置成功"`，`data` 为组件分组对象，结构和排序与 `GET /micro/components` 相同。

该接口读取数据库，不直接返回 `components-info.json`。失败为业务 `code=500`，`msg` 以 `获取组件信息失败:` 开头。

### 7.2 获取活跃组件配置

`GET /micro/config/active-components`，无参数。

```json
{
  "code": 200,
  "msg": "获取活跃组件配置成功",
  "data": {
    "button": {
      "path": "/micro/components/file/button/button-1748876097257.js",
      "time": "1748876097257",
      "version": "1.0.0",
      "publishInfo": {},
      "buildDetails": {},
      "metadata": {}
    }
  }
}
```

从数据库活跃表读取，组件名为键；无记录时 `data={}`。此处路径字段叫 `path`，不是 `filePath`。失败为业务 `code=500`，`msg` 以 `获取活跃组件配置失败:` 开头。

### 7.3 重建活跃组件配置

`POST /micro/config/active-components/update`，无请求参数，请求体不会用于更新配置。

筛选 `status=published` 的组件，每个组件名按 `created_at` 降序取首条，清空活跃表后逐条写入。不是按语义版本号、`time` 或 `publishTime` 选择。没有已发布记录时会清空活跃表。

成功：业务 `code=200`、`msg="更新活跃组件配置成功"`，`data` 为 `{ "组件名": 组件对象 }`，返回完整 Component 记录；与获取活跃配置接口的精简结构不同。

失败：业务 `code=500`，`msg` 以 `更新活跃组件配置失败:` 开头。清空和插入没有事务保护，失败可能留下不完整的活跃配置。

### 7.4 从本地 JSON 迁移数据

`POST /micro/migrate`，无请求参数。

读取 `src/data/components/components-info.json` 和可选的 `active-components.json`，将版本元数据及活跃配置写入数据库；不迁移 JS 文件，也不支持通过请求体指定路径。

成功：`{"code":200,"msg":"数据迁移成功","data":{}}`。

顶层异常：业务 `code=500`，`msg` 以 `数据迁移失败:` 开头。

迁移语义：

- 组件信息 JSON 以组件名分组，每组为版本数组；其中 `path` 映射为数据库 `filePath`。
- 活跃 JSON 以组件名为键，依据名称和版本查找组件后建立关联。
- 重复记录触发唯一约束时跳过，不更新原有数据。
- 单条记录异常只记录到服务日志并继续，不会汇总到响应中；因此成功响应不代表全部记录都迁移成功。
- `components-info.json` 不存在时跳过迁移，仍可返回成功。

## 8. 当前实现限制与联调注意事项

1. **新增版本参数来源不一致**：`POST /micro/components/version` 不含名称路径参数，控制器却从路径读取并覆盖请求体名称，当前不能正常新增。
2. **上传与下载目录不一致**：上传写入根目录 `components/`，下载读取 `src/data/components/`。修正目录前，上传成功不等于下载地址可用。
3. **组件查找重复发送响应**：查找控制器直接调用 `res.json()`，外层路由又调用 `res.json(result)`。首次响应后可能抛出响应头已发送错误；Express 4 没有为此 async 路由配置 Promise 错误转发，可能产生未处理的 Promise 拒绝。客户端收到首次响应也不代表服务端处理完整结束。
4. **HTTP 与业务状态不同**：大部分组件接口在业务错误时仍返回 HTTP 200。调用方需要检查 `code`，不能只检查 HTTP 状态。
5. **活跃配置刷新时机不同**：发布、上传会自动重建；直接更新或删除版本不会显式重建。重建过程没有事务，操作失败可能留下部分写入。
6. **持久化来源不同**：日常组件和配置查询读取数据库，本地 JSON 主要用于迁移，普通数据库写入不会自动同步这些 JSON。

以上为源码核对结果，本文创建时未连接数据库执行接口测试，也未修改接口实现。

## 9. 实现位置

- 服务入口与全局错误处理：[`src/server.js`](../src/server.js)
- 根路由：[`src/routes/index.js`](../src/routes/index.js)
- 组件路由与上传存储：[`src/routes/micro.js`](../src/routes/micro.js)
- 示例路由：[`src/routes/goview.js`](../src/routes/goview.js)
- 请求处理及响应：[`src/controllers/micro.js`](../src/controllers/micro.js)
- 业务逻辑与迁移：[`src/services/componentService.js`](../src/services/componentService.js)
- 模型字段：[`Component`](../src/models/components/Component.js)、[`ActiveComponent`](../src/models/components/ActiveComponent.js)
