import * as vscode from 'vscode';
import { Worker } from 'worker_threads';
import { XmlNodeParseResult } from './GlobalXmlScaner';
import * as CommonUtils from '../utils/CommonUtils';
import path from 'path';
import { EventManager, EventType } from "../event/EventManager";

let scanWorker:Worker | null = null;
let watcher:vscode.FileSystemWatcher | null = null;

export enum HacknetNodeType {
    Computer,
    Mission,
    Action,
    Theme,
    Faction,
    People
}

type HacknetXmlNodeMap = {
    [key in HacknetNodeType] : Map<string, any>
}

interface HacknetNodeInfo {
    [key: string]: any
    GetRelativePath: () => string | undefined
    GetFullPath: () => string
}

interface ComputerInfo extends HacknetNodeInfo {
    id: string
    name: string
    ip: string
}

class HacknetNodeHolder {
    // 节点类型 -> 节点
    public readonly NodeMap: HacknetXmlNodeMap = {
        [HacknetNodeType.Computer]: new Map<string, any>(),
        [HacknetNodeType.Mission]: new Map<string, any>(),
        [HacknetNodeType.Action]: new Map<string, any>(),
        [HacknetNodeType.Theme]: new Map<string, any>(),
        [HacknetNodeType.Faction]: new Map<string, any>(),
        [HacknetNodeType.People]: new Map<string, any>()
    };

    // 附加节点的路径属性
    public readonly FilePathSymbol = Symbol("FilePath");

    // 附加节点类型的属性
    public readonly NodeTypeSymbol = Symbol("NodeType");

    public AddNode(fullpath: string, node: any) {
        if (node === null || node === undefined) {
            return;
        }

        const nodeType = this.GetNodeType(node);
        if (nodeType === undefined) {
            return;
        }

        node[this.NodeTypeSymbol] = nodeType;
        node[this.FilePathSymbol] = fullpath;
        this.NodeMap[nodeType].set(fullpath, node);

        EventManager.fireEvent(EventType.HacknetNodeFileChange,{
            type: nodeType,
            modify: 'add'
        });
    }

    public RemoveNodeByFilepath(filepath: string) {
        for (const key in this.NodeMap) {
            const nodeMap:Map<string, any> = (this.NodeMap as any)[key];
            if (nodeMap.delete(filepath)) {
                EventManager.fireEvent(EventType.HacknetNodeFileChange,{
                    type: parseInt(key),
                    modify: 'remove'
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

    public GetNodeType(node:any) : HacknetNodeType | undefined {
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
        realNode['GetFullPath'] = () => rootNode[this.FilePathSymbol];
        realNode['GetRelativePath'] = () => {
            const rootUri = CommonUtils.GetWorkspaceRootUri();
            if (rootUri === undefined) {
                return;
            }
            return path.relative(rootUri.fsPath, rootNode[this.FilePathSymbol]).replaceAll('\\', '/');
        };
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