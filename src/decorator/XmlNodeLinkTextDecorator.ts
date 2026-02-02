import * as vscode from 'vscode';
import * as CommonUtils from '../utils/CommonUtils';
import { CodeHints, GetNewAttributesByActiveNodeForHint } from "../code-hint/CodeHint";
import lodash from "lodash";
import {ActiveNode, Node, XmlParser} from '../parser/XmlParser';
import XmlPathUtil from '../utils/XmlPathUtil';
import { GetLinkByFinalMatchValue } from '../code-hint/CodeHintDefine';
import { MooToken } from 'moo';
import { EventManager, EventType } from '../event/EventManager';

const XmlDocParser = new XmlParser();

// const underlineDecorationType = vscode.window.createTextEditorDecorationType({
//     textDecoration: 'underline',
//     // 自定义颜色
//     color: 'red',
// });

const underlineDecorationType = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: '↪',  // 特殊符号前缀
        color: '#41d4ee',    // 符号颜色
        margin: '0 4px 0 0', // 与文本的间距
        fontWeight: 'bold'
    }
});

function BuildRangeByToken(token:MooToken):vscode.Range {
    return new vscode.Range(token.line - 1, token.col - 1, token.line - 1, token.col);
}

async function DecoratorXmlNode(xmlNode:Node):Promise<vscode.DecorationOptions[]> {
    const decorations: vscode.DecorationOptions[] = [];
    const codeHint = CodeHints.NodeCodeHintSource.find(item => XmlPathUtil.ComparePath(xmlNode.nodePath, item.NodePath));
    if (!codeHint) {
        return decorations;
    }

    // 递归装饰子节点
    for (const childNode of xmlNode.children) {
        decorations.push(...await DecoratorXmlNode(childNode));
    }

    // 装饰可链接属性
    const attrHints = GetNewAttributesByActiveNodeForHint(new ActiveNode(xmlNode), codeHint);
    for (const [attrName, attrValue] of xmlNode.attribute.entries()) {
        const attrHint = attrHints[attrName];
        if (!attrHint) {
            continue;
        }
        
        const linkVals = await GetLinkByFinalMatchValue(attrHint.linkByCollection, attrValue);
        if (linkVals.length === 0) {
            continue;
        }

        const attrValToken = xmlNode.attributeValueToken.get(attrName);
        if (attrValToken) {
            decorations.push({
                range: BuildRangeByToken({
                    ...attrValToken,
                    col: attrValToken.col + 1
                }),
            });
        }
    }

    // 装饰可链接内容
    if (codeHint.ContentHint && xmlNode.contentToken) {
        const linkVals = await GetLinkByFinalMatchValue(codeHint.ContentHint.linkByCollection, xmlNode.content);
        if (linkVals.length === 0) {
            return decorations;
        }

        decorations.push({
            range: BuildRangeByToken(xmlNode.contentToken),
        });
    }

    return decorations;
}

async function DecoratorActiveXmlText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    if (editor.document.languageId !== 'xml') {
        return;
    }

    const text = editor.document.getText();
    try {
        const xmlNode = XmlDocParser.parse(text, {needToken: true});
        const nodeDecorations = await DecoratorXmlNode(xmlNode);
        editor.setDecorations(underlineDecorationType, nodeDecorations);
        // console.log("link decorations:", nodeDecorations);
    } catch (error) {
        console.error('DecoratorActiveXmlText error:', error);
    }
}


export function RegisterXmlNodeLinkTextDecorator() {
    const context = CommonUtils.GetExtensionContext();
    const debounceDecoratorActiveXmlText = lodash.debounce(DecoratorActiveXmlText, 200);

    EventManager.onEvent(EventType.EditorActiveFileChange, _ => debounceDecoratorActiveXmlText());
    EventManager.onEvent(EventType.CodeHintParseCompleted, _ => debounceDecoratorActiveXmlText());
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(_ => debounceDecoratorActiveXmlText()));
}