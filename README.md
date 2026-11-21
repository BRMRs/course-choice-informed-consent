# 你确定不学吗？

校园课程充分知情选择系统。你可以自由选课，只是需要先证明自己有资格拒绝。

**在线演示：** https://brmrs.github.io/course-choice-informed-consent/

**源代码：** https://github.com/BRMRs/course-choice-informed-consent

为“用户讨厌、但又不得不用的 App”黑客松赛道制作的独立交互 Demo。所有学校、课程和回执均为虚构演示数据，无须登录，不接入真实教务系统。

## 跑起来

安装 Node.js 22 或以上版本，然后在此目录运行：

```sh
npm run dev
```

浏览器打开 http://localhost:4173 。没有第三方依赖，不需要安装依赖或配置密钥。

```sh
npm run check
npm test
```

正式 Demo 是原生 HTML、CSS 和 JavaScript 模块，通过 GitHub Pages 发布。进度保存在当前浏览器的 localStorage；不同设备不会同步。页面底部的“重新体验”经过确认后清空本地本次数据。

## 完整任务

你的目标：只选《机器学习》，拿到回执。

1. 搜索机器学习，发现完全匹配课程被综合适配度排到第四。
2. 打开目标课，办理一门重点推荐课的知情拒绝。
3. 阅读农业课简介、选择真实拒绝理由、回答环境数据理解题、确认拒绝。
4. 加入机器学习，看到刚被拒绝的农业课作为保障课自动加入。
5. 放弃保障席位，勾选声明并长按两秒；支持鼠标、触控和键盘空格。
6. 在“提交条件已满足、培养完整度 78%”的情况下，坚持按当前方案提交。
7. 核对仅含机器学习的课表，提交后获得一门、3 学分的回执。
8. 展开“选择权账单”，查看本次实际操作与设计解析。

答错可以重试，刷新会恢复已完成步骤。保障课只自动加入一次，移除后不回填；回执不会因重复提交改变。

## 为什么故意难用

| 机制 | 用户的意图 | 系统服务的目标 |
| --- | --- | --- |
| 搜索重排 | 找到自己想上的课 | 优先展示需要填满的课 |
| 拒绝资格考试 | 不选不感兴趣的课 | 提高拒绝的操作成本 |
| 保障课回填 | 保留已经明确的拒绝 | 把默认捆绑叫作权益保障 |
| 完整度施压 | 提交已经合规的课表 | 用分数诱导接受额外推荐 |

程序稳定执行，机构目标持续压过用户目标。这是有意设计的规则冲突，而不是随机报错或不可退出的陷阱。

## 产品与验证资料

- [PRD](docs/PRD.md)：产品范围、用户故事、演示脚本与验收要求。
- [原型结论](docs/prototype-verdict.md)：状态模型验证与实验分支。
- [发布验证记录](docs/release-check.md)：最终发布后记录真实验证结果。
- [实施 Issue #1](https://github.com/BRMRs/course-choice-informed-consent/issues/1)。

一次性状态原型保留在 [prototype/consent-state-model](https://github.com/BRMRs/course-choice-informed-consent/tree/prototype/consent-state-model) 分支，打开该分支的 `prototype-consent-state.html` 即可，无须安装。主分支只保留验证后的正式逻辑与页面。
