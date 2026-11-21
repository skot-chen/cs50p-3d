# Python in 3D · CS50P 学习伴侣（非官方）

Harvard CS50P 十讲（Lecture 0–9）的学习网站：每讲一个可以动手玩的 3D 记忆场景、按章节跳转的视频、可编辑可运行的代码例子、先猜再看的小练习和英文词汇。

Live: https://skot-chen.github.io/cs50p-3d/

- 纯静态，零构建依赖：Three.js 和 Pyodide 都从 CDN 加载。
- 内容写在 `content/lectures.py`。改完运行 `python scripts/build.py`：它会用真实 Python 运行每一段代码，把输出和练习答案写进 `data/lectures.json`，有任何一段出错就失败。
- 本地预览：`python -m http.server 8783`。

课程视频和作业版权归 CS50 / Harvard 所有，本站只是非官方学习笔记，链接到官方内容。
