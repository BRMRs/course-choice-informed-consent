# 你确定不学吗？ · 选课工作台

[在线访问](https://brmrs.github.io/course-choice-informed-consent/) · [源代码](https://github.com/BRMRs/course-choice-informed-consent)

面向“用户讨厌、但又不得不用的 App”赛道的校园选课原型。v2 按真实业务工作台重做：课程表格、完整课程资料、检索与筛选、选退课、学分与时间冲突校验、每周课表、方案提交及历史版本。页面使用虚构学生和课程资料，不连接真实学校。

## 本地运行

Node.js 22 或以上版本，无第三方依赖。

```sh
npm run dev
```

打开 http://localhost:4173/ 。如果端口占用，可通过 `PORT=4180 npm run dev` 更改端口。

```sh
npm run check
npm test
```

## 实际可用的业务

- 12 门课程，支持课程名称、课程号、教师搜索，学院、类别、余位过滤和三种排序。
- 每门课都有完整简介、教学内容、考核方式、教师、容量和时间地点。
- 任意开放课程可以选退；满员、时间冲突、3—12 学分限制均真实校验。
- 待提交方案与已提交结果分开；每周课表可切换两个方案。
- 提交前核对课程快照；提交后可通过“调整选课”创建下一版本，历史结果保留。
- `#/courses`、`#/timetable`、`#/results` 支持直接访问、刷新与浏览器返回。
- 进度与手续保存到浏览器；支持 Web Locks 的浏览器以跨标签独占事务保存，不支持时使用独立标签页存储。

## 制度阻碍如何进入业务

默认搜索“机器学习”会优先展示三门重点推荐课。直接点击机器学习的“选课”会触发知情确认手续，要求阅读课程、填写不接受推荐的原因并完成理解核验。通过后目标课正常加入，同时一次性配置已拒绝课程的保障席位。保障席位退选要确认声明并持续长按两秒；撤销后不再回填。核对提交时，系统以78分的培养建议施压，但满足真实学分条件的方案仍可提交。

这些手续嵌在正常的选课、退选、核对操作中。主界面不展示设计解析、任务卡或讲解脚本。一个标准成功路径是：搜索机器学习 → 点击选课 → 完成知情确认 → 退选农业保障席位 → 核对并提交 → 结果仅含机器学习。用户也可以自行选择其他课程并提交有效组合。

## 文档与来源

- [本轮重做基线](docs/workbench-redesign.md)
- [原始PRD及其覆盖说明](docs/PRD.md)
- [v2 工作台验证记录](docs/workbench-verification.md)
- [v1 历史发布记录](docs/release-check.md)
- [重做 Issue #4](https://github.com/BRMRs/course-choice-informed-consent/issues/4)
- v1 状态探索保留在 [prototype/consent-state-model](https://github.com/BRMRs/course-choice-informed-consent/tree/prototype/consent-state-model) 分支，未混入主应用。
