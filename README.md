# Digital IDE 0.4.6: XSim current-module button patch

Installed on 2026-11-23 for the local Digital IDE 0.4.6 installation.

The existing current-module simulation command now dispatches to `out/xsim-runner.js`.
The default backend is `xsim`; setting `digital-ide.function.simulate.backend` to
`icarus` restores the original Icarus implementation. The existing HARD Options
project flow is unchanged. No `.xpr`, board, device, or property.json is required
for the current-module XSim backend.

## Use

Open a `.sv` or `.v` testbench and click the original simulation button at the
top right. Results appear in the `Digital IDE XSim` output channel. Multiple
modules in a source file trigger a top-module picker. The selected workspace
root is used for relative data-file paths. Compilation artifacts and logs are
stored under `.digital-ide/xsim/<target-hash>`.

Vivado path: `D:/Vivado/2025.2/Vivado/bin` (the backend also accepts its parent).

Optional settings:

```json
{
  "digital-ide.function.simulate.backend": "xsim",
  "digital-ide.function.simulate.xsim.runtime": "all",
  "digital-ide.function.simulate.xsim.timeoutSeconds": 180,
  "digital-ide.function.simulate.xsim.files": [],
  "digital-ide.function.simulate.xsim.includes": [],
  "digital-ide.function.simulate.xsim.defines": [],
  "digital-ide.function.simulate.xsim.libraries": []
}
```

Use a duration such as `1 us` instead of `all` for a testbench without `$finish`.
The timeout applies separately to each tool, in wall-clock seconds. Use the
progress notification's Cancel button to stop the current process tree.

## Scope and limits

This version targets Verilog/SystemVerilog RTL testbenches. It reuses Digital
IDE's module dependencies, adds include directories, and orders simple local
package dependencies. Package discovery is a bounded textual scan, not a full
SystemVerilog preprocessor. Complex macros, UVM/DPI and FPGA IP/library setups
can require an explicit file list and library configuration; VHDL and automatic
waveform GUI integration are not implemented. A compilation error stops later
steps. Simulation completion is not itself a functional PASS verdict.

## Validation

- Actual original toolbar button on `D:/axi_lite_verify/tb/hello.sv`: `HELLO_PASS`
  at 50 ns with no project property.json.
- Package plus instantiated DUT: `DEPENDENCY_PACKAGE_PASS`.
- Deliberate syntax error: rejected by xvlog, no xelab invocation.
- Actual VS Code Cancel button: a free-running clock testbench stopped with
  `Simulation cancelled`; no Vivado/XSim simulation processes remained.
- Installed files matched staged SHA-256 values; both JS files passed syntax checks.

## Restore original plugin

Original bundle SHA-256:
`654CFA4AB6D4EFA316E47681BAB552697FEF7AE5F02DB7812170F2137DDB03F4`

Close VS Code, copy `backup/extension.js` to the extension's `out/extension.js`
and `backup/package.json` to its `package.json`, then reopen VS Code. Leaving
the unused `out/xsim-runner.js` in place is harmless.

The extension directory is:
`C:/Users/Arno/.vscode/extensions/sterben.fpga-support-0.4.6`.

For reinstallation on the same version, copy the contents of `stage` into that
directory. Extension updates may replace this local customization. Do not apply
the old compiled bundle over a different extension version. `prepare.cjs`
requires exactly one recognized dispatcher anchor and refuses ambiguous input.
