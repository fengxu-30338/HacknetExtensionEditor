import * as vscode from 'vscode';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from '../event/EventManager';
import { CodeHints } from "../code-hint/CodeHint";
import * as CommonUtils from "../utils/CommonUtils";
import { Node, XmlParser } from "../parser/XmlParser";
import path from 'path';

interface HacknetFileTreeNode extends vscode.TreeItem {
    filepath?: string
    parent?: HacknetFileTreeNode;
    nodePath?: string;
    node?: any;
    label: string;
    nodeType: HacknetNodeType;
    level: number;
}

class HacknetNodeTreeDataProvider implements vscode.TreeDataProvider<HacknetFileTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<HacknetFileTreeNode | undefined | null | void> = new vscode.EventEmitter<HacknetFileTreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HacknetFileTreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootNodes:HacknetFileTreeNode[] = [];

    constructor() {
        EventManager.onEvent(EventType.HacknetNodeFileChange, (e) => {
            if (e.type !== undefined) {
                const root = this.rootNodes.find(item => item.nodeType === e.type);
                if (root === undefined) { return; }
                this._onDidChangeTreeData.fire(root);
            }
        });
    }

    getTreeItem(element: HacknetFileTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: HacknetFileTreeNode | undefined): vscode.ProviderResult<HacknetFileTreeNode[]> {
        // 根节点
        if (element === undefined) {
            return this.getAllRootHacknetNode();
        }
        
        // 第一层
        if (element.filepath === undefined) {
            return hacknetNodeHolder.GetNodesByNodeType(element.nodeType).map(node => {
                return {
                    filepath: node[hacknetNodeHolder.FilePathSymbol],
                    label: node.name || node.id || path.basename(node[hacknetNodeHolder.FilePathSymbol], ".xml"),
                    nodePath: hacknetNodeHolder.GetNodeXmlRootPath(element.nodeType)!,
                    nodeType: element.nodeType,
                    parent: element,
                    node,
                    level: element.level + 1,
                    iconPath: new vscode.ThemeIcon("symbol-file"),
                    collapsibleState: element.nodeType === HacknetNodeType.Computer ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    command: {
                        command: "hacknetextensionhelper.openXmlFile",
                        title: "打开文件",
                        arguments: [node[hacknetNodeHolder.FilePathSymbol]]
                    }
                };
            });
        }

        if (element.node && element.nodeType === HacknetNodeType.Computer) {
            const res:HacknetFileTreeNode[] = [];
            const attrs = ["id", "ip"];
            res.push(...attrs.filter(attr => element.node[attr] !== undefined).map(attr => {
                return {
                    filepath: element.filepath,
                    label: `${attr}: ${element.node[attr]}`,
                    nodePath: element.nodePath,
                    nodeType: element.nodeType,
                    parent: element,
                    node: element.node,
                    level: element.level,
                    iconPath: new vscode.ThemeIcon("symbol-field"),
                    command: {
                        command: "hacknetextensionhelper.openXmlFile",
                        title: "打开文件",
                        arguments: [element.filepath]
                    }
                };
            }));

            for (const name in element.node) {
                const nodePath = `${element.nodePath}.${name}`;
                if (CodeHints.NodeCodeHintSource.some(item => item.NodePath === nodePath && item.Desc.toLocaleLowerCase().includes('daemon')) || 
                    name.toLocaleLowerCase().includes('daemon')) {
                    res.push({
                        filepath: element.filepath,
                        label: name,
                        nodePath: nodePath,
                        nodeType: element.nodeType,
                        parent: element,
                        node: element.node,
                        level: element.level + 1,
                        iconPath: vscode.Uri.file(CommonUtils.GetExtensionContext().asAbsolutePath("resources/NodeView/daemon.png")),
                        command: {
                            command: "hacknetextensionhelper.openXmlFile",
                            title: "打开文件并定位到该daemon",
                            arguments: [element.filepath, nodePath]
                        }
                    });
                }
            }

            return res;
        }
    }

    getParent?(element: HacknetFileTreeNode): vscode.ProviderResult<HacknetFileTreeNode> {
        return element.parent;
    }

    private getAllRootHacknetNode(): HacknetFileTreeNode[] {
        // 获取ts枚举的所有类型
        const nodeTypes = Object.keys(HacknetNodeType);
        this.rootNodes = nodeTypes.filter(type => type !== 'Other' && isNaN(Number(type))).map(item => {
            return {
                label: item,
                nodeType: Reflect.get(HacknetNodeType, item),
                iconPath: vscode.Uri.file(CommonUtils.GetExtensionContext().asAbsolutePath("resources/NodeView/node.png")),
                level: -1,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            };
        });

        return this.rootNodes;
    }

}

function FindXmlNodeByNodePath(xmlNode: Node, nodePath: string): Node | null {
    const nodeLevel = nodePath.split(".").length;
    if (xmlNode.level > nodeLevel) {
        return null;
    }

    if (xmlNode.level < nodeLevel) {
        for (const node of xmlNode.children) {
            const res = FindXmlNodeByNodePath(node, nodePath);
            if (res !== null) {
                return res;
            }
        }
    }

    return xmlNode.nodePath === nodePath ? xmlNode : null;
}

async function HanldeOpenXmlFileCommand(...args: any[]) {
    if (args.length === 0) { return; }
    const filepath = args[0].toString() as string;
    if (!filepath.toLocaleLowerCase().endsWith(".xml")) {
        return;
    }

    try {
        const fileUri = vscode.Uri.file(filepath);
        const fsStat = await vscode.workspace.fs.stat(fileUri);
        if (fsStat.type !== vscode.FileType.File) {
            return;
        }

        const nodePath = args[1]?.toString() as string || null;
        const document = await vscode.workspace.openTextDocument(fileUri);
        let targetXmlNode:Node | null = null;
        if (nodePath) {
            const xmlParser = new XmlParser();
            targetXmlNode = FindXmlNodeByNodePath(xmlParser.parse(document.getText(), {needToken: true})!, nodePath);
        }
        await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
            selection: !targetXmlNode ? 
                undefined : 
                new vscode.Range(
                    document.positionAt(targetXmlNode.nameToken!.offset), 
                    document.positionAt(targetXmlNode.nameToken!.offset + targetXmlNode.nameToken!.text.length)
                )
        });

    } catch (error) {
        do {
            if (error instanceof vscode.FileSystemError && error.code === vscode.FileSystemError.FileNotFound().code) {
                break;
            }

            console.error(error);
        } while (false);
    }
}

export function RegisterHacknetNodeViewer(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand("hacknetextensionhelper.openXmlFile", HanldeOpenXmlFileCommand));

    const treeView = vscode.window.createTreeView('hacknetNodeViewer', {
        treeDataProvider: new HacknetNodeTreeDataProvider(),
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
}