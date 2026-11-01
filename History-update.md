# 2026-10-22

## 第一轮：C 语言知识点大全整理（MD + HTML）

**任务**：结合桌面 `C_review.md`、`C_summary.md`、`C语言全知.md` + 工作区全部资料，整理 C 语言基础/易错/重难点，输出 md 与 html。

### 资料盘点
- 桌面 3 份个人笔记（C_review 格式符与运算符、C_summary 教材脉络、C语言全知 目录式全知笔记，图片为 mubu 外链不可取）
- 工作区：`《新编C语言程序设计》（第2版）各章例题` 14 章共 320 个 .c（GBK 编码，需 `decode('gbk')` 读取）
- 附录 A–F：ASCII 表、运算符优先级 PDF、关键字大全、常见错误汇编、调试错误信息、库函数
- 4 份实验/作业知识点 docx（用 zipfile 解 `word/document.xml` 提取文本）
- `准确选择格式类型符解读.pptx`（4 页：类型截断/溢出/同内存不同格式符/double 读取）——价值很高，指出了"scanf %f 读 double 会内存错位"

### 交付物
- `outputs/C语言知识点大全.md` — 约 8.9 万字符 / 3513 行 / 162 代码块 / 87 表格 / 213 标题
- `outputs/C语言知识点大全.html` — 暗色主题自包含页面（414 KB），侧栏 TOC + 滚动高亮 + 全文搜索(Ctrl+K) + 代码高亮 + 复制按钮 + 移动端抽屉 + 打印样式
- `build/part1~7.md` 分片源 + `build/render.py`（markdown + pygments 渲染脚本）

### 风险标记体系
🔴 易错点(45) / 🟡 重难点(20) / 🔥 高频考点(185) / 💡 辨析延伸(38)；HTML 中转为彩色徽章，目录中转为小圆点。

### 关键：所有数值结论都经 GCC 实机验证，纠正了 6 处初稿错误
1. `printf("%d %d %d %d",++i,--i,i++,i--)` 是**未定义行为**，GCC16 输出 `8 8 7 8`（非初稿的 9 8 8 9）
2. 银行家舍入：`2.675` → **2.67**（二进制真值 2.6749999…），非 2.68；`0.125`→0.12
3. `short` 截断：40000(0x9C40) → **-25536**
4. 赋值 `=` 优先级**低于** `&&` 也低于 `||`（初稿写"高于 ||"是错的）
5. `sizeof("...........is good.")`=**20** / strlen=**19**（19 个可见字符）
6. `static` 局部变量 3 次调用 c 依次为 4/5/6，printf 显示 `6 5 4`（GCC 右→左求值）

### 工具链
- MinGW64 gcc 位于 `E:/MinGW64/bin/gcc`，可用于实机验证 C 代码
- Python venv：`C:/Users/35042/.workbuddy/binaries/python/envs/default`（已装 markdown + pygments）
- 读取 .doc 需按 UTF-16LE 提取；.docx 走 zipfile→document.xml；.pptx 走 zipfile→ppt/slides/slideN.xml

---

## 第二轮：HTML 界面视觉重设计（v2）

**用户反馈**：「界面美观一点，你不觉得目录很丑吗」→ 侧栏原本是 200+ 条平铺链接，无层级视觉、不可折叠。

### 目录重做
从「平铺链接列表」→ **可折叠树**：`篇(H1) → 章(H2) → 节(H3/H4)`，共 206 节点。
- 章/节标题抽出编号胶囊（`0.1` / `3.8` / `A`），篇级用 `第 N 篇` 徽章
- 层级导轨（左侧竖线）+ 折叠箭头（▸ 旋转 90°）
- 默认只展开「篇」层级，章及以下折叠；「展开全部」按钮一键展开
- 当前节高亮：左侧渐变指示条 + 自动滚动进视野
- 搜索时目录联动：命中项高亮、祖先链自动展开并标记 `.anc`、非命中降到 0.34 透明度

