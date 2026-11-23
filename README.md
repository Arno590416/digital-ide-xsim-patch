# Digital IDE 0.4.6：XSim 无工程仿真补丁

为 VS Code 的 Digital IDE 0.4.6 增加 XSim 仿真后端，让原有的“对当前模块进行仿真”按钮直接调用 Vivado 仿真工具，无需预先创建 Vivado 工程。

本仓库提供本地补丁及原始文件基线，不是完整的 Digital IDE 扩展，也不是上游官方发布版本。

## 为什么需要这个补丁

Digital IDE 0.4.6 的当前模块仿真按钮绑定了 Icarus 仿真命令。设置 Vivado 安装路径，或者把语法检查器设为 `vivado`，不会切换这个按钮的仿真器。

本补丁保留原有按钮和模块识别逻辑，增加可配置的后端选择，使用以下流程完成无工程仿真：

1. `xvlog`：编译 Verilog/SystemVerilog 源文件。
2. `xelab`：展开模块层次、解析参数及连接，生成仿真快照。
3. `xsim`：执行 testbench 并输出结果。

这个入口不要求 `.xpr` 工程、开发板型号、FPGA 器件型号或 `property.json`。原来的 `HARD Options` 工程仿真流程仍然保留。

## 已实现的功能

- 点击编辑器右上角原有按钮，仿真当前文件中的目标模块。
- 同一个文件包含多个模块时，弹出仿真顶层选择列表。
- 从模块树指定模块时，以该模块作为仿真顶层。
- 复用 Digital IDE 的模块依赖解析，并补充简单的本地 package 编译顺序处理。
- 支持额外源文件、include 目录、宏定义和展开阶段的库配置。
- 在 `Digital IDE XSim` 输出通道中显示命令、工具日志和 testbench 输出。
- 编译或展开失败时停止后续步骤；支持取消运行和逐阶段超时控制。
- 按“源文件路径＋顶层模块名”划分缓存目录。

**按钮不会批量运行 `tb` 目录下的所有 testbench。** 其他文件只有作为依赖或被显式加入源文件列表时，才会参与编译；仿真顶层仍是本次选择的模块。

## 使用环境

本补丁已在以下环境验证：

- Windows。
- VS Code，安装 Digital IDE **0.4.6**。
- Vivado **2025.2**，包含 `xvlog`、`xelab`、`xsim` 工具。

此补丁包含针对 0.4.6 发布文件的修改，不应直接覆盖其他版本的扩展。其他系统和工具版本尚未验证。

## 仓库文件说明

| 路径 | 用途 |
| --- | --- |
| `stage/out/xsim-runner.js` | 新增的 XSim 执行模块，主要功能源码 |
| `stage/out/extension.js` | 修改后的 Digital IDE 命令入口 |
| `stage/package.json` | 修改后的扩展配置声明 |
| `backup/extension.js` | 未修改的原始 0.4.6 主程序 |
| `backup/package.json` | 未修改的原始 0.4.6 配置声明 |
| `prepare.cjs` | 根据原始基线生成修改后的入口和配置声明 |
| `test.cjs` | 单文件、package/子模块依赖和语法错误测试脚本 |
| `LICENSE` | 上游 MIT 许可证声明 |

`stage` 是待安装文件；`backup` 是生成补丁与恢复原版所用的基线。它们都不是仿真缓存。

## 安装补丁

1. 确认安装的 Digital IDE 版本为 **0.4.6**。
2. 退出 VS Code，另行备份本机扩展中的 `out/extension.js` 和 `package.json`。不要覆盖本仓库的原始基线。
3. 找到本机扩展目录。Windows 默认位置通常为：

   ```text
   %USERPROFILE%\.vscode\extensions\sterben.fpga-support-0.4.6
   ```

4. 将 `stage` 中的三个文件复制到扩展目录的对应位置：

   | 仓库中的文件 | 扩展目录中的目标位置 |
   | --- | --- |
   | `stage/out/extension.js` | `out/extension.js` |
   | `stage/out/xsim-runner.js` | `out/xsim-runner.js` |
   | `stage/package.json` | `package.json` |

5. 重新打开 VS Code，并配置 Vivado 路径。

如果已经安装了本补丁，仅修改本仓库的 README 不需要重新安装插件。扩展更新可能覆盖本地补丁，需要针对更新后的版本重新检查适配情况。

## 配置与使用

在 VS Code 的用户设置或工作区设置 `settings.json` 中添加、合并以下设置。Vivado 路径请换成本机实际安装位置：

```json
{
  "digital-ide.prj.vivado.install.path": "D:/Vivado/2025.2/Vivado/bin",
  "digital-ide.function.simulate.backend": "xsim",
  "digital-ide.function.simulate.xsim.runtime": "all",
  "digital-ide.function.simulate.xsim.timeoutSeconds": 180,
  "digital-ide.function.simulate.xsim.files": [],
  "digital-ide.function.simulate.xsim.includes": [],
  "digital-ide.function.simulate.xsim.defines": [],
  "digital-ide.function.simulate.xsim.libraries": []
}
```

新后端也接受 Vivado 根目录，并尝试查找其下的 `bin` 目录；若同时使用 Digital IDE 原有工程入口，建议将上面的路径明确指向 `bin`。

