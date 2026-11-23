'use strict';
// Digital IDE 0.4.6 local XSim backend. Original module selection stays in Digital IDE.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
let channel;
const active = new Set();
const unique = xs => [...new Set(xs)];
const clean = text => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, '');

function packageOrder(files, roots) {
    const index = new Map();
    const texts = new Map();
    const ignored = new Set(['.git', '.vscode', '.Xil', 'node_modules', 'prj', 'icarus', 'netlist', 'xsim.dir', '.digital-ide']);
    let count = 0;
    function read(file) {
        if (!texts.has(file)) texts.set(file, clean(fs.readFileSync(file, 'utf8')));
        return texts.get(file);
    }
    function scan(dir) {
        if (!fs.existsSync(dir) || count > 4000) return;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, ent.name);
            if (ent.isDirectory() && !ignored.has(ent.name)) scan(file);
            else if (ent.isFile() && /\.sv$/i.test(file) && ++count <= 4000) {
                for (const m of read(file).matchAll(/\bpackage\s+(?:(?:automatic|static)\s+)?([A-Za-z_]\w*)\s*;/g)) {
                    if (!index.has(m[1])) index.set(m[1], []);
                    index.get(m[1]).push(file);
                }
            }
        }
    }
    unique(roots).forEach(scan);
    const ordered = [], visiting = new Set(), done = new Set();
    function visit(file) {
        file = path.resolve(file);
        if (done.has(file)) return;
        if (visiting.has(file)) throw new Error('Cyclic package compilation dependency: ' + file);
        if (!fs.existsSync(file)) throw new Error('Source file not found: ' + file);
        visiting.add(file);
        const text = read(file);
        const declared = new Set([...text.matchAll(/\bpackage\s+(?:(?:automatic|static)\s+)?([A-Za-z_]\w*)\s*;/g)].map(m => m[1]));
        for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*::/g)) {
            if (declared.has(m[1]) || !index.has(m[1])) continue;
            const candidates = unique(index.get(m[1]).map(p => path.resolve(p)));
            if (candidates.length > 1) throw new Error('Multiple definitions of package ' + m[1] + ': ' + candidates.join(', '));
            if (candidates[0] !== file) visit(candidates[0]);
        }
        visiting.delete(file); done.add(file); ordered.push(file);
    }
    files.forEach(visit);
    return ordered;
}

function stopTree(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
        const killer = cp.spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
    } else child.kill('SIGTERM');
}

function command(tool, args, cwd, log, token, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (token && token.isCancellationRequested) return reject(new Error('Simulation cancelled.'));
        log('$ ' + [tool, ...args].map(a => JSON.stringify(a)).join(' ') + '\n');
        let child;
        // Use the vendor batch launchers so their required environment is initialized.
        // Arguments pass through environment variables; reject CMD expansion characters.
        if (process.platform === 'win32') {
            const all = [tool, ...args];
            if (all.some(a => /["%\r\n\0]/.test(a))) return reject(new Error('Unsupported quote, percent sign or newline in command argument.'));
            const env = { ...process.env };
            all.forEach((a, i) => { env['DIDE_XSIM_ARG_' + i] = a; });
            const line = '"' + all.map((_, i) => '"%DIDE_XSIM_ARG_' + i + '%"').join(' ') + '"';
            child = cp.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/s', '/c', line], {
                cwd, env, windowsHide: true, windowsVerbatimArguments: true
            });
        } else child = cp.spawn(tool, args, { cwd, windowsHide: true });
        let cancelled = false, timedOut = false;
        const subscription = token && token.onCancellationRequested(() => { cancelled = true; stopTree(child); });
        const timer = setTimeout(() => { timedOut = true; stopTree(child); }, timeoutMs);
        child.stdout.on('data', b => log(b.toString()));
        child.stderr.on('data', b => log(b.toString()));
        function cleanup() { clearTimeout(timer); if (subscription) subscription.dispose(); }
        child.on('error', e => { cleanup(); reject(e); });
        child.on('close', code => {
            cleanup();
            if (cancelled) reject(new Error('Simulation cancelled.'));
            else if (timedOut) reject(new Error('Tool timed out; child processes stopped.'));
            else if (code !== 0) reject(new Error(path.basename(tool) + ' failed, exit code ' + code + '. See output above.'));
            else resolve();
        });
    });
}

