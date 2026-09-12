# Pi 界面定制版

基于 [minuque/pi-cc-extensions](https://github.com/minuque/pi-cc-extensions) 的 `v0.8.70`（`9f200064951ffb148ecec2e1cf0dab7a2940f823`），定制分支为 `quiet-ui`。

- Working 和 Thinking 保留转圈图标，文字后不显示省略号。
- Working 只显示转圈和文字。输入框下方采用 [pi-open-tui](https://github.com/OldSuns/pi-open-tui) 的两行底栏、图标、配色和分隔方式，耗时直接并入第一行，不再单独占一行。
- 第一行：左侧为目录、Git 状态、运行环境和耗时，右侧为上下文进度条、百分比及容量。第二行：左侧为模型与思考等级，右侧为输入/输出量、缓存命中率和费用；其他扩展的状态放在其下。
- 底栏单独使用 Pi 默认的 `dark` 配色，呈现 pi-open-tui 在默认深色主题下的颜色。对话区域继续使用当前主题；例如选择 `cc-dark` 时，底栏也保持默认配色。
- 新增 `cc-codex` 主题：参考 Codex CLI 的中性灰阶界面，输入框和消息卡片采用深灰底色，正文为灰白色，输入框边线保持灰色。链接、语法高亮、错误、警告和增删差异保留柔和的辨识颜色。原有 `cc-dark` 和 `cc-light` 仍可选择。
- `cc-codex` 同时将 Pi 运行时的终端底色设为 `#141414`，覆盖对话空白区、代码块底色、弹窗和底栏周围区域。输入框与卡片使用 `#303030`，次级面板使用 `#242424`，选中态使用 `#404040`。切换主题、重载或正常退出时恢复之前的终端底色；不改写终端应用的配色配置。
- 工具完成标记、技能调用和压缩摘要统一使用主题的成功色，不再固定显示荧光绿。
- 费用使用一个美元图标，例如 `$ 0.120`；普通图标和 Nerd Font 模式均不重复添加美元符号。
- 底部耗时覆盖整次运行中的生成和工具调用，结束后保留最终耗时，下次运行重新计时。右侧显示会话累计用量，并计入正在生成的输出；流式输出先估算，收到模型返回的用量后替换为实际计数。切换会话或重载时清除旧运行状态。
- 思考标题与 compact 摘要的文字颜色保持不变，移除扫光效果。
- 思考时间按已流逝的整秒显示：`0s → 1s → 2s`，不显示毫秒，也不提前四舍五入。
- 转圈按原有动画频率刷新，计时独立按已流逝的整秒显示。
- 保留 Pi 的上下文未知状态、告警颜色、订阅标识和其他扩展的状态。通过 Pi 的公开底栏接口安装，无需修改原生 FooterComponent。

已有的 `~/.pi/agent/open-tui.json` 中，`icons.mode` 和 `footerSegments` 会继续生效；没有配置时使用 pi-open-tui 的默认排布。只读取这两组设置，不改写该文件，也不需要同时安装 pi-open-tui。

## 安装

```bash
pi install git:github.com/Meowooh/pi-cc-extensions@quiet-ui
```

如已安装上游 npm 版本，先执行 `pi remove npm:pi-cc-extensions`，避免同时加载两份插件。使用本地路径安装的用户可以继续从本地仓库加载。

安装或更新后，在空闲的 Pi 会话执行 `/reload`。

输入 `/theme` 并选择 `cc-codex`，即可启用 Codex CLI 风格的整套配色。终端底色与输入框底色只在此主题下启用，继承 Pi 原生编辑器的中文输入、光标、粘贴、快捷键和补全功能；已由其他扩展提供编辑器时，继续使用该编辑器。底栏始终保持默认 Pi 深色配色。

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

- 203 项测试通过（使用隔离的配置目录），覆盖两行底栏、整秒边界、跨轮累计、停止计时、中文窄窗口、输入框光标与底色、终端背景恢复、主题切换、扩展状态和会话清理。
- TypeScript 类型检查、Biome 检查和 Git diff 空白检查通过。
- Pi 0.85.1 集成验证：完整扩展加载、Working 转圈指示器、输入框下方的实时与结束耗时、0–200 列终端宽度、默认底栏配色与对话主题独立、上下文告警颜色、压缩后的未知上下文、模型切换、重复加载与关闭恢复。使用本地模拟模型验证实际终端流式显示、设置弹窗、`/reload` 和正常退出时的背景恢复。

## 上游与许可

保留上游的工具渲染、上下文检查、主题等功能。源码沿用 [MIT 许可证](LICENSE)。`main` 保留 fork 时的上游分支，`quiet-ui` 提供本定制版。

底栏代码改编自 pi-open-tui 的 `d65d426cb79e25b0979644846482751418847212`，保留其 [MIT 许可](extensions/feature/shell/open-tui-footer/LICENSE) 与[来源说明](extensions/feature/shell/open-tui-footer/SOURCE.md)。

`cc-codex` 是本项目的 Pi 主题，视觉参考 [Codex CLI 的输入框与消息样式](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/tui/src/style.rs)。Codex 会根据终端底色调整面板颜色；这里使用固定深灰色，未复制 Codex 编辑器实现。
