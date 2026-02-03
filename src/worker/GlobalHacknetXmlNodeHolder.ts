import * as vscode from 'vscode';
import { Worker } from 'worker_threads';
import { XmlNodeParseResult } from './GlobalXmlScaner';
import * as CommonUtils from '../utils/CommonUtils';
import path from 'path';
import { EventManager, EventType } from "../event/EventManager";
import { ComputerInfo, HacknetNodeInfo, HacknetNodeType, HacknetXmlNodeMap } from './GlobalHacknetXmlNodeHolderDefine';
import OutputManager from "../utils/OutputChannelUtils";

let scanWorker:Worker | null = null;
let watcher:vscode.FileSystemWatcher | null = null;

class HacknetNodeHolder {
    // 节点类型 -> 节点
    public readonly NodeMap: HacknetXmlNodeMap = {
        [HacknetNodeType.Computer]: new Map<string, any>(),
        [HacknetNodeType.Mission]: new Map<string, any>(),
        [HacknetNodeType.Action]: new Map<string, any>(),
        [HacknetNodeType.Theme]: new Map<string, any>(),
        [HacknetNodeType.Faction]: new Map<string, any>(),
        [HacknetNodeType.People]: new Map<string, any>(),
        [HacknetNodeType.Other]: new Map<string, any>()
    };

    // 附加节点的绝对路径属性
    public readonly FilePathSymbol = "__FullPath__";

    // 附加节点的相对路径属性
    public readonly RelativePathSymbol = "__RelativePath__";

    // 附加节点类型的属性
    public readonly NodeTypeSymbol = "__NodeType__";

    public AddNode(fullpath: string, node: any) {
        if (node === null || node === undefined) {
            return;
        }

        // 忽略编辑器提示文件
        if (node["HacknetEditorHint"]) {
            return;
        }

        // 可能文件类型发生了改变，先从老的Map中删除
        this.RemoveNodeByFilepath(fullpath);

        const nodeType = this.GetNodeType(node);
        if (nodeType === undefined) {
            return;
        }

        node[this.NodeTypeSymbol] = nodeType;
        node[this.FilePathSymbol] = fullpath;

        const rootUri = CommonUtils.GetWorkspaceRootUri();
        if (rootUri !== undefined) {
            const relativePath = path.relative(rootUri.fsPath, fullpath).replaceAll('\\', '/');
            node[this.RelativePathSymbol] = relativePath;

            // 排除非Nodes目录下的Computer节点
            if (nodeType === HacknetNodeType.Computer && !relativePath.toLowerCase().startsWith("nodes/")) {
                // console.log(`排除非Nodes目录下的Computer节点: ${relativePath}`);
                return;
            }
        }

        this.NodeMap[nodeType].set(fullpath, node);

        EventManager.fireEvent(EventType.HacknetNodeFileChange,{
            type: nodeType,
            modify: 'add',
            filepath: fullpath
        });
    }

    public RemoveNodeByFilepath(filepath: string) {
        for (const key in this.NodeMap) {
            const nodeMap:Map<string, any> = (this.NodeMap as any)[key];
            if (nodeMap.delete(filepath)) {
                EventManager.fireEvent(EventType.HacknetNodeFileChange,{
                    type: parseInt(key),
                    modify: 'remove',
                    filepath
                });
            }
        }
    }

    public ClearNodes() {
        for (const key in this.NodeMap) {
            const nodeMap:Map<string, any> = (this.NodeMap as any)[key];
            nodeMap.clear();
        }

        EventManager.fireEvent(EventType.HacknetNodeFileChange,{
            type: -1,
            modify: 'clear'
        });
    }

    public GetNodeType(node:any) : HacknetNodeType {
        if (this.NodeTypeSymbol in node) {
            return node[this.NodeTypeSymbol] as HacknetNodeType;
        }

        if ('Computer' in node) {
            return HacknetNodeType.Computer;
        }

        if ('mission' in node) {
            return HacknetNodeType.Mission;
        }

        if ('ConditionalActions' in node) {
            return HacknetNodeType.Action;
        }

        if ('CustomTheme' in node) {
            return HacknetNodeType.Theme;
        }

        if ('CustomFaction' in node) {
            return HacknetNodeType.Faction;
        }

        if ('Person' in node) {
            return HacknetNodeType.People;
        }

        return HacknetNodeType.Other;
    }

    public GetNodeXmlRootPath(nodeType:HacknetNodeType):string | null {
        switch (nodeType) {
            case HacknetNodeType.Computer:
                return "Computer";
            case HacknetNodeType.Mission:
                return "mission";
            case HacknetNodeType.Action:
                return "ConditionalActions";
            case HacknetNodeType.Theme:
                return "CustomTheme";
            case HacknetNodeType.Faction:
                return "CustomFaction";
            case HacknetNodeType.People:
                return "Person";
            case HacknetNodeType.Other:
                return null;
        }
    }

    public GetNodeByFilepath(filepath: string):any {
        for (const key in this.NodeMap) {
            const nodeMap:Map<string, any> = (this.NodeMap as any)[key];
            const node = nodeMap.get(filepath);
            if (node) {
                return node;
            }
        }
    }

    public GetNodeTypeByFilepath(filepath: string): HacknetNodeType | null {
        for (const key in this.NodeMap) {
            const nodeMap:Map<string, any> = (this.NodeMap as any)[key];
            if (nodeMap.has(filepath)) {
                return parseInt(key);
            }
        }

        return null;
    }

    public GetNodeFilepath(node:any) : string | undefined {
        return node[this.FilePathSymbol];
    }