async function runSimulation(manifest, opts, log, token) {
    const root = path.resolve(manifest.workspace || path.dirname(manifest.file));
    let bin = path.resolve(opts.bin);
    const suffix = process.platform === 'win32' ? '.bat' : '';
    if (!fs.existsSync(path.join(bin, 'xvlog' + suffix))) bin = path.join(bin, 'bin');
    for (const tool of ['xvlog', 'xelab', 'xsim']) {
        if (!fs.existsSync(path.join(bin, tool + suffix))) throw new Error('Vivado tool not found: ' + path.join(bin, tool + suffix));
    }
    const resolveInput = p => path.resolve(root, p);
    const sources = unique([...(opts.files || []).map(resolveInput), ...(manifest.dependencies || []), manifest.file].map(p => path.resolve(p)));
    if (sources.some(p => !/\.(sv|v)$/i.test(p))) throw new Error('This backend currently supports Verilog/SystemVerilog source files only.');
    const files = packageOrder(sources, [root]);
    const includes = unique([root, path.dirname(manifest.file), ...files.map(p => path.dirname(p)), ...(manifest.includes || []), ...(opts.includes || []).map(resolveInput)]);
    const key = crypto.createHash('sha256').update(path.resolve(manifest.file) + ':' + manifest.top).digest('hex').slice(0, 12);
    const cache = path.join(root, '.digital-ide', 'xsim', key);
    fs.mkdirSync(cache, { recursive: true });
    log('[XSim] Non-project simulation; top=' + manifest.top + '\nCache: ' + cache + '\n');
    const snapshot = 'dide_' + key;
    const compileArgs = ['-work', 'work', '-sv'];
    includes.forEach(p => compileArgs.push('-i', p));
    (opts.defines || []).forEach(d => compileArgs.push('-d', d));
    compileArgs.push(...files);
    fs.writeFileSync(path.join(cache, 'inputs.json'), JSON.stringify({ top: manifest.top, files, includes, defines: opts.defines || [] }, null, 2));
    await command(path.join(bin, 'xvlog' + suffix), compileArgs, cache, log, token, opts.timeoutMs || 180000);
    const elaborateArgs = ['work.' + manifest.top, '-s', snapshot, '-debug', 'typical', '-timescale', '1ns/1ps'];
    (opts.libraries || []).forEach(lib => elaborateArgs.push('-L', lib));
    await command(path.join(bin, 'xelab' + suffix), elaborateArgs, cache, log, token, opts.timeoutMs || 180000);
    const runtime = opts.runtime || 'all';
    if (!/^(all|\d+(?:\.\d+)?\s*(?:fs|ps|ns|us|ms|s))$/.test(runtime)) throw new Error('Runtime must be all or a duration such as 1 us.');
    const tcl = ['# Working directory preserves relative $readmemh/$fopen paths.',
        'cd {' + root.replace(/\\/g, '/').replace(/[{}]/g, '') + '}',
        'run ' + (runtime === 'all' ? '-all' : runtime), 'quit'];
    if (/[{}]/.test(root)) throw new Error('Workspace path must not contain Tcl braces.');
    const tclFile = path.join(cache, 'run.tcl');
    fs.writeFileSync(tclFile, tcl.join('\n') + '\n');
    await command(path.join(bin, 'xsim' + suffix), [snapshot, '-tclbatch', tclFile.replace(/\\/g, '/')], cache, log, token, opts.timeoutMs || 180000);
    log('\n[XSim] Simulation completed.\n');
    return { cache, files };
}

async function dispatch(arg, context, IcarusSimulate) {
    const vscode = require('vscode');
    let config = vscode.workspace.getConfiguration('digital-ide', arg && arg.fsPath ? arg : undefined);
    if (config.get('function.simulate.backend', 'xsim') !== 'xsim') return new IcarusSimulate(context).simulateFile(arg);
    if (!channel) { channel = vscode.window.createOutputChannel('Digital IDE XSim'); context.subscriptions.push(channel); }
    try {
        const editor = vscode.window.activeTextEditor;
        const file = arg && (arg.fsPath || arg.path) || editor && editor.document.uri.fsPath;
        if (!file || !/\.(sv|v)$/i.test(file)) throw new Error('Open a Verilog/SystemVerilog file before simulating.');
        const uri = vscode.Uri.file(file);
        config = vscode.workspace.getConfiguration('digital-ide', uri);
        const workspace = vscode.workspace.getWorkspaceFolder(uri);
        if (workspace && !vscode.workspace.isTrusted) throw new Error('Trust this workspace before running local HDL simulation.');
        const opened = vscode.workspace.textDocuments.filter(d => d.uri.scheme === 'file' && d.isDirty && /\.(sv|v|svh|vh)$/i.test(d.fileName));
        for (const doc of opened) if (!await doc.save()) throw new Error('Could not save ' + doc.fileName);
        const resolver = new IcarusSimulate(context);
        let mod = await resolver.tryGetModuleFromView({ path: file, name: arg && arg.name });
        if (!mod) throw new Error('Digital IDE has not resolved a module in this file. Wait for HDL parsing, then try again.');
        if (!(arg && arg.name)) {
            const modules = mod.file.getAllHdlModules();
            if (modules.length > 1) {
                const selected = await vscode.window.showQuickPick(modules.map(m => ({ label: m.name, module: m })), { placeHolder: 'Select XSim simulation top module' });
                if (!selected) return;
                mod = selected.module;
            }
        }
        const key = path.resolve(file).toLowerCase() + ':' + mod.name;
        if (active.has(key)) throw new Error('This simulation is already running. Cancel it before starting again.');
        const deps = mod.getAllDependences();
        if ((deps.others || []).includes('xilinx-primitives')) throw new Error('This first version targets RTL testbenches. FPGA primitives/IP require explicit simulation libraries.');
        const manifest = { file, top: mod.name, workspace: workspace ? workspace.uri.fsPath : path.dirname(file),
            dependencies: unique([...(deps.current || []), ...(deps.others || [])]),
            includes: unique((deps.include || []).map(p => path.dirname(p))) };
        const bin = config.get('prj.vivado.install.path', '');
        if (!bin) throw new Error('Set digital-ide.prj.vivado.install.path to the Vivado bin directory.');
        const opts = { bin, files: config.get('function.simulate.xsim.files', []), includes: config.get('function.simulate.xsim.includes', []),
            defines: config.get('function.simulate.xsim.defines', []), libraries: config.get('function.simulate.xsim.libraries', []),
            runtime: config.get('function.simulate.xsim.runtime', 'all'), timeoutMs: config.get('function.simulate.xsim.timeoutSeconds', 180) * 1000 };
        active.add(key); channel.clear(); channel.show(true);
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'XSim: ' + mod.name, cancellable: true },
                (_, token) => runSimulation(manifest, opts, text => channel.append(text), token));
        } finally { active.delete(key); }
    } catch (error) {
        channel.appendLine('\n[XSim ERROR] ' + error.message); channel.show(true);
        vscode.window.showErrorMessage('XSim: ' + error.message);
    }
}

module.exports = { dispatch, runSimulation, packageOrder, command };
