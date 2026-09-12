# Pi 界面定制版

基于 [minuque/pi-cc-extensions](https://github.com/minuque/pi-cc-extensions) 的 `v0.8.70`（`9f200064951ffb148ecec2e1cf0dab7a2940f823`），定制分支为 `quiet-ui`。

- Working 和 Thinking 保留转圈图标，文字后不显示省略号。
- Working 只显示转圈和文字；参照 [pi-open-tui](https://github.com/OldSuns/pi-open-tui) 的底部信息分区，将耗时和本次输出量放到输入框下面：`◷ 12s | ↓ 1,234 tokens`。结束后保留最终耗时，下次运行重新计数。
- 底部耗时覆盖整次运行中的生成和工具调用，输出量累计所有轮次；流式输出先估算，收到模型返回的用量后替换为实际计数。切换会话或重载时清除旧状态。
- 思考标题与 compact 摘要的文字颜色保持不变，移除扫光效果。
- 思考时间按已流逝的整秒显示：`0s → 1s → 2s`，不显示毫秒，也不提前四舍五入。
- 转圈按原有动画频率刷新，计时独立按已流逝的整秒显示。
- 模型位于状态栏左侧，用量和上下文状态位于右侧。保留 Pi 原生统计、上下文告警颜色、订阅标识和其他扩展的状态。

## 安装

```bash
pi install git:github.com/Meowooh/pi-cc-extensions@quiet-ui
```

如已安装上游 npm 版本，先执行 `pi remove npm:pi-cc-extensions`，避免同时加载两份插件。使用本地路径安装的用户可以继续从本地仓库加载。

安装或更新后，在空闲的 Pi 会话执行 `/reload`。

顶部光条由 Pi 自身控制。在 `~/.pi/agent/settings.json` 的现有 `terminal` 对象中设置以下字段即可关闭：

```json
{
  "terminal": {
    "showTerminalProgress": false
  }
}
```

保留该文件中的其他配置。定制插件不会自动改写全局设置。

## 验证

- 195 项测试通过（使用隔离的配置目录），覆盖底部显示、整秒边界、跨轮累计、停止计时和会话清理。
- TypeScript 类型检查、Biome 检查和 Git diff 空白检查通过。
- Pi 0.85.1 集成验证：完整扩展加载、Working 转圈指示器、输入框下方的实时与结束耗时、0–200 列终端宽度、上下文告警颜色、压缩后的未知上下文、模型切换、重复加载与关闭恢复。使用本地模拟模型验证实际终端流式显示及 `/reload`。

## 上游与许可

保留上游的工具渲染、上下文检查、主题等功能。源码沿用 [MIT 许可证](LICENSE)。`main` 保留 fork 时的上游分支，`quiet-ui` 提供本定制版。