### 视觉与交互
- Hero 封面（标题+简介+4 个统计卡：25 章节/161 代码/87 表格/40 易错重难）
- 顶部阅读进度条（渐变）、篇级标题全幅分隔、章级标题左侧 accent 竖条
- 风险引用块 → 彩色卡片（`c-error/c-hard/c-hot/c-tip`，左侧色条+渐变底）
- 代码块 → 带语言标签(C/TXT)的代码面板 + 复制按钮
- 浅色/深色主题切换（跟随 `prefers-color-scheme`，localStorage 记忆）
- 搜索改为**下拉结果面板**（标题+摘要+`<mark>` 高亮+↑↓/Enter 键盘导航），不再是「隐藏正文块」
- 正文「目录」章节 → 卡片网格（每篇一张卡，章为条目，小节为 chip）

### 顺带修掉的 3 个真实内容 bug
1. **正文缺「第 2/3/4 篇」H1 标题** → 内置目录链到不存在的锚点，已补齐
2. **51 处代码块写在引用块内**（`> ```c`）→ Python-Markdown 的 fenced_code **不支持引用块内的围栏**，围栏内容泄漏成正文，其中 `#include`/`#define` 被误解析为 **H1 标题**（产生 `_1`/`01-c` 等垃圾锚点）。解法：渲染前用占位符把这类围栏抽出，渲染后再还原为代码面板
3. **中文锚点被 slugify 丢弃**（`第 13 章` → `13`）→ 自定义 `cn_slugify` 保留中文，214 个标题全部拥有可读中文锚点

### 经验
- Python-Markdown `toc` 扩展的 `slugify` 默认走 `unicodedata.normalize('NFKD')`，**中文会被整个丢弃**；必须传自定义 slugify 保留中文
- 默认 slugify 还会把 `：`/`（）` 等全角标点转成 `-`，导致链接与 id 对不上，需用同一套 slugify 重算 MD 内链
- emoji 若出现在 HTML `title` 属性里，全局 `str.replace(emoji)` 会破坏属性 → 正文替换与侧栏 tooltip 要分开处理（正文用纯文字 tooltip）
- Chrome headless 截图：`--window-size` 小于 ~526px 时会被 Windows 最小窗口宽度裁切而非缩放，判断移动端布局要读 `clientWidth`/`scrollWidth` 而非截图目视

---

## 第三轮：macOS 视觉风格 + 免费商用字体（v3）

**用户反馈**：「还是不太好看，你可以选择使用 mac 风格，字体换上免费可商用的好看字体」

### 字体方案（全部 SIL OFL 1.1，允许商用）
| 字体 | 用途 | 字重 | 裁剪后 |
|---|---|---|---|
| Inter | 界面西文 | 400/500/600/700 | 31 KB/套 |
| JetBrains Mono | 代码西文 | 400/700 | 24.6 KB/套 |
| Noto Sans SC（思源黑体） | 界面中文 | 400/700 | 238/241 KB |
| Noto Sans Mono CJK SC | 代码中文 | 400 | 236 KB |

**关键做法**：
1. 拉丁子集从 Google Fonts `css2` 取 woff2（需带浏览器 UA），URL 从 `@font-face` 的 `src` 正则提取
2. Google Fonts 的 `text=` 子集参数**对 css2 不可用**（HTTP 400），改走 GitHub 拉全量 OTF（notofonts/noto-cjk）再本地裁剪
3. 用 `fontTools.subset` 按**文档实际用到的字符**裁剪（MD 唯一字符 996 个 + UI 文案补充），思源黑体 16MB → 238KB woff2
4. 全部 base64 内联进 HTML，**完全离线自包含**

**踩坑**：Git Bash 的 MSYS 会把 heredoc 里的 `\s` 转成 `/s`，正则全废 → 脚本一律写成 `.py` 文件执行，别用 heredoc 内联正则。

### macOS 视觉语言（`build/macos.css`，独立文件便于迭代）
- **Unified Toolbar**：顶栏与侧栏统一 52px，交通灯三色圆点（红/黄/绿）
- **Vibrancy 材质**：`backdrop-filter: blur(28px) saturate(180%)` + `rgba(255,255,255,.72)` 半透明
- **系统色板**：`--ac:#007aff`、red `#ff3b30`、orange `#ff9f0a`、purple `#af52de`、teal `#30b0c7`
- **macOS 阴影分层**：`--sh-1` hairline → `--sh-4` 大浮层；描边用 `.5px solid rgba(0,0,0,.10)`
- **字重调整**：标题 700/650/600 递降，正文 400；字距 `-0.025em`（SF Pro 风格）
- **浅色为默认**（`body.dark` 才切深色），顶部用**分段控件**切换而非单按钮
- 圆角 10–12px、搜索框聚焦时蓝色 3.5px 光晕、滚动条细窄半透明

