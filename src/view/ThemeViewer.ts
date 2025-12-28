import * as vscode from 'vscode';
import { XmlParser } from '../parser/XmlParser';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from "../event/EventManager";
import * as CommonUtils from '../utils/CommonUtils';
import path from 'path';
import * as fs from 'fs';
import lodash from "lodash";

const xmlParser = new XmlParser();
let lastTextEditor:vscode.TextEditor | null = null;
const infoDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#556412ad'
});

export function RegiserHacknetThemeView(context: vscode.ExtensionContext) {
    // 注册调试主题命令
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.themeDebug',DebugThemeCommand));

    // 初始化并监听切换到主题页面才显示主题webview
    InitStatusBarOnlyInThemeFile(context);

    // 监听文档变化发送发送最新配置给vscode
    ListenEditorDocumentChange();
}

// 监听文档变化发送发送最新配置给vscode
function ListenEditorDocumentChange() {
    OnEditorFileChangedForChangeThemeWebview();
    const eventFunc = lodash.debounce(OnEditorFileChangedForChangeThemeWebview, 200);

    const context = CommonUtils.GetExtensionContext();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(eventFunc));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(eventFunc));

}

// 编辑器文本改变时，同步配置到主题webview
function OnEditorFileChangedForChangeThemeWebview() {
    if (!CheckActiveEditorFileIsTheme()) {
        return;
    }

    const themeWebView = ThemeWebView.GetInstance();
    if (themeWebView.HasPanel) {
        lastTextEditor = vscode.window.activeTextEditor ?? null;
    }
    themeWebView.SetThemeFileContent(vscode.window.activeTextEditor!.document.getText());
}


// 调试主题命令
function DebugThemeCommand(...args: any[]) {
    if (!CheckActiveEditorFileIsTheme()) {
        vscode.window.showWarningMessage('当前编辑器未打开或打开的文件不是Hacknet主题文件');
        return;
    }
    lastTextEditor = vscode.window.activeTextEditor ?? null;
    const themeWebView =  ThemeWebView.GetInstance();
    themeWebView.Show();
    themeWebView.SetThemeFileContent(vscode.window.activeTextEditor!.document.getText());
}


// 初始化并监听切换到主题页面才显示主题webview
function InitStatusBarOnlyInThemeFile(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(browser) 调试主题";
    statusBarItem.tooltip = "在线调试Hacknet主题";
    statusBarItem.command = "hacknetextensionhelper.themeDebug";
    statusBarItem.hide();
    context.subscriptions.push(statusBarItem);

    vscode.window.onDidChangeActiveTextEditor(_ => OnEditorFileChangedForChangeStatusBar(statusBarItem));
    vscode.window.onDidChangeVisibleTextEditors(_ => OnEditorFileChangedForChangeStatusBar(statusBarItem));
    EventManager.onEvent(EventType.HacknetNodeFileChange, e => {
        if (e.modify === 'add' && e.type === HacknetNodeType.Theme) {
            OnEditorFileChangedForChangeStatusBar(statusBarItem);
        }
    });
}

// 检查当前编辑器内容是否是主题类型
function CheckActiveEditorFileIsTheme():boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return false;
    }

    const filepath = editor.document.fileName;
    const nodeType = hacknetNodeHolder.GetNodeTypeByFilepath(filepath);
    if (nodeType === null || nodeType !== HacknetNodeType.Theme) {
        return false;
    }

    return true;
}

// 监听编辑器改变
function OnEditorFileChangedForChangeStatusBar(statusBarItem: vscode.StatusBarItem) {
    if (CheckActiveEditorFileIsTheme()) {
        statusBarItem.show();
        return;
    }

    statusBarItem.hide();
}


class ThemeWebView {
    private static _instance:ThemeWebView;
    private panel:vscode.WebviewPanel | null = null;
    private editorDecDisposeMap:Map<vscode.TextEditor, number> = new Map();

    private constructor() {
        setInterval(() => {
            this.Update();
        }, 1000);
    }

    public static GetInstance():ThemeWebView {
        if (!ThemeWebView._instance) {
            ThemeWebView._instance = new ThemeWebView();
        }

        return ThemeWebView._instance;
    }

