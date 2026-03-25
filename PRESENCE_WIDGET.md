# Presence 控件使用说明

控件是独立模块，不绑定在 `header/footer` 固定位置。
你可以在任意 EJS 模板或 Markdown 正文里插入。

## 1. 配置 API

在 `src/_data/theme.json` 的 `customConfig` 中配置：

```json
{
  "customConfig": {
    "presenceApi": "https://status.your-domain.com/v1/status",
    "presenceRefreshMs": 30000
  }
}
```

## 2. 在 EJS 中插入

```ejs
<%- include('../widgets/presence-widget', {
  id: 'presence-home',
  parts: ['device:pc', 'spotify'],
  refreshMs: 30000,
  style: 'card'
}) %>
```

如果你在 `src/_includes/layouts/post.ejs` 中插入，路径同样是：

```ejs
<%- include('../widgets/presence-widget', {
  parts: ['steam']
}) %>
```

## 3. 在 Markdown 中插入

```html
<div
  data-presence-widget
  data-api="https://status.your-domain.com/v1/status"
  data-parts="device:phone,steam"
  data-style="card"
  data-refresh-ms="30000">
</div>
```

## 4. `parts` 支持项

- `overall`
- `devices`
- `device:<kind_or_id>`（示例：`device:phone`、`device:pc-main`）
- `spotify`
- `steam`
- `dnd`
- `message`

简写支持：

- 当你已经写了一个 `device:` 选择器后，后续未带前缀且不属于内置模块名（`overall/devices/spotify/steam/dnd/message`）的 token，会自动按设备选择器处理。
- 例如：`device:pc,phone,steam` 会被解析为 `device:pc,device:phone,steam`。

组合示例：

- 仅手机：`device:phone`
- 仅 Steam：`steam`
- 电脑 + Spotify：`device:pc,spotify`
- 全量：`overall,devices,spotify,steam,dnd,message`

## 5. 显示策略

- 默认 `showEmpty=false`，未激活模块会自动隐藏。
- 如需占位展示，可设置：
- EJS：`showEmpty: true`
- HTML：`data-show-empty="true"`

## 6. 外观风格（style）

- `card`（默认）：卡片风格，层级最完整
- `compact`：紧凑风格
- `minimal`：极简风格（无边框背景）

示例：

- EJS：`style: 'compact'`
- HTML：`data-style="minimal"`

## 7. Steam 显示规则

- 现在默认会显示 `in_game` 和 `online` 两种状态。
- `offline` 仍会在 `showEmpty=false` 时隐藏；若你希望显示占位，请设置 `showEmpty=true`。
