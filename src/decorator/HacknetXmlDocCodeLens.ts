import * as vscode from 'vscode';
import { ActiveNode, Node, XmlParser } from '../parser/XmlParser';
import { CodeHints, GetNewAttributesByActiveNodeForHint, HintFileExist } from '../code-hint/CodeHint';
import XmlPathUtil from '../utils/XmlPathUtil';



class XmlDocLensProvider implements vscode.CodeLensProvider{
    onDidChangeCodeLenses?: vscode.Event<void> | undefined;
    private xmlParser: XmlParser;

    constructor() {
        this.xmlParser = new XmlParser();
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        try {
            if (!this.NeedShowTagDescInEditor) {
                return [];
            }
            const xmlDoc = this.xmlParser.parse(document.getText(), {needToken: true});
            return this.parseXmlDocToCodeLens(xmlDoc);
        } catch (error) {
            console.error('XmlDocLensProvider provideCodeLenses error: ' + error);
            return [];
        }
    }

    private get NeedShowTagDescInEditor():boolean {
        return vscode.workspace.getConfiguration('hacknetextensionhelperconfig.viewer').get<boolean>('showTagDescInEditor') as boolean && 
            HintFileExist();
    }

    private parseXmlDocToCodeLens(xmlNode: Node): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const scanNodes:Node[] = [];
        scanNodes.push(xmlNode);
        while (scanNodes.length > 0) {
            const node = scanNodes.shift()!;
            scanNodes.push(...node.children);
            const codeHint = CodeHints.NodeCodeHintSource.find(codeHint => XmlPathUtil.ComparePath(node.nodePath, codeHint.NodePath));
            if (!codeHint) {
                continue;
            }

            // 增加xml标签本身的注释
            codeLenses.push(new vscode.CodeLens(new vscode.Range(
                    node.nameToken!.line - 1, 
                    node.nameToken!.col - 1, 
                    node.nameToken!.line - 1, 
                    node.nameToken!.col
                ), {
                command: '',
                title: codeHint.Desc
            }));

            // 增加属性注释
            const attrs = GetNewAttributesByActiveNodeForHint(new ActiveNode(node), codeHint);
            for (const attrName in attrs) {
                const attrCodeHint = attrs[attrName];
                if (!node.attribute.has(attrName)) {
                    continue;
                }
                codeLenses.push(new vscode.CodeLens(
                    new vscode.Range(
                            node.attributeNameToken!.get(attrName)!.line - 1, 
                            node.attributeNameToken!.get(attrName)!.col - 1, 
                            node.attributeNameToken!.get(attrName)!.line - 1, 
                            node.attributeNameToken!.get(attrName)!.col
                        ), {
                    command: '',
                    title: attrCodeHint.desc
                }));
            }

            // 增加内容装饰
            if (codeHint.ContentHint && node.content.match(/[^\s]+/)) {
                codeLenses.push(new vscode.CodeLens(
                    new vscode.Range(
                        node.contentToken!.line - 1, 
                        node.contentToken!.col - 1, 
                        node.contentToken!.line - 1, 
                        node.contentToken!.col
                    ), {
                    command: '',
                    title: codeHint.ContentHint.desc
                }));
            }

        }

        return codeLenses;
    }

}



export function RegisterHacknetXmlDocCodeLensProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'xml' }, new XmlDocLensProvider()));
}