    private Update() {
        const waitDelKeys:vscode.TextEditor[] = [];
        this.editorDecDisposeMap.forEach((disposeTime, editor) => {
            if (Date.now() >= disposeTime) {
                editor.setDecorations(infoDecoration, []);
                waitDelKeys.push(editor);
            }
        });
        waitDelKeys.forEach(editor => this.editorDecDisposeMap.delete(editor));
    }

    private resourcePathToVscodeWebviewPath(localResourceRootUri: vscode.Uri, oldPath: string):vscode.Uri {
        const resourceUri = vscode.Uri.joinPath(localResourceRootUri, oldPath);
        return this.panel!.webview.asWebviewUri(resourceUri);
    }

    public get HasPanel():boolean {
        return this.panel !== null;
    }


    public Show() {
        if (this.panel !== null) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const context = CommonUtils.GetExtensionContext();
        const localResourceRootUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'Hacknet');

        // 开始webview交互
        this.panel = vscode.window.createWebviewPanel(
            'hacknetThemewebview', // 标识类型
            'Hacknet主题调试', // 面板标题
            vscode.ViewColumn.Beside, // 显示在编辑器的哪个列
            {
                enableScripts: true,
                localResourceRoots: [localResourceRootUri, CommonUtils.GetWorkspaceRootUri()!]
            }
        );

        const htmlPath = path.join(context.extensionPath, 'resources', 'Hacknet', 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        htmlContent = htmlContent.replace(/(src|href)="([^"]*)"/g, (match, attr, resourcePath) => {
            if (resourcePath.startsWith('http') || resourcePath.startsWith('data:')) {
                return match;
            }
            return `${attr}="${this.resourcePathToVscodeWebviewPath(localResourceRootUri, resourcePath)}"`;
        });

        htmlContent = htmlContent.replace(/url\(['"]([^'"]*)['"]\)/g, (match, path) => {
            return `url('${this.resourcePathToVscodeWebviewPath(localResourceRootUri, path)}')`;
        });


        this.panel.webview.html = htmlContent;
        this.panel.webview.onDidReceiveMessage(this.OnReceiveWebviewMsg.bind(this));
        this.panel.onDidDispose(() => {
            this.panel = null;
        });
    }

    private OnReceiveWebviewMsg(e:any) {
        if (!e || !e.type || e.type !== 'activeNode') {
            return;
        }

        if (lastTextEditor === null) {
            return;
        }

        const keywordArr = e.res.replaceAll("'", "").replaceAll('"', "").split(',').map((item:string) => `(?<!\\w)${item}(?!\\w)`);
        const document = lastTextEditor.document;
        // const selections = CommonUtils.SearchKeywordInDocument(new RegExp(`${keywordArr.join('|')}`, 'g'), document.getText())
        //                 .map(range => new vscode.Selection(document.positionAt(range.startOffset + 1), document.positionAt(range.startOffset + 1)));
        // lastTextEditor.selections = selections;

        const decorations: vscode.DecorationOptions[] = [];
        CommonUtils.SearchKeywordInDocument(new RegExp(`${keywordArr.join('|')}`, 'g'), document.getText())
                        .forEach(range => {
                            decorations.push({
                                range: new vscode.Range(document.positionAt(range.startOffset), document.positionAt(range.endOffset))
                            });
                        });
        lastTextEditor.setDecorations(infoDecoration, decorations);
        if (decorations.length > 0) {
            lastTextEditor.revealRange(decorations[0].range);
        }
        this.editorDecDisposeMap.set(lastTextEditor, Date.now() + 3000);
    }

    public SetThemeFileContent(content: string) {
        if (!this.HasPanel) {
            return;
        }

        try {
            const xmlNode = xmlParser.parse(content);
            if (xmlNode === null) {
                console.error('未获取到xml节点信息'); 
                return;
            }

            const config = xmlNode.children.map(node => {
                return {
                    name: node.name,
                    value: node.name === 'backgroundImagePath' ? 
                        `url('${this.resourcePathToVscodeWebviewPath(CommonUtils.GetWorkspaceRootUri()!, node.content)}')` : 
                        node.content
                };
            });

            this.panel!.webview.postMessage({
                type: 'config',
                config
            });
        } catch (error) {
            console.error('解析主题xml文件失败', error);   
        }
    }
}