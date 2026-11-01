# C 语言知识库（C Learn）

一个**零依赖、纯静态**的 C 语言知识点大全网站：整合课堂笔记、教材例题、实验知识点与个人练习代码，覆盖基础知识点、易错知识点与重难点，所有数值结论均经 GCC 实机编译验证。

**在线访问**：<https://c-knowledge-base.app.workbuddy.host/?sharecode=4MDPTPSEDY>

## 内容结构

| 版块 | 内容 |
|---|---|
| 第 0 篇 | 总览与速查（知识地图、十大高频陷阱） |
| 学习路线篇 | 零基础导学 01–20（默认折叠，点击展开） |
| 第 1–4 篇 | 语言基础 / 程序控制 / 数据组织与函数 / 进阶专题（含堆内存与文件进阶） |
| 第 5 篇 | 附录 A–G（关键字、错误速查、库函数、优先级、易错 TOP 60、随机数专题） |
| 实战练习篇 | HM01–HM14：个人练习代码 160+ 题（课后练习、分支应用题、ACM/实验/洛谷/巩固） |

## 站点结构

```
C_learn/
├── index.html        # 单页主体（目录树 + 正文 + 搜索）
└── assets/
    ├── style.css     # macOS 风格视觉系统
    ├── fonts.css     # 字体声明
    ├── app.js        # 交互（折叠目录、搜索、主题切换、阅读进度）
    └── fonts/        # 按文档字符集子集化的 woff2（Inter / Noto Sans SC / JetBrains Mono）
```

- 无任何框架与外部依赖，字体已子集化内嵌于 assets，**离线可用**
- 深色 / 浅色主题跟随系统，可手动切换
- 阅读进度自动保存（localStorage）

## 本地预览

直接双击 `index.html` 即可；或启动任意静态服务器：

```bash
python -m http.server 8080
# 访问 http://localhost:8080
```

## 部署

整个目录（index.html + assets/）即是完整站点，可托管到 GitHub Pages、Vercel、Netlify 等：

- **GitHub Pages**：仓库 Settings → Pages → 分支选 `main`、目录选 `/ (root)`
- 桌面端双击打开也没有跨域问题（无 fetch / module 依赖）

## 许可

- 站点代码与整理内容：仅供个人学习使用
- 字体：Inter、Noto Sans SC、JetBrains Mono（均为 SIL OFL 1.1 免费商用授权）
