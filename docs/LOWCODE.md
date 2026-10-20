# 低代码首轮闭环运行说明

## 启动准备

1. 将 `env.example` 复制为项目根目录的 `.env`（服务及低代码 CLI 自动加载，进程环境变量优先），配置 MySQL 连接环境变量，另设 `LOWCODE_SESSION_SECRET` 与 `LOWCODE_COMPONENT_PUBLISH_TOKEN`，均使用至少 32 位随机值。可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。开发浏览器来源设置 `LOWCODE_ALLOWED_ORIGINS`，修改配置后重启服务。`.env` 已被 Git 忽略。
2. 在 `zxz-express-server` 运行 `npm run lowcode:migrate` 创建四张新表；再创建首个内部账号。PowerShell 示例：`$env:LOWCODE_PASSWORD='至少12位密码'; npm run lowcode:user -- admin M,B,C`。生产环境先执行迁移命令，服务启动不会自动更改数据库结构。
3. 启动 `zxz-express-server`。服务端需要 MySQL 才能使用低代码 API；服务端未配置会话密钥时登录返回 503。
4. 在 `zxz-component/packages/Input` 与 `packages/card` 分别运行 `npm run build`。该命令构建后上传为草稿，须设置 `LOWCODE_COMPONENT_PUBLISH_TOKEN`。然后从 `zxz-component` 根目录运行 `node remoteBuild/publish.cjs Input` 和 `node remoteBuild/publish.cjs card`。发布后才会出现在新物料目录中；同一组件版本不可重复上传。Input/Card 本轮版本均为 `0.0.2`。
5. 在 `formflow` 运行 `yarn workspace flowform-component build` 与 `yarn workspace flowform-mobile build`；在 `remote-component` 和 `flowform-editor/packages/designable-bridge` 分别运行 `npm run build`。然后在 `react-app` 运行 `npm run sync:lowcode`、`npm install --legacy-peer-deps` 并启动应用。同步脚本把移动渲染器、远程加载器和 Designable 编辑树转换模块放在应用内 `vendor`。开发环境 CRA 代理 `/api` 与 `/micro` 到 Express；生产环境反向代理同源路径。

## 首轮操作顺序

1. 登录 `react-app`，进入“配置表单”，为 `Input:0.0.2` 和 `card:0.0.2` 创建配置表单。设计配置字段，保存后把每个字段绑定到允许的目标属性，再发布。Input 可绑定 `title`、`required`、`x-component-props.placeholder`、`x-component-props.disabled`；Card 可绑定 `title`、`x-component-props.title`。
2. 进入“模板管理”，拖入 Input 与 Card，保存并发布。
3. 进入“表单管理”，基于已发布模板或空白表单创建业务表单，在手机画布中增删和配置组件，保存后发布。
4. 打开 `/m/forms/<formCode>`，以内部账号填写、校验并提交。提交数据写入 `lowcode_submissions`，包含登录用户 ID 和表单发布版本。

## API 摘要

统一前缀 `/api/lowcode`，成功响应 `{code:0,data}`，失败使用对应 HTTP 状态与 `{code,msg}`。身份使用同源 HttpOnly Cookie；`GET /auth/me` 返回写请求需要的 CSRF token，客户端在 `x-lowcode-csrf` 请求头传回。

- `POST /auth/login`、`GET /auth/me`、`POST /auth/logout`。
- `GET /components` 返回已发布且可用于 mobile 的远程组件版本及 manifest。
- `GET/POST /templates`、`GET/PUT /templates/:id`、`POST /templates/:id/publish`、`GET /templates/:id/published`。
- `GET/POST /component-configs`、`GET/PUT /component-configs/:id`、`POST /component-configs/:id/publish`、`GET /component-configs/:id/published`；`id` 为 `组件名:精确版本`，URL 中需编码。
- `GET/POST /forms`、`GET/PUT /forms/:id`、`POST /forms/:id/publish`、`GET /forms/:id/published`、`POST /forms/:id/submissions`。
- `GET /forms/published` 供 C 端列出可填写表单；`GET /component-configs/:id/versions/:version` 供 B 端读取已锁定的配置版本。提交时必须传页面读取的 `publishVersion`，服务端按该快照校验并记录。

保存与发布均带 `revision`，冲突返回 409。B/M 只能访问对应草稿接口；C 只能读取已发布业务表单并提交。发布快照不可覆盖；旧 `/api/forms` 暂时保持独立。

## 验证

`node --test test/component-publish.test.js test/lowcode.test.js test/forms.test.js` 验证接口与发布链路。`node scripts/smoke-lowcode-schema.js` 在本机 MySQL 中创建临时数据库，执行 M→B→C API 场景，并在结束时删除临时数据库。浏览器中的真实手机视口和远程 JS 上传仍需按上述操作顺序手工验收。

### 三步模板配置（2026-10-20）

管理入口统一为 `/manage/templates`。新建模板信息与组件配置保留为浏览器草稿，完成第三步时才 POST `/api/lowcode/templates`；编辑时 PUT `/api/lowcode/templates/:id`，携带当前 `revision`。发布仍使用 POST `/templates/:id/publish`。

模板保存结构沿用 `schema` 和 JSON 列 `componentLocks`，无需数据库迁移。`schema` 为模板画布，`componentLocks` 的每个键为 schema 组件名，值除 `remoteName`、`version` 外，增加：

- `displayName`：显示名称。
- `defaultFieldSchema`：所选组件的初始 schema。
- `configSchema`：组件属性配置表单 schema。
- `configBindings`：配置字段到组件属性的映射。
- `configVersion: 0`：使用模板内置配置；旧记录继续使用独立配置表单的已发布版本。

允许保留已选择但未加入画布的内置组件。新选组件必须来自 active-components 且对应已发布版本；既有模板的锁定版本不随活跃版本切换。配置字段当前支持 Input、Switch，属性映射沿用现有各组件白名单。模板及其发布快照保存完整组件定义，B 端从模板创建表单时继承定义和配置面板，修改其他模板不会改变已发布版本。读取草稿接口同时返回服务端 `createdAt`。
