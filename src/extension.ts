import * as vscode from 'vscode';
import createEditorHintFile from './commands/CreateEditorHintCmd';
import {RegisterHacknetXmlCodeHint} from './code-hint/CodeHint';
import * as GlobalHacknetXmlNodeHolder from './worker/GlobalHacknetXmlNodeHolder';
import {RegisterHacknetColorProvider} from './decorator/XmlTextColorProvider';
import * as CommonUtils from './utils/CommonUtils';
import { RegisterHackerScriptsHightlight } from "./decorator/HackerScriptFuncDecorator";
import { RegisterHacknetReplaceTextHightlight } from "./decorator/HackerReplaceTextDecorator";
import { RegisterCreateHacknetResourceFileCommands } from "./commands/CreateHacknetResourceFileCmd";
import { RegiserHacknetThemeView } from "./view/ThemeViewer";
import { StartDiagnostic } from "./diagnostic/HacknetFileDiagnostic";

export function activate(context: vscode.ExtensionContext) {

	CommonUtils.SetExtensionContext(context);

	// 代码提示
	RegisterHacknetXmlCodeHint(context);

	// 注册创建编辑器提示文件命令
	context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createEditorHintFile', () => {
		createEditorHintFile(context);
	}));

	// 注册代码提示命令
	context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.triggerHint', () => {
        const editor = vscode.window.activeTextEditor;
		if (!editor) {return;}
		vscode.commands.executeCommand('editor.action.triggerSuggest');
    }));

	// 注册创建hacknet资源文件命令
	RegisterCreateHacknetResourceFileCommands(context);

	// 扫描其他xml文件
	GlobalHacknetXmlNodeHolder.StartHacknetNodeScan(context);
	// 工作目录改变重新扫描
	vscode.workspace.onDidChangeWorkspaceFolders(event => {
		GlobalHacknetXmlNodeHolder.StopScanWorker();
		GlobalHacknetXmlNodeHolder.StartHacknetNodeScan(context);
	});

	// 创建xml颜色提供器
	RegisterHacknetColorProvider(context);

	// 创建hackerScripts脚本方法高亮装饰器
	RegisterHackerScriptsHightlight();

	// 创建可替换文本的高亮显示
	RegisterHacknetReplaceTextHightlight();

	// 开始文件诊断
	StartDiagnostic();

	// 注册主题视图
	RegiserHacknetThemeView(context);
}


export function deactivate() {
	// 停止扫描
	GlobalHacknetXmlNodeHolder.StopScanWorker();
}