### 修掉的真实 bug
1. **代码块双重转义**：markdown 已把 `<`/`>`/`&`/`"` 转义一次，pygments 又转义一次 → `#include &lt;stdio.h&gt;`。
   解法：**先 `html.unescape()` 再喂 pygments**（`code_repl` 和 `render_code_panel` 两处都要改）
2. **目录卡片网格参差**：`display:grid` + `align-items:stretch` 让行高被最高卡片撑平，出现大片空白。
   解法：改用 `display:flex; flex-wrap:wrap; align-items:flex-start`，每章 `flex:1 1 250px` 自成一列
3. **侧栏首项误读**：「章节目录」入口被 `cur` 样式渲染成选中态像孤立应用项 → 独立 `.n-idx` 样式 + 渐变图标
4. 补了 `blockquote` 兜底样式（此前完全缺失）

### 验证方法
- 字体是否真生效：`document.fonts.check('400 16px Inter')` + `getComputedStyle(el).fontFamily`，比肉眼看截图可靠
- 毛玻璃是否真生效：读 `getComputedStyle(top).backdropFilter`，应为 `blur(28px) saturate(1.8)`
- 交付校验脚本 `build/final_check.py`：链接失效数、标签配对、@font-face 数量、双重转义计数、JS `--check` 语法

### 交付物（当前）
- `outputs/C语言知识点大全.html` — 1.72 MB（其中字体 1.19 MB base64）
- `outputs/C语言知识点大全.md` — 136 KB
- `build/macos.css`（27 KB 视觉层）+ `build/render.py`（渲染）+ `build/fonts/`（字体裁剪流水线）+ `build/final_check.py`（校验）

## 第二轮 UI 修复（用户截图反馈）
- 表格割裂感：`.main>table` 改为 `.tscroll` 外层滚动容器 + 内层 `display:table;width:100%`，表头灰条/斑马纹铺满整行（87 张表全部包裹）
- 代码块顶栏加 macOS 红黄绿三点（161 处，`.dots` + `.cbl` 结构）
- 移除顶部阅读进度条（#prog 元素/CSS/JS 全清）
- 去掉平滑滚动：删除 `scroll-behavior:smooth`，搜索跳转/回到顶部改为瞬时定位
- 已知坑：headless Chrome 对该大文档滚动后截图会输出空白（fragment 跳转和 JS scroll 均如此），改用「抽取相同样式 + 片段构造小测试页」截图验证

