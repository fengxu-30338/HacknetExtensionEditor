import * as vscode from 'vscode';
import * as CommonUtils from '../../utils/CommonUtils';
import HotReplaceClient from '../HotReplaceClient/HotReplaceClient';
import OutputManager from '../../utils/OutputChannelUtils';
import { hacknetNodeHolder } from '../../worker/GlobalHacknetXmlNodeHolder';
import { Node, XmlParser } from '../../parser/XmlParser';
import { EventManager, EventType } from '../../event/EventManager';
import { HacknetNodeType } from '../../worker/GlobalHacknetXmlNodeHolderDefine';
import { HintFileExist } from '../../code-hint/CodeHint';


class HacknetActionTestController extends vscode.Disposable {
    private controller: vscode.TestController;
    private xmlParser: XmlParser;
    private RootTestIdPrefix = "HacknetActionTest-";

    constructor() {
        super(() => {
            this.controller?.dispose();
        });
        this.controller = vscode.tests.createTestController('HacknetActionTest', 'Hacknet Action Tests');
        this.xmlParser = new XmlParser();
        this.setupTestDiscovery();
        EventManager.onEvent(EventType.HacknetNodeFileChange, this.handleXmlFileChanged.bind(this));
        EventManager.onEvent(EventType.CodeHintParseCompleted, this.discoverActionTestsInWorkspace.bind(this));
        EventManager.onEvent(EventType.CodeHintSourceChange, this.clearTestItems.bind(this));
    }

    private clearTestItems() {
        const ids:string[] = [];
        this.controller.items.forEach((item) => {
            ids.push(item.id);
        });
        ids.forEach(id => {
            this.controller.items.delete(id);
        });
    }

    // 设置测试发现
    private setupTestDiscovery() {
        this.controller.resolveHandler = async (testItem) => {
            if (!testItem) {
                await this.discoverActionTestsInWorkspace();
            }
        };

        this.controller.refreshHandler = async () => {
            await this.discoverActionTestsInWorkspace();
        };

        this.controller.createRunProfile('HacknetActionTestRun', vscode.TestRunProfileKind.Run, async (request, token) => {
            if (!request.include) {
                return;
            }
            await this.RunTestItem(request);
        });
    }

    private async RunTestItem(request:vscode.TestRunRequest) {
        if (!request.include || request.include.length === 0) {
            return;
        }

        if (request.include.length > 1) {
            // eslint-disable-next-line no-throw-literal
            throw `不允许多组Action同时测试`;
        }

        const testItem = request.include[0];

        // 获取当前测试用例所在的文件内容并解析为xml
        let xmlNode!:Node;
        try {
            const xmlContent = await vscode.workspace.fs.readFile(testItem.uri!);
            xmlNode = this.xmlParser.parse(xmlContent.toString(), {needToken: true});
        } catch (error) {
            const errorMsg = `解析测试用例文件: ${testItem.uri!.fsPath} 失败: ${error}`;
            OutputManager.error(errorMsg);
            throw new Error(errorMsg);
        }


        const run = this.controller.createTestRun(request, `HacknetActionTestRun-${testItem.label}`);
        testItem.busy = true;

        const hotReplaceConfig = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hotReplace');
        const executeActionType = hotReplaceConfig.get<string>('executeActionType') || 'orderExecute';

        const leafTestItems = await this.getleafTestcase(testItem);

        if (executeActionType === 'orderExecute') {
            for (const leafTestItem of leafTestItems) {
                await this.runLeafTestItem(leafTestItem, run, xmlNode);
            }
        } else if (executeActionType === 'parallelExecute') {
            const allTestResult:Promise<void>[] = [];
            for (const leafTestItem of leafTestItems) {
                allTestResult.push(this.runLeafTestItem(leafTestItem, run, xmlNode));
            }
            await Promise.all(allTestResult);
        } else {
            throw new Error(`未知的Action执行方式: ${executeActionType}`);
        }   
        
        testItem.busy = false;
        run.end();
    }

    private async runLeafTestItem(leafTestItem:vscode.TestItem, run:vscode.TestRun, fileXmlNode:Node) {
        try {
            if (leafTestItem.children.size > 0) {
                throw new Error(`不允许直接测试Action组, 请测试子Action`);
            }
            leafTestItem.busy = true;
            run.started(leafTestItem);

            const actionXml = await this.getTestActionXmlString(leafTestItem, fileXmlNode);
            await HotReplaceClient.ExecuteAction({ActionXmlContent: actionXml});

            run.passed(leafTestItem);
            run.appendOutput(`[${leafTestItem.label}] 执行成功:\r\n`);
            run.appendOutput('\n=============================\r\n\n');
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            run.failed(leafTestItem, new vscode.TestMessage(errMsg));
            run.appendOutput(`[${leafTestItem.label}] 执行失败:\r\n${errMsg}\r\n`);
            run.appendOutput('\n=============================\r\n\n');
        }
    }

    private async getTestActionXmlString(leafTestItem:vscode.TestItem, fileXmlNode:Node) {
        const strArr = leafTestItem.id.split('#');
        if (strArr.length < 2) {
            throw new Error(`Action测试用例ID格式错误: ${leafTestItem.id}`);
        }
        const [nodePath, lineno] = strArr;
        const nodes = fileXmlNode.GetNodesByNodePath(nodePath);
        if (nodes.length === 0) {
            throw new Error(`未在Action所在的文件中定位到该标签: ${nodePath}`);
        }
        
        const node = nodes.find(n => n.nameToken!.line === parseInt(lineno));
        if (!node) {
            throw new Error(`在原始文件中定位Action[${leafTestItem.id}]失败，行号发生变化，请保存文件后在尝试重新执行`);
        }

        return node.ToXmlString();
    }
    