    private attachNodeFunc(rootNode: any, realNode: any) {
        realNode[this.FilePathSymbol] = rootNode[this.FilePathSymbol];
        realNode[this.RelativePathSymbol] = rootNode[this.RelativePathSymbol];
    }

    /**
     * 获取当前工作空间下所有的计算机信息
     */
    public GetComputers(): ComputerInfo[] {
        const computerNodes = this.NodeMap[HacknetNodeType.Computer];
        const res:ComputerInfo[] = [];
        computerNodes.forEach(node => {
            if (node.Computer.id !== undefined) {
                this.attachNodeFunc(node, node.Computer);
                res.push(node.Computer);
            }
        });

        return res;
    }

    /**
     * 获取当前工作空间下所有的Mission信息
     */
    public GetMissions(): HacknetNodeInfo[] {
        const actionNodes = this.NodeMap[HacknetNodeType.Mission];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            this.attachNodeFunc(node, node.mission);
            res.push(node.mission);
        });

        return res;
    }
    

    /**
     * 获取当前工作空间下所有的Action信息
     */
    public GetActions(): HacknetNodeInfo[] {
        const actionNodes = this.NodeMap[HacknetNodeType.Action];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            this.attachNodeFunc(node, node.ConditionalActions);
            res.push(node.ConditionalActions);
        });

        return res;
    }

    /**
     * 获取当前工作空间下所有的Theme信息
     */
    public GetThemes(): HacknetNodeInfo[] {
        const actionNodes = this.NodeMap[HacknetNodeType.Theme];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            this.attachNodeFunc(node, node.CustomTheme);
            res.push(node.CustomTheme);
        });
        return res;
    }

    /**
     * 获取当前工作空间下所有的Faction信息
     */
    public GetFactions(): HacknetNodeInfo[] {
        const factionNodes = this.NodeMap[HacknetNodeType.Faction];
        const res:HacknetNodeInfo[] = [];
        factionNodes.forEach(node => {
            this.attachNodeFunc(node, node.CustomFaction);
            res.push(node.CustomFaction);
        });
        return res;
    }

    /**
     * 获取当前工作空间下所有的People信息
     */
    public GetPeoples(): HacknetNodeInfo[] {
        const factionNodes = this.NodeMap[HacknetNodeType.People];
        const res:HacknetNodeInfo[] = [];
        factionNodes.forEach(node => {
            this.attachNodeFunc(node, node.Person);
            res.push(node.Person);
        });
        return res;
    }

    /**
     * 获取当前工作空间下其他未识别的xml节点信心
     */
    public GetOtherNodes(): HacknetNodeInfo[] {
        const otherNodes = this.NodeMap[HacknetNodeType.Other];
        const res:HacknetNodeInfo[] = [];
        otherNodes.forEach(node => {
            res.push(node);
        });
        return res;
    }

    /**
     * 输出日志
     * @param msg 日志信息
     */
    public Log(msg:string) {
        OutputManager.log(msg);
    }

    public GetNodesByNodeType(nodeType: HacknetNodeType): HacknetNodeInfo[] {
        switch (nodeType) {
            case HacknetNodeType.Computer:
                return this.GetComputers();
            case HacknetNodeType.Mission:
                return this.GetMissions();
            case HacknetNodeType.Action:
                return this.GetActions();
            case HacknetNodeType.Theme:
                return this.GetThemes();
            case HacknetNodeType.Faction:
                return this.GetFactions();
            case HacknetNodeType.People:
                return this.GetPeoples();
            case HacknetNodeType.Other:
                return this.GetOtherNodes();
        }
    }
}
export const hacknetNodeHolder : HacknetNodeHolder = new HacknetNodeHolder(); 

/**
 * 启动后台扫描xml node进程
 */
export function StartHacknetNodeScan(context: vscode.ExtensionContext) {
    StopScanWorker();

    const rootUri = CommonUtils.GetWorkspaceRootUri();
    if (rootUri === undefined) {
        return;
    }

    const workerPath = path.join(__dirname, 'GlobalXmlScaner.js');

    scanWorker = new Worker(workerPath, {
                workerData: {
                    scanFolder: rootUri.fsPath
                }
    });

    // 监听获取解析后的node信息
    scanWorker.on('message', result => {
        const xmlParseResult = result as XmlNodeParseResult;
        // console.log('解析结果', xmlParseResult);
        hacknetNodeHolder.AddNode(xmlParseResult.filepath, xmlParseResult.node);
    });

    // 监听xml文件改变
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], "**/*.xml"));
    watcher.onDidChange((uri) => {
        scanWorker?.postMessage(uri.fsPath);
    });
    watcher.onDidCreate(uri => {
        scanWorker?.postMessage(uri.fsPath);
    });
    watcher.onDidDelete(uri => {
        hacknetNodeHolder.RemoveNodeByFilepath(uri.fsPath);
    });
    context.subscriptions.push(watcher);


    // 工作目录改变重新扫描
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
        StopScanWorker();
        StartHacknetNodeScan(context);
    }));
}


/**
 * 停止后台扫描进程
 */
export function StopScanWorker() {
    if (scanWorker) {
        scanWorker.terminate();
        scanWorker = null;
    }

    if (watcher) {
        const vscodeCtx = CommonUtils.GetExtensionContext() ?? null;
        if (vscodeCtx !== null) {
            const idx = vscodeCtx.subscriptions.findIndex(item => item === watcher);
            if (idx >= 0) {
                vscodeCtx.subscriptions.splice(idx, 1);
            }
        }
        watcher.dispose();
        watcher = null;
    }
    
    hacknetNodeHolder.ClearNodes();
}