## 第三轮：学习指南整合 + 标注重做 + 站点拆分
- 《C语言学习指南.md》合并为「学习路线篇」（导学 01-20 + 学习路线建议），插在第 0 篇后；merge_guide.py 幂等；原 md 备份在 build/backup_C语言知识点大全.md
- 每个导学章带「🧭 路线对照」引用块指回详解章节，形成 路线→详解→清单 三层结构
- 风险标注重做：标题后 emoji 徽章 → 标题前置 .rkchip 彩色 SVG 图标芯片（102 处）+ 标题风险色短下划线；侧栏/卡片圆点移到文字前。坑：标题 class rk-* 会误匹配芯片背景选择器，必须写成 .rkchip.rk-error
- 页面拆分为多文件站点 outputs/site/：index.html(711KB) + assets/{style.css, fonts.css, app.js, fonts/*.woff2(933KB)}，删除旧单文件版；便于发布公网与浏览器缓存
- 字体：CJK 源字体经 jsDelivr 下载成功（GitHub 502）；Google Fonts text= 接口因 URL 过长被忽略、返回全量分片（12MB 坑），仍走 fontTools 本地裁剪（NotoSansSC 400/700 各 253KB，字符集 1055）
- 桌面 3 份笔记之外的第 4 份输入文档：C语言学习指南.md（工作区根目录）

## 第四轮：目录自动折叠 + 部署上线
- 目录交互：点击/搜索跳转到某节时 collapseTo(id) 只保留祖先链展开、其他分支自动折叠（手动「展开全部」按钮仍可用；滚动联动 setCur 不触发折叠，避免滚动时树乱跳）
- 已部署上线：https://c-knowledge-base.app.workbuddy.host/?sharecode=4MDPTPSEDY （static，outputs/site/，app 标识 wbapp .genie 在工作区根目录）

- 学习路线篇（导学版块）侧栏默认收起，其余编号篇默认展开；需手动或跳转时打开

- 主页面：学习路线篇折叠为 <details> 默认收起（route-block，点击标题展开）；正文「章节目录」卡片网格整体删除，侧栏快捷入口同步移除；阅读进度 localStorage 自动保存/恢复（c-kb-progress，回到顶部时清零）；跳转目标在折叠块内时 ensureVisible 自动展开
- 坑：.main>h1 .hpart 徽章选择器对 details 内的 h1 不生效，需补 .route-sum h1 .hpart

## 第五轮：修复导学 01–06 丢失
- 根因：7c 折叠块构造中 `inner = seg[m_route.end():]` 把全文绝对坐标当 seg 切片的相对下标用，seg 从 i0 起算导致 inner 错误地从全文 8635+8672≈17307 位置开始，导学 01–06 及导语全部被截掉（上次验证只截图了收起状态的 summary，没展开看内容，漏检）
- 修复：`inner = seg[m_route.end() - i0:]`；已验证折叠块内 20 个导学章 + 学习路线建议齐全、块外无泄漏、第 1 篇紧随其后
- 教训：验证 <details> 内容必须展开检查 inner 完整性，不能只看收起外观
- 已重新发布

## 第六轮：新增 %*d / %-*d 知识点（用户截图）
- 插入位置：第 2 篇 §4.3.5「动态宽度与精度」之后，新增「🔥 %*d 与 %-*d：用变量指定宽度的对齐输出」小节（右对齐前补空格 / 左对齐后补空格 + 记忆法），已渲染发布

## 第七轮：HM 练习代码并入 + 自检修错
- add_hm.py 把 D:/Learning/C/HM 全部 54 个练习程序（1.c–52.c + 1_1/1_2）按 8 个主题章并入「实战练习篇」（HM01 基础语法 → HM08 字符串），带标题/要点/踩坑标注；文件解码 utf-8 优先、gbk 兜底
- 真实错题标注：31.c arr[i+1] 越界（🔴）、33.c 未按需求去重（🔴）、11.c 区间 85 重叠、37.c 冗余 break
- 渲染器修复：表格行内代码的字面 \| 泄漏（markdown 表格转义竖线在 <code> 内不还原），md.convert 后统一 unescape；chapter_code 新增 HM 编号模式
- 自检：HTML 标签配对 0 失配、无乱码、折叠块 20 导学章完整；hero 统计自动更新（54 章/295 代码/111 表/50 徽标），简介补 HM 来源

## 第八轮：XX 新文档 + Learning/C 全量并入 + GitHub 仓库整理

- 知识库新增（add_round2.py，幂等锚点插入）：§3.11 补码与有符号/无符号解读（进制转化补码.docx，-128 特殊补码/整型提升 ffffff80）、§4.8 printf 四舍五入 4舍6入5成双（银行家舍入+IEEE754 近似提醒）、第 14 章 堆内存管理与文件进阶（HM 课程 PDF 09-12 蒸馏：malloc 四步曲/二级指针堆/mem*/sprintf 家族/fwrite fread/feof 先读后判/strstr）、附录 G.7 随机数专题（rand/srand 范围公式+固定最小差值随机小数）
- 实战练习篇新增 HM09-14 共 118 题：HM09 分支应用题（分支结构小程序 docx 9 题手工整理）、HM10-14 自动收录 D:/Learning/C 的 ACM/KC/LG/ME/PG（109 个 .c，标题取首条注释，utf8 优先解码）
- 坑：Windows glob *.c 与 *.C 大小写不敏感导致题数翻倍，用小写路径 set 去重；第3/4章节号已用到 3.10/4.7，新节编 3.11/4.8
- HM/ 13 个课程 PDF：12 个可 pypdf 提取（01 乱码跳过），仅蒸馏进阶内容（07-12），核心语法 02-06 已有覆盖不重复收
- 第5次选择结构.ppt 是图片型幻灯无法提文本，主题由第五次实验 docx 覆盖
- 站点：字符集增至 1208 → 字体重裁剪（fonts.css 1.41MB），index.html 1.35MB，标签配对 0 失配
- GitHub 仓库：D:/Web/C_learn（git init main + 首次提交，index.html + assets + README + .gitignore）
