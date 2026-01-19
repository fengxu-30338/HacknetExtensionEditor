import * as vscode from 'vscode';
import { EventManager } from './event/EventManager';
import {CheckHacknetEditorHintFileExist, HintFileExistRule, CreateHacknetEditorHintFileInWorkspaceRoot, CheckExtensionTipUserCreateHintFile} from './commands/CreateEditorHintCmd';
import {RegisterHacknetXmlCodeHint} from './code-hint/CodeHint';
import * as GlobalHacknetXmlNodeHolder from './worker/GlobalHacknetXmlNodeHolder';
import {RegisterHacknetColorProvider} from './decorator/XmlTextColorProvider';
import * as CommonUtils from './utils/CommonUtils';
import { RegisterHackerScriptsHightlight } from "./decorator/HackerScriptFuncDecorator";
import { RegisterHacknetReplaceTextHightlight } from "./decorator/HackerReplaceTextDecorator";
import { RegisterCreateHacknetResourceFileCommands } from "./commands/CreateHacknetResourceFileCmd";
import { RegiserHacknetThemeView } from "./view/ThemeViewer";
import { StartDiagnostic } from "./diagnostic/HacknetFileDiagnostic";
import { RegisterTutorialViewer } from "./view/TutorialViewer";
import { RegisterHacknetNodeViewer } from "./view/HacknetNodeViewer";
import RegisterSelectHacknetExtensionCmd from './commands/SelectHacknetExtensionCmd';

export async function activate(context: vscode.ExtensionContext) {

	CommonUtils.SetExtensionContext(context);

	// 检测当前工作目录是否是Hacknet扩展目录并提示用户创建编辑器提示文件
	await CheckExtensionTipUserCreateHintFile(context);

	// 每次激活覆盖提示文件如果存在的话
	if (await CheckHacknetEditorHintFileExist()) {
		console.log("存在Hacknet-EditorHint文件,将被覆盖");
		await CreateHacknetEditorHintFileInWorkspaceRoot(context, HintFileExistRule.Overwrite, false);
	}

	// 代码提示
	RegisterHacknetXmlCodeHint(context);

	// 注册创建编辑器提示文件命令
	context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.createEditorHintFile', () => {
		CreateHacknetEditorHintFileInWorkspaceRoot(context, HintFileExistRule.Ask, true);
	}));

	// 注册代码提示命令
	context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.triggerHint', () => {
        const editor = vscode.window.activeTextEditor;
		if (!editor) {return;}
		vscode.commands.executeCommand('editor.action.triggerSuggest');
    }));

	// 注册创建hacknet资源文件命令
	RegisterCreateHacknetResourceFileCommands(context);

	// 注册选择Hacknet扩展命令
	RegisterSelectHacknetExtensionCmd(context);

	// 扫描其他xml文件
	GlobalHacknetXmlNodeHolder.StartHacknetNodeScan(context);

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

	// 注册教程视图
	RegisterTutorialViewer(context);

	// 注册节点视图
	RegisterHacknetNodeViewer(context);
}


export function deactivate() {
	// 停止扫描
	GlobalHacknetXmlNodeHolder.StopScanWorker();
	// 移除所有事件监听器
	EventManager.removeAllListeners();
}