    private async getleafTestcase(testItem:vscode.TestItem):Promise<vscode.TestItem[]> {
        const result:vscode.TestItem[] = [];
        if (!testItem) {
            return result;
        }

        if (testItem.children.size === 0) {
            result.push(testItem);
            return result;
        }

        for (const [_, child] of testItem.children) {
            const leafs = await this.getleafTestcase(child);
            result.push(...leafs);
        }

        return result;
    }

    private async handleXmlFileChanged(e:any) {
        const {type, filepath, modify} = e;
        if (!filepath) {
            return;
        }

        if (modify === 'remove') {
            const testId = this.getTestIdByFilepath(filepath);
            if (testId) {
                this.controller.items.delete(testId);
            }
            return;
        }

        if (type === HacknetNodeType.Action) {
            const actionTestItem = await this.parseActionFile(filepath);
            if (actionTestItem) {
                this.controller.items.add(actionTestItem);
            }
            return;
        }

        if (type === HacknetNodeType.Faction) {
            const factionTestItem = await this.parseFactionFile(filepath);
            if (factionTestItem) {
                this.controller.items.add(factionTestItem);
            }
            return;
        }
    }

     // 工作区测试发现
    private async discoverActionTestsInWorkspace() {
        this.clearTestItems();
        for (const node of hacknetNodeHolder.GetActions()) {
            const actionTestItem = await this.parseActionFile(hacknetNodeHolder.GetNodeFilepath(node)!);
            if (actionTestItem) {
                this.controller.items.add(actionTestItem);
            }
        }

        for (const node of hacknetNodeHolder.GetFactions()) {
            const actionTestItem = await this.parseFactionFile(hacknetNodeHolder.GetNodeFilepath(node)!);
            if (actionTestItem) {
                this.controller.items.add(actionTestItem);
            }
        }
    }

    private async parseActionFile(filepath:string):Promise<vscode.TestItem | null> {
        if (!filepath) {
            return null;
        }

        return await this.parseIncludeActionFilePath(filepath, "ConditionalActions.*.*");
    }

    private async parseFactionFile(filepath:string):Promise<vscode.TestItem | null> {
        if (!filepath) {
            return null;
        }

        return await this.parseIncludeActionFilePath(filepath, "CustomFaction.Action.*");
    }

    private async parseIncludeActionFilePath(actionPath:string, actionNodePatterm:string):Promise<vscode.TestItem | null> {
        if (!HintFileExist()) {
            return null;
        }
        
        if (!actionPath) {
            return null;
        }
        actionPath = this.normalizePath(actionPath);

        try {
            const fileUri = vscode.Uri.file(actionPath);
            const fileContent = (await vscode.workspace.fs.readFile(fileUri)).toString();
            const xmlNode = this.xmlParser.parse(fileContent, {needToken: true});
            const childTestItem = await this.parseIncludeActionNode(actionPath, xmlNode, actionNodePatterm);
            if (!childTestItem || childTestItem.length === 0) {
                return null;
            }

            return childTestItem[0];
        } catch (error) {
            OutputManager.error(`解析包含Action的文件${actionPath}失败: ${error}`);
        }

        return null;
    }

    private async  parseIncludeActionNode(filepath: string, node:Node, actionNodePatterm:string, level:number = 1):Promise<vscode.TestItem[] | null>  {
        if (level === 1) {
            const rootTestItem = this.controller.createTestItem(
                this.getTestIdByFilepath(filepath),
                filepath.split('/').pop()!,
                vscode.Uri.file(filepath)
            );
            rootTestItem.range = new vscode.Range(
                new vscode.Position(node.nameToken!.line - 1, 0),
                new vscode.Position(node.nameToken!.line - 1, 1)
            );

            const childTestItem = await this.parseIncludeActionNode(filepath, node, actionNodePatterm, level + 1);
            if (!childTestItem || childTestItem.length === 0) {
                return null;
            }

            childTestItem.forEach(item => {
                rootTestItem.children.add(item);
            });

            return [rootTestItem];
        }

        const nodePathArr = actionNodePatterm.split('.');
        if (level > nodePathArr.length) {
            return null;
        }

        const curNodePathPattern = nodePathArr.slice(0, level).join('.');
        const curNodes = node.GetNodesByNodePath(curNodePathPattern);
        const result:vscode.TestItem[] = [];
        for (const curNode of curNodes) {
            const curTestItem = this.controller.createTestItem(
                `${curNode.nodePath}#${curNode.nameToken!.line}`,
                `${curNode.nodePath.split('.').pop()!}#${curNode.nameToken!.line}`,
                vscode.Uri.file(filepath)
            );
            curTestItem.range = new vscode.Range(
                new vscode.Position(curNode.nameToken!.line - 1, 0),
                new vscode.Position(curNode.nameToken!.line - 1, 1)
            );

            const childTestItem = await this.parseIncludeActionNode(filepath, curNode, actionNodePatterm, level + 1);

            childTestItem?.forEach(item => {
                curTestItem.children.add(item);
            });

            result.push(curTestItem);
        }
        return result;
    }

    private getTestIdByFilepath(filepath:string) {
        return `${this.RootTestIdPrefix}-${this.normalizePath(filepath)}`;
    }

    private normalizePath(path:string) {
        return path.replaceAll('\\', '/');
    }
}




export function InitHacknetActionTest() {
    const context = CommonUtils.GetExtensionContext();
    context.subscriptions.push(new HacknetActionTestController());
}