| 设置后缀，均位于 `digital-ide.function.simulate` 下 | 默认值 | 含义 |
| --- | --- | --- |
| `backend` | `xsim` | 选择 `xsim`，或使用原有的 `icarus` 实现 |
| `xsim.runtime` | `all` | 运行到仿真结束，也可设为 `1 us` 等指定时长 |
| `xsim.timeoutSeconds` | `180` | 每个工具阶段的实际运行时间上限，单位为秒；最小值为 10 |
| `xsim.files` | `[]` | 额外参与编译的源文件 |
| `xsim.includes` | `[]` | 额外的头文件搜索目录 |
| `xsim.defines` | `[]` | 宏定义，例如 `SIMULATION` 或 `WIDTH=8` |
| `xsim.libraries` | `[]` | 传给展开阶段的库名 |

额外源文件及 include 目录中的相对路径，以当前文件所属工作区的根目录为基准；如果文件不属于打开的工作区，则使用文件所在目录。

打开 `.sv` 或 `.v` testbench，等待插件完成解析，点击右上角原有仿真按钮。在“输出”面板中选择 **Digital IDE XSim** 查看结果。启动前，后端会尝试保存已打开且有未保存修改的本地 HDL 文档；文件无法保存时会停止。

默认的 `all` 会执行 `run -all`。如果 testbench 有一直运行的时钟，应使用 `$finish` 主动结束，或把运行时长设为例如 `1 us`。这里的仿真时长与 `timeoutSeconds` 的实际耗时上限不同。

## 如何阅读输出

以下示例表示 testbench 在仿真时间 50 ns 主动结束：

```text
## run -all
HELLO_PASS
$finish called at time : 50 ns : File ".../hello.sv" Line 8
...
[XSim] Simulation completed.
```

正常查看运行结果时，可重点看 `run -all` 或指定时长的 `run` 命令之后的内容。排查问题时，还需要检查前面编译、展开阶段的错误和警告。

`HELLO_PASS` 是 testbench 自己打印的内容；`Simulation completed` 只表示工具流程正常结束，不代表电路功能已经通过全部检查。

## 缓存和相对数据文件路径

编译文件、运行脚本及日志保存在：

```text
<工作区根目录>/.digital-ide/xsim/<目标标识>/
```

其中 `inputs.json` 记录本次源文件、include 路径及宏定义，`run.tcl` 是运行脚本，其他文件由 Vivado 工具生成。

仿真运行时会切换到工作区根目录，便于按该目录解析 `$readmemh`、`$fopen` 等相对路径。单独打开工作区外的源文件时，则以该文件所在目录为基准。

停止仿真后可以删除缓存目录，下次会重新生成。建议用 `.gitignore` 排除 `.digital-ide/`、`*.log`、`*.jou`、`*.wdb` 等工具输出。

## 验证记录

以下是本次实现时已经完成的检查：

- 原编辑器按钮运行 `hello.sv`：输出 `HELLO_PASS`，在 50 ns 结束，无需 `property.json`。
- package 加子模块的 testbench：输出 `DEPENDENCY_PACKAGE_PASS`。
- 故意写错语法：在 `xvlog` 阶段停止，不继续调用 `xelab`。
- 在 VS Code 中取消持续运行的时钟仿真：输出 `Simulation cancelled`，相关仿真进程退出。
- 已安装文件与待安装文件的校验值一致，两个 JavaScript 文件通过语法检查。

使用 Node.js 可在仓库根目录执行 `node test.cjs`。该脚本目前引用了本次验证环境中的 Vivado 路径和 `D:/axi_lite_verify/tb/hello.sv`，在其他电脑运行前需调整这些路径；测试材料生成在 `tests` 目录中。

## 当前限制

- 面向 Verilog/SystemVerilog RTL testbench，暂不支持 VHDL。
- package 发现和排序采用有扫描上限的文本分析，并不是完整的 SystemVerilog 预处理器。
- 复杂宏、UVM/DPI、FPGA IP 和厂商原语库尚未完整适配；额外文件或库设置并不保证覆盖所有此类场景。
- 尚未实现批量运行所有 testbench、自动打开波形界面或完整的回归测试管理。
- 不自动生成时钟、复位和测试激励，需要用户提供 testbench。
- Windows 命令参数目前拒绝双引号、百分号和换行等字符，工作区路径也不能包含 Tcl 花括号。

## 恢复原插件

退出 VS Code，将 `backup/extension.js` 覆盖回扩展目录的 `out/extension.js`，将 `backup/package.json` 覆盖回扩展目录的 `package.json`，再重新打开 VS Code。

遗留的 `out/xsim-runner.js` 不再被原入口调用，可以保留；如需清理，可在退出 VS Code 后移除。

本次修改前原始 `extension.js` 的 SHA-256 为：

```text
654CFA4AB6D4EFA316E47681BAB552697FEF7AE5F02DB7812170F2137DDB03F4
```

也可将 `digital-ide.function.simulate.backend` 设为 `icarus`，切换到原 Icarus 后端。该选项不会卸载补丁，且需要本机具备可用的 Icarus 环境。

## 维护说明

`node prepare.cjs` 使用 `backup` 基线生成 `stage/out/extension.js` 和 `stage/package.json`，不生成 `xsim-runner.js`。它要求入口替换目标恰好出现一次；不符合预期时会停止。不要将它视为跨版本自动适配工具。

Git 管理的是仓库中的文件，实际运行的是 VS Code 扩展安装目录中的副本。修改或回退仓库源码后，需要把相关文件重新安装到扩展目录并重载 VS Code，运行版本才会变化。

## 上游来源与许可证

本补丁基于 [Digital-EDA/Digital-IDE](https://github.com/Digital-EDA/Digital-IDE) 的 0.4.6 发布文件制作。上游采用 MIT 许可证，保留 `Copyright (c) 2023 DIDE` 及完整许可声明，具体见本仓库的 `LICENSE`。
