import * as vscode from 'vscode';
import { hacknetNodeHolder } from "../worker/GlobalHacknetXmlNodeHolder";
import { HacknetNodeType } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import { EventManager, EventType } from '../event/EventManager';
import { CodeHints } from "../code-hint/CodeHint";
import { GetLinkByFinalMatchValue, LinkBy } from '../code-hint/CodeHintDefine';
import { GetActiveFile } from "../utils/ActiveFileTypeListener";
import * as CommonUtils from "../utils/CommonUtils";
import { Node, XmlParser } from "../parser/XmlParser";
import fs from "fs";

interface ComputerOrEosItem {
    filepath: string
    id: string
    ip?: string | undefined
    name: string
}

interface HacknetComputerAttrOrContent {
    nodePath: string;
    attrName: string;
    isAttr: boolean;
    linkByCollection: LinkBy[]
}

interface HacknetFileTreeNode extends vscode.TreeItem {
    filepath: string
    parent?: HacknetFileTreeNode;
    children?: HacknetFileTreeNode[]
}

class HacknetNodeRelationTreeDataProvider implements vscode.TreeDataProvider<HacknetFileTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<HacknetFileTreeNode | undefined | null | void> = new vscode.EventEmitter<HacknetFileTreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HacknetFileTreeNode | undefined | null | void> = this._onDidChangeTreeData.event;
    private allComputerAttrOrContent:HacknetComputerAttrOrContent[] = [];
    private _iconPath = vscode.Uri.file(CommonUtils.GetExtensionContext().asAbsolutePath("resources/NodeRelativeView/comp.svg"));
    private currentShowFilepathSet = new Set<string>();

    constructor() {
        EventManager.onEvent(EventType.CodeHintParseCompleted, () => {
            this.allComputerAttrOrContent = this.getAllComputerAttrOrContent();
            this.reBuildTree();
        });

        EventManager.onEvent(EventType.HacknetNodeFileChange, ({filepath, modify}) => {
            if (modify === 'add' || (filepath && this.currentShowFilepathSet.has(filepath))) {
                this.reBuildTree();
            }
        });

        EventManager.onEvent(EventType.EditorActiveFileChange, ({nodeType}) => {
            // console.log("激活文件发生变化", GetActiveFile(), nodeType);
            if (nodeType === HacknetNodeType.Computer) {
                this.reBuildTree();
            }
        });
    }

    private reBuildTree() {
        // console.log("reBuildTree");
        this.currentShowFilepathSet.clear();
        this._onDidChangeTreeData.fire();
    }

    async getChildren(element?: HacknetFileTreeNode | undefined): Promise<HacknetFileTreeNode[] | null | undefined> {
        if (!element) {
            const rootNode = await this.getRootNode();
            if (rootNode === null) {
                return null;
            }
            return [rootNode];
        }

        if (element.children && element.children.length > 0) {
            for (const child of element.children) {
                await this.loadChildrenAndAttachToParent(child);
            }
        }

        return element.children;
    }

    private async getRootNode(): Promise<HacknetFileTreeNode | null> {
        const actFile = GetActiveFile();
        if (actFile.nodeType !== HacknetNodeType.Computer) {
            return null;
        }
 
        const rootNode = Object.assign(this.getCommonTreeNodeInfo(actFile.filepath), {
            label: actFile.node.Computer.name || actFile.node.Computer.id,
        });
        await this.loadChildrenAndAttachToParent(rootNode);

        return rootNode;
    }

    private async loadChildrenAndAttachToParent(node:HacknetFileTreeNode) {
        node.children = await this.loadChildren(node);
        if (node.children.length > 0) {
            node.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    private async loadChildren(node:HacknetFileTreeNode):Promise<HacknetFileTreeNode[]> {
        const result:HacknetFileTreeNode[] = [];
        if (this.currentShowFilepathSet.has(node.filepath)) {
            return result;
        }
        this.currentShowFilepathSet.add(node.filepath);
        // console.log(`loadChildren: ${node.filepath}`);
        try {
            const xmlContent = await fs.promises.readFile(node.filepath, "utf-8");
            const xmlParser = new XmlParser();
            const xmlNode = xmlParser.parse(xmlContent);
            if (xmlNode === null) {
                return result;
            }

            const allComputerAndEosId = this.getAllComputerAndEosId();

            const nodePueue:Node[] = [xmlNode];
            while (nodePueue.length > 0) {
                const curNode = nodePueue.shift()!;
                // 检查从提示文件中获取到的信息是否符合当前节点
                const attrOrContent = this.allComputerAttrOrContent.find(item => item.nodePath === curNode.nodePath);
                if (attrOrContent) {
                    do {
                        const value = this.getXmlNodeValue(curNode, attrOrContent);
                        if (value === null) {
                            break;
                        }

                        const linkValues = await GetLinkByFinalMatchValue(attrOrContent.linkByCollection, value);
                        if (linkValues.length === 0) {
                            break;
                        }

                        for (const linkValue of linkValues) {
                            const compOrEos = allComputerAndEosId.find(item => item.id === linkValue);
                            if (compOrEos) {
                                result.push(Object.assign(this.getCommonTreeNodeInfo(compOrEos.filepath), {
                                    label: `${this.getIdentity(curNode.name, attrOrContent)} -> ${compOrEos.name || compOrEos.id}`,
                                }));
                            }
                        }

                    } while (false);
                }

                const ipArr:{identity:string,ip:string}[] = this.searchAllIpFromText(curNode.content)
                    .map(ip => ({identity:this.getIdentity(curNode.name, {
                        isAttr: false, 
                        attrName: ""
                    }), ip}));

                for (const [attrName, attrValue] of curNode.attribute.entries()) {
                    if (curNode.name === 'Computer' && attrName === 'ip') {
                        continue;
                    }
                    ipArr.push(...this.searchAllIpFromText(attrValue)
                        .map(ip => ({identity:this.getIdentity(curNode.name, {
                            isAttr: true, 
                            attrName
                        }), ip})));
                }

                for (const ipItem of ipArr) {
                    const compOrEos = allComputerAndEosId.find(item => item.ip === ipItem.ip);
                    if (compOrEos) {
                        result.push(Object.assign(this.getCommonTreeNodeInfo(compOrEos.filepath), {
                            label: `${ipItem.identity}:ip -> ${compOrEos.name || compOrEos.id}`,
                        }));
                    }
                }

                for (const child of curNode.children) {
                    nodePueue.push(child);
                }
            }
        } catch (error) {
            console.error(`读取文件 ${node.filepath} 失败: ${error}`);
        }

        return result;
    }

    private searchAllIpFromText(text:string):string[] {
        const ipv4Regex = /\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
        
        const matches = text.match(ipv4Regex);
        return matches ? matches : [];
    }

    private getIdentity(tagName:string, attrOrContent:Pick<HacknetComputerAttrOrContent, "isAttr" | "attrName">):string {
        return `<${tagName}${attrOrContent.isAttr ? ('@' + attrOrContent.attrName) : '#content'}>`;
    }


    private getXmlNodeValue(xmlNode:Node, attrOrContent:HacknetComputerAttrOrContent):string | null {
        if (xmlNode.nodePath !== attrOrContent.nodePath) {
            return null;
        }

        if (attrOrContent.isAttr) {
            return xmlNode.attribute.get(attrOrContent.attrName) || null;
        } else {
            return xmlNode.content || null;
        }
    }

    private getCommonTreeNodeInfo(filepath:string):Partial<HacknetFileTreeNode> & {filepath:string} {
        return {
            filepath,
            iconPath: this._iconPath,
            command: {
                command: "hacknetextensionhelper.openXmlFile",
                title: "打开文件",
                arguments: [filepath]
            }
        };
    }


    getTreeItem(element: HacknetFileTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getParent?(element: HacknetFileTreeNode): vscode.ProviderResult<HacknetFileTreeNode> {
        return element.parent;
    }

    private getAllComputerAttrOrContent() {
        const codeHints = CodeHints.NodeCodeHintSource;
        const computerAttrOrContent: HacknetComputerAttrOrContent[] = [];
        for (const codeHint of codeHints) {
            if (!codeHint.NodePath.startsWith("Computer.")) {
                continue;
            }

            for (const attrName in codeHint.AttributeNodeHint) {                
                const attributeHint = codeHint.AttributeNodeHint[attrName];
                const linkByCollection = attributeHint.linkByCollection.filter(item => item.linkBy.includes("Computer.id"));
                if (linkByCollection.length > 0) {
                    computerAttrOrContent.push({
                        nodePath: codeHint.NodePath,
                        attrName: attrName,
                        isAttr: true,
                        linkByCollection
                    });
                }
            }

            if (codeHint.ContentHint) {
                const linkByCollection = codeHint.ContentHint.linkByCollection.filter(item => item.linkBy.includes("Computer.id"));
                if (linkByCollection.length > 0) {
                    computerAttrOrContent.push({
                        nodePath: codeHint.NodePath,
                        attrName: "",
                        isAttr: false,
                        linkByCollection
                    });
                }
            }

            if (codeHint.ConditionAttributeHints.length > 0) {
                codeHint.ConditionAttributeHints.forEach(condAttrHint => {
                    for (const attrName in condAttrHint.attributes) {                
                        const attributeHint = condAttrHint.attributes[attrName];
                        const linkByCollection = attributeHint.linkByCollection.filter(item => item.linkBy.includes("Computer.id"));
                        if (linkByCollection.length > 0) {
                            computerAttrOrContent.push({
                                nodePath: codeHint.NodePath,
                                attrName: attrName,
                                isAttr: true,
                                linkByCollection
                            });
                        }
                    }
                });
            }
        }
        return computerAttrOrContent;
    }

    private getAllComputerAndEosId() : ComputerOrEosItem[] { 
        const computerId:ComputerOrEosItem[] = [];
        for (const node of hacknetNodeHolder.NodeMap[HacknetNodeType.Computer].values()) {
            if (node.Computer.id !== undefined) {
                computerId.push({
                    id: node.Computer.id,
                    filepath: node[hacknetNodeHolder.FilePathSymbol],
                    ip: node.Computer.ip,
                    name: node.Computer.name
                });
            }
    
            if (!node.Computer.eosDevice) {
                continue;
            }
    
            const eosDeviceArr = [];
            if (Array.isArray(node.Computer.eosDevice)) {
                eosDeviceArr.push(...node.Computer.eosDevice);
            } else {
                eosDeviceArr.push(node.Computer.eosDevice);
            }
    
            eosDeviceArr.forEach(eos => {
                computerId.push({
                    id: eos.id,
                    filepath: node[hacknetNodeHolder.RelativePathSymbol],
                    name: eos.name
                });
            });
        }
        return computerId;
    }
}

export function RegisterHacknetNodeRelationViewer(context: vscode.ExtensionContext) {
    const treeView = vscode.window.createTreeView('hacknetNodeRelationViewer', {
        treeDataProvider: new HacknetNodeRelationTreeDataProvider(),
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    EventManager.onEvent(EventType.EditorActiveFileChange, ({nodeType}) => {
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsHacknetComputerFile', nodeType === HacknetNodeType.Computer);
    });
}