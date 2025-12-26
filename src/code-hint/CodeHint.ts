import {AttributeHint, AttributeHintItem, CodeHint, CodeHintItem, CommonTextHintItem, ConditionAttributeHint, FileCodeHint, GlobalCodeHints, HintType, LinkBy, NodeCodeHintItem, NodeCodeHints, RepeatRule, RepeatRuleDef} from './CodeHintDefine';
import { XMLParser as StandardXMLParser } from 'fast-xml-parser';
import {ActiveNode, CursorPosition, XmlParser} from '../parser/XmlParser';
import XmlPathUtil from '../utils/XmlPathUtil';
import path from 'path';
import * as vscode from 'vscode';
import * as CommonUtils from '../utils/CommonUtils';
import { hacknetNodeHolder } from '../worker/GlobalHacknetXmlNodeHolder';
import lodash from 'lodash';
import { minimatch } from "minimatch";
import { EventManager, EventType } from "../event/EventManager";



const NodePathSplitChar = '.';
const standardXmlParser = new StandardXMLParser({ 
        ignoreAttributes: false, 
        attributeNamePrefix: '',
        parseAttributeValue: false,
});
const HintFileWatchers:vscode.FileSystemWatcher[] = [];

export const CodeHints:GlobalCodeHints = CreateEmptyHacknetCodeHint();
let HasHintFile = false;
export function HintFileExist() : boolean {
    return HasHintFile;
}

class FileSystemErrorWrapper extends Error {
    constructor(public fileError: vscode.FileSystemError, public fileUri: vscode.Uri) {
        super(fileError.message);
    }
}

function getBool(obj:any, key:string, defaultVal: boolean) {
    if (!(key in obj)) {
        return defaultVal;
    }

    return obj[key].toLowerCase() === 'true' ? true : false;
}

function getDiagLevel(obj:any, key:string): vscode.DiagnosticSeverity | null {
    const diag = obj[key] as string;
    if (!diag) {
        return null;
    }

    if (diag.toUpperCase().startsWith('E')) {
        return vscode.DiagnosticSeverity.Error;
    }

    if (diag.toUpperCase().startsWith('I')) {
        return vscode.DiagnosticSeverity.Information;
    }

    if (diag.toUpperCase().startsWith('W')) {
        return vscode.DiagnosticSeverity.Warning;
    }

    return vscode.DiagnosticSeverity.Hint;
}

function parseEnumAttrCodeHint(codeHint: CodeHint, attrNode: any) {
    if (!('Enums' in attrNode)) {
        return;
    }

    const enums = attrNode['Enums'];
    const kind = enums['kind'] ?? 'enum';

    if (!('Enum' in enums)) {
        return;
    }

    const enumNodeArr = [];
    if (Array.isArray(enums['Enum'])) {
        for (const item of enums['Enum']) {
            enumNodeArr.push(item);
        }
    } else {
        enumNodeArr.push(enums['Enum']);
    }

    enumNodeArr.map(item => typeof item === 'object' ? item : {['#text'] : item})
    .forEach(item => {
        codeHint.items.push({
            value: item['#text']?.toString() ?? '',
            desc: item['desc']?.toString() ?? '',
            filterText: item['filterText']?.toString(),
            kind: item['kind']?.toString() ?? kind
        });
    });
}

function getAttributeNodeHintType(attrNode: any): HintType {
    const hint = attrNode['hint'] ?? 'enum';

    if (hint === 'js' || hint === "javascript") {
        return HintType.JavaScript;
    }

    const key = Object.keys(HintType).find(key => key.toLocaleLowerCase() === hint.toLocaleLowerCase());
    if (key !== undefined) {
        return (HintType as any)[key];
    }

    return HintType.Enum;
}

function parseSubStepNodeHint(curItem:NodeCodeHintItem, step: any) {
    if (!('Next' in step)) {
        return;
    }

    const nextNode = Array.isArray(step['Next']) ? step['Next'][0] : step['Next'];
    if (typeof nextNode !== 'object') {
        return;
    }

    curItem.nextStep = generateCodeHintFromXmlNode(nextNode);
}

function parseStepNodeHint(node: any):NodeCodeHintItem[] {
    if (!('Step' in node)) {
        return [];
    }
    const stepNode = node['Step'];
    const stepNodes:any[] = [];
    if (Array.isArray(stepNode)) {
        stepNodes.push(...stepNode);
    } else {
        stepNodes.push(stepNode);
    }

    return stepNodes.filter(stepNode => typeof stepNode === 'object')
        .map(stepNode => {
        const item: NodeCodeHintItem = {
            value: stepNode['value'] ?? '',
            desc: stepNode['desc'] ?? '',
            filterText: stepNode['filterText'] ?? undefined,
            kind: stepNode['kind'] ?? undefined,
        };
        parseSubStepNodeHint(item, stepNode);
        return item;
    });
}

function parseLinkByCollectionFromNode(node:any):LinkBy[] {
    const res:LinkBy[] = [];
    if (node['linkBy'] !== undefined) {
        res.push({
            linkBy: node['linkBy'],
            linkByValuePattern: null
        });
    }

    if (!(node.LinkByCollection && node.LinkByCollection.Item)) {
        return res;
    }

    const itemNodes = [];
    if (Array.isArray(node.LinkByCollection.Item)) {
        itemNodes.push(...node.LinkByCollection.Item);
    } else {
        itemNodes.push(node.LinkByCollection.Item);
    }
    itemNodes.filter(item => typeof item === 'object')
        .forEach(item => {
            res.push({
                linkBy: item['linkBy'] ?? '',
                linkByValuePattern: item['linkByValuePattern'] ?? null
            });
        });

    return res;
}

function GetRepeatRule(rule:string | undefined):RepeatRule {
    if (rule === undefined) {
        return RepeatRuleDef.OverrideOrAppend;
    }

    const value = Object.values(RepeatRuleDef).find(key => key.toLocaleLowerCase() === rule.toLocaleLowerCase());
    if (value !== undefined) {
        return value;
    }

    return RepeatRuleDef.OverrideOrAppend;
}

function generateCodeHintFromXmlNode(node:any):CodeHint {
    const codeHint: CodeHint = {
        required: getBool(node, 'required', false),
        items: [],
        desc: node['desc'] ?? '',
        type: getAttributeNodeHintType(node),
        content: node['#text'] ?? '',
        codeSnippets: '',
        default: node['default'] ?? '',
        linkByCollection: parseLinkByCollectionFromNode(node),
        repeatRule: GetRepeatRule(node['repeatRule'])
    };

    const diag = getDiagLevel(node, 'diag');
    if (diag !== null) {
        codeHint.diag = diag;
    }
    
    if (codeHint.type === HintType.Step) {
        codeHint.items = parseStepNodeHint(node);
    } else {
        parseEnumAttrCodeHint(codeHint, node);
    }

    // console.log(codeHint);

    return codeHint;
}

function parseNodeHintAttributes(node: any):AttributeHintItem[] {
    const attrNodeList:any[] = [];
    if (!node.Attribute) {
        return [];
    }

    if (Array.isArray(node.Attribute)) {
        attrNodeList.push(...node.Attribute);
    } else {
        attrNodeList.push(node.Attribute);
    }

    return attrNodeList.filter(attrNode => typeof attrNode === 'object')
        .map(attrNode=> {
            const attrName = attrNode.name;
            const codeHint = generateCodeHintFromXmlNode(attrNode);
            codeHint.codeSnippets = `${attrName}="\${1:${codeHint.default}}" `;
            return {attrName, codeHint};
        });
}

function parseNodeHintConditionAttributes(node: any):ConditionAttributeHint[] {
    const conditionAttrNodeList:any[] = [];
    if (!node.ConditionAttributes) {
        return [];
    }

    if (Array.isArray(node.ConditionAttributes)) {
        conditionAttrNodeList.push(...node.ConditionAttributes);
    } else {
        conditionAttrNodeList.push(node.ConditionAttributes);
    }

    return conditionAttrNodeList.filter(conditionNode => typeof conditionNode === 'object')
        .filter(conditionNode => conditionNode['attr'] !== undefined)
        .map(conditionNode=> {
            const conditionAttributeHint:ConditionAttributeHint = {
                attrName: conditionNode['attr'],
                match: conditionNode['match'] ?? '',
                attributes: {},
                repeatRule: GetRepeatRule(conditionNode['repeatRule'])
            };
            parseNodeHintAttributes(conditionNode).forEach(item => conditionAttributeHint.attributes[item.attrName] = item.codeHint);

            return conditionAttributeHint;
        });
}

function parseNodeHintContent(nodeCodeHint:NodeCodeHints, node: any) {
    nodeCodeHint.ContentHint = null;
    if (!('Content' in node)) {
        return;
    }

    if (node['Content'] === '') {
        node['Content'] = {};
    }

    let contentNode = node['Content'];
    if (Array.isArray(contentNode)) {
        if (contentNode.length === 0) {
            return;
        }
        contentNode = contentNode[contentNode.length - 1];
    }

    const codeHint = generateCodeHintFromXmlNode(contentNode);
    codeHint.required = true;
    nodeCodeHint.ContentHint = codeHint;
}

function generateNodeCodeSnippets(nodeCodeHint:NodeCodeHints) {
    let snippets = `<${nodeCodeHint.Name}`;
    let index = 1;
    const newLineLimitCount = 120;
    let nextNewLineCount = newLineLimitCount;
    for (const attrName in nodeCodeHint.AttributeNodeHint) {
        const codeHint = nodeCodeHint.AttributeNodeHint[attrName];
        if (codeHint.required) {
            snippets += ` ${attrName}="\${${index}:${codeHint.default}}"`;
            index++;
        }

        if (snippets.length >= nextNewLineCount) {
            snippets += '\n    ';
            nextNewLineCount += newLineLimitCount;
        }
    }

    if (nodeCodeHint.ConditionAttributeHints.length > 0) {
        snippets += `\${${index++}}`;
    }

    if (nodeCodeHint.ContentHint !== null) {
        if (nodeCodeHint.ContentHint.default === '') {
            snippets += `>\n    \${${index++}}\n</${nodeCodeHint.Name}>`;
        } else {
            snippets += `>\${${index++}:${nodeCodeHint.ContentHint.default}}</${nodeCodeHint.Name}>`;
        }
    } else {
        snippets += ' />';
    }

    nodeCodeHint.CodeSnippets = snippets;
}

function parseNodeToNodeCodeHints(node: any): NodeCodeHints[]{
    let nodeCodeHint:NodeCodeHints = {
        Name: '',
        NodePath: node.name,
        Leval: 0,
        Desc: node.desc ?? '',
        AttributeNodeHint: {},
        ConditionAttributeHints: parseNodeHintConditionAttributes(node),
        ContentHint: null,
        CodeSnippets: '',
        Multi: getBool(node, 'multi', true),
        Enable: getBool(node, 'enable', true),
        FileTriggerPattern: node['fileTriggerPattern'] ?? null
    };

    if (!nodeCodeHint.Enable) {
        return [];
    }

    const splitArr = nodeCodeHint.NodePath.split(NodePathSplitChar);
    nodeCodeHint.Name = splitArr[splitArr.length - 1];
    nodeCodeHint.Leval = splitArr.length;

    parseNodeHintAttributes(node).forEach(item => nodeCodeHint.AttributeNodeHint[item.attrName] = item.codeHint);
    parseNodeHintContent(nodeCodeHint, node);
    // 代码片段在最后合并完成的时候生成
    // generateNodeCodeSnippets(nodeCodeHint);

    // 路径存在|则分隔后复制
    if (nodeCodeHint.NodePath.includes('|')) {
        const partPaths = nodeCodeHint.NodePath.split('|');
        return partPaths.map(path => {
            const copyNodeCodeHint:NodeCodeHints = lodash.cloneDeep(nodeCodeHint);
            copyNodeCodeHint.NodePath = path;

            // 重新计算名称与层级
            const splitArr = copyNodeCodeHint.NodePath.split(NodePathSplitChar);
            copyNodeCodeHint.Name = splitArr[splitArr.length - 1];
            copyNodeCodeHint.Leval = splitArr.length;

            return copyNodeCodeHint;
        });
    }

    return [nodeCodeHint];
}

/**
 * 根据xml文件/对象获取编辑器提示信息
 * @param xmlTipText  xml文件内容或解析后的js对象
 * @returns 所有可用的编辑器提示信息
 */
function GetNodeCodeHints(xmlTip: string | any): NodeCodeHints[] {
    const nodeCodeHints: NodeCodeHints[] = [];
    const xmlJsObj  = typeof xmlTip === 'string' ? standardXmlParser.parse(xmlTip) : xmlTip;
    if (!('HacknetEditorHint' in xmlJsObj)) {
        return nodeCodeHints;
    }

    const hacknetEditorHint = xmlJsObj['HacknetEditorHint'];
    if (!('Node' in hacknetEditorHint)) {
        return nodeCodeHints;
    }

    if (Array.isArray(hacknetEditorHint.Node)) {
        for (const item of hacknetEditorHint.Node) {
            try {
                nodeCodeHints.push(...parseNodeToNodeCodeHints(item));
            } catch (error) {
                console.error(`解析提示文件节点错误: ${error}`, item);
            }
        }
    } else {
        nodeCodeHints.push(...parseNodeToNodeCodeHints(hacknetEditorHint.Node));
    }

    return nodeCodeHints;
}

function ParseTextHintItem(replaceTextHintNode: any): CommonTextHintItem[] {
    if (!('Text' in replaceTextHintNode)) {
        return [];
    }

    const textNodes:any[] = [];

    if (Array.isArray(replaceTextHintNode.Text)) {
        textNodes.push(...replaceTextHintNode.Text);
    } else {
        textNodes.push(replaceTextHintNode.Text);
    }

    return textNodes.filter(node => typeof node === 'object')
        .map(item => {
            const res:CommonTextHintItem = {
                value: item.value?.toString() ?? '',
                desc: item.desc?.toString() ?? '',
                filterText: item.filterText?.toString(),
                kind: item.kind ?? 'Text',
                label: item.label,
                document: item.doc,
            };

            return res;
        });
}


/**
 * 根据xml文件/对象获取替换文本(#xxx#)信息
 * @param xmlTip xml文件内容或解析后的js对象
 */
export function GetReplaceTextCodeHints(xmlTip: string | any): CodeHintItem[] {
    const codeHints: CodeHintItem[] = [];
    const xmlJsObj  = typeof xmlTip === 'string' ? standardXmlParser.parse(xmlTip) : xmlTip;
    
    if (!('HacknetEditorHint' in xmlJsObj)) {
        return codeHints;
    }

    const hacknetEditorHint = xmlJsObj['HacknetEditorHint'];
    if (!('ReplaceTextHint' in hacknetEditorHint)) {
        return codeHints;
    }

    if (Array.isArray(hacknetEditorHint.ReplaceTextHint)) {
        for (const item of hacknetEditorHint.ReplaceTextHint) {
            codeHints.push(...ParseTextHintItem(item));
        }
    } else {
        codeHints.push(...ParseTextHintItem(hacknetEditorHint.ReplaceTextHint));
    }

    return codeHints;
}

/**
 * 根据xml文件/对象获取通用文本信息
 * @param xmlTip xml文件内容或解析后的js对象
 */
export function GetCommonTextCodeHints(xmlTip: string | any): CodeHintItem[] {
    const codeHints: CodeHintItem[] = [];
    const xmlJsObj  = typeof xmlTip === 'string' ? standardXmlParser.parse(xmlTip) : xmlTip;
    
    if (!('HacknetEditorHint' in xmlJsObj)) {
        return codeHints;
    }

    const hacknetEditorHint = xmlJsObj['HacknetEditorHint'];
    if (!('CommonTextHint' in hacknetEditorHint)) {
        return codeHints;
    }

    if (Array.isArray(hacknetEditorHint.CommonTextHint)) {
        for (const item of hacknetEditorHint.CommonTextHint) {
            codeHints.push(...ParseTextHintItem(item));
        }
    } else {
        codeHints.push(...ParseTextHintItem(hacknetEditorHint.CommonTextHint));
    }

    return codeHints;
}

/**
 * 根据xml文件/对象获取hacker脚本提示源
 * @param xmlTip xml文件内容或解析后的js对象
 */
export function GetHackerScriptsCodeHints(xmlTip: string | any): FileCodeHint {
    const fileCodeHint: FileCodeHint = {
        fileTriggerPattern: '**/*.txt',
        codeHintItems: []
    };
    const xmlJsObj  = typeof xmlTip === 'string' ? standardXmlParser.parse(xmlTip) : xmlTip;
    
    if (!('HacknetEditorHint' in xmlJsObj)) {
        return fileCodeHint;
    }

    const hacknetEditorHint = xmlJsObj['HacknetEditorHint'];
    if (!('HackerScriptsHint' in hacknetEditorHint)) {
        return fileCodeHint;
    }

    const hackerScriptsHintNode = hacknetEditorHint.HackerScriptsHint;
    if (hackerScriptsHintNode.fileTriggerPattern) {
        fileCodeHint.fileTriggerPattern = hackerScriptsHintNode.fileTriggerPattern;
    }

    if (Array.isArray(hackerScriptsHintNode)) {
        for (const item of hackerScriptsHintNode) {
            fileCodeHint.codeHintItems.push(...ParseTextHintItem(item));
        }
    } else {
        fileCodeHint.codeHintItems.push(...ParseTextHintItem(hackerScriptsHintNode));
    }

    return fileCodeHint;
}

/**
 * 创建一个空的代码提示结构
 */
function CreateEmptyHacknetCodeHint():GlobalCodeHints {
    const codeHints:GlobalCodeHints = {
        NodeCodeHintSource: [],
        ReplaceTextSource: [],
        CommonTextSource: [],
        HackerScriptSource: {
            fileTriggerPattern: '**/*.txt',
            codeHintItems: []
        },
        IncludeFiles: []
    };

    return codeHints;
}

/**
 * 清空提示信息
 */
function ClearHacknetCodeHint() {
    CodeHints.CommonTextSource = [];
    CodeHints.NodeCodeHintSource = [];
    CodeHints.ReplaceTextSource = [];
    CodeHints.IncludeFiles = [];
    CodeHints.HackerScriptSource = {
        fileTriggerPattern: '**/*.txt',
        codeHintItems: []
    };
    EventManager.fireEvent(EventType.CodeHintSourceChange, CodeHints);
    vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.HasCodeHintFile', false);
    HasHintFile = false;
}

/**
 * 获取提示文件中所有的include引用的其他文件
 * @param xmlTip 
 */
function GetIncludeFileFromCodeHintFile(xmlTip: string | any):string[] {
    const xmlJsObj  = typeof xmlTip === 'string' ? standardXmlParser.parse(xmlTip) : xmlTip;

    if (!('HacknetEditorHint' in xmlJsObj)) {
        return [];
    }

    const hacknetEditorHint = xmlJsObj['HacknetEditorHint'];
    if (!hacknetEditorHint.Include) {
        return [];
    }

    const inclideElements:any[] = [];
    
    if (Array.isArray(hacknetEditorHint.Include)) {
        inclideElements.push(...hacknetEditorHint.Include);
    } else {
        inclideElements.push(hacknetEditorHint.Include);
    }

    return inclideElements.filter(item => typeof item === 'object' && item['path']).map(item => item['path']);
}

/**
 * 合并相同提示节点
 */
function CombineSameNode(nodeHints: NodeCodeHints[]) {
    CommonUtils.CombineSameElementFromArray(nodeHints, CommonUtils.CombineType.OverrideOrAppend, (a, b) => a.NodePath === b.NodePath, (curNode, sameNode) => {
        if (sameNode.Desc.length > 0) {
            curNode.Desc = sameNode.Desc;
        }

        if (sameNode.FileTriggerPattern !== null) {
            curNode.FileTriggerPattern = sameNode.FileTriggerPattern;
        }

        if (sameNode.ContentHint !== null) {
            if (sameNode.ContentHint.repeatRule === RepeatRuleDef.OverrideOrAppend) {
                curNode.ContentHint = sameNode.ContentHint;
            } else if (sameNode.ContentHint.repeatRule === RepeatRuleDef.Remove) {
                curNode.ContentHint = null;
            }
        }

        for (const attrName in sameNode.AttributeNodeHint) {
            const sameAttrHint = sameNode.AttributeNodeHint[attrName];
            if (sameAttrHint.repeatRule === RepeatRuleDef.OverrideOrAppend) {
                curNode.AttributeNodeHint[attrName] = sameAttrHint;
            } else if (sameAttrHint.repeatRule === RepeatRuleDef.Remove) {
                delete curNode.AttributeNodeHint[attrName];
            } else {
                const curAttrHint = curNode.AttributeNodeHint[attrName];
                if (curAttrHint === undefined) {
                    curNode.AttributeNodeHint[attrName] = sameAttrHint;
                    continue;
                }
                curAttrHint.items.push(...sameAttrHint.items);
                CommonUtils.CombineSameElementFromArray(curAttrHint.items, 
                    sameAttrHint.repeatRule === RepeatRuleDef.OverrideOrAppendItem ? CommonUtils.CombineType.OverrideOrAppend : CommonUtils.CombineType.Remove,
                    (i1, i2) => i1.value === i2.value,
                    (i1, i2) => {
                        i1.desc = i2.desc;
                        i1.filterText = i2.filterText;
                        i1.kind = i2.kind;
                        i1.label = i2.label;
                        i1.nextStep = i2.nextStep;
                    }
                );
            }
        }

        for (const condAttrHint of sameNode.ConditionAttributeHints) {
            curNode.ConditionAttributeHints.push(condAttrHint);
            CommonUtils.CombineSameElementFromArray(curNode.ConditionAttributeHints,
                condAttrHint.repeatRule === RepeatRuleDef.Remove ? CommonUtils.CombineType.Remove : CommonUtils.CombineType.OverrideOrAppend,
               (c1, c2) => c1.attrName === c2.attrName && c1.match === c2.match,
               (c1, c2) => {
                    if (condAttrHint.repeatRule === RepeatRuleDef.OverrideOrAppend) {
                        return true;
                    }

                    if (condAttrHint.repeatRule === RepeatRuleDef.OverrideOrAppendItem) {
                        for (const attrName in c2.attributes) {
                            c1.attributes[attrName] = c2.attributes[attrName];
                        }
                        return;
                    }

                    if (condAttrHint.repeatRule === RepeatRuleDef.RemoveItem) {
                        for (const attrName in c2.attributes) {
                            delete c1.attributes[attrName];
                        }
                        return;
                    }
               }
            );
        }
    });

    // 全部重新生成代码片段
    nodeHints.forEach(node => generateNodeCodeSnippets(node));
}

/**
 * 从提示文件中获取提示信息
 * @param fileUri 提示文件uri
 * @returns 提示信息
 */
async function GetCodeHintFromCodeHintFile(fileUri: vscode.Uri):Promise<GlobalCodeHints>{
    let codeHints:GlobalCodeHints | null = null;
    try {
        const res = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(res).toString('utf-8');
        const xmlObj = standardXmlParser.parse(content);
        codeHints = {
            NodeCodeHintSource: GetNodeCodeHints(xmlObj),
            ReplaceTextSource: GetReplaceTextCodeHints(xmlObj),
            CommonTextSource: GetCommonTextCodeHints(xmlObj),
            HackerScriptSource: GetHackerScriptsCodeHints(xmlObj),
            IncludeFiles: GetIncludeFileFromCodeHintFile(xmlObj)
        };
    } catch (err) {
        if (err instanceof vscode.FileSystemError) {
            throw new FileSystemErrorWrapper(err, fileUri);
        }
    }

    if (codeHints === null) {
        codeHints = CreateEmptyHacknetCodeHint();
    }

    for (const otherFile of codeHints.IncludeFiles) {
        const rootUri = vscode.workspace.workspaceFolders![0].uri;
        const targetUri = vscode.Uri.joinPath(rootUri, otherFile);
        const hints = await GetCodeHintFromCodeHintFile(targetUri);

        codeHints.NodeCodeHintSource.push(...hints.NodeCodeHintSource);
        codeHints.ReplaceTextSource.push(...hints.ReplaceTextSource);
        codeHints.CommonTextSource.push(...hints.CommonTextSource);
        codeHints.HackerScriptSource.codeHintItems.push(...hints.HackerScriptSource.codeHintItems);
        codeHints.IncludeFiles.push(...hints.IncludeFiles);
    }

    CombineSameNode(codeHints.NodeCodeHintSource);

    return codeHints;
}

/**
 * 获取更提示文件的uri
 */
export function GetHacknetEditorHintFileUri():vscode.Uri { 
    const rootUri = vscode.workspace.workspaceFolders![0].uri;
    return vscode.Uri.joinPath(rootUri, 'Hacknet-EditorHint.xml');
}


/**
 * 从提示文件中获取提示信息
 */
async function GetCodeHintFromHacknetCodeHintFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    const targetUri = GetHacknetEditorHintFileUri();
    try {
        const res = await GetCodeHintFromCodeHintFile(targetUri);
        CodeHints.CommonTextSource = res.CommonTextSource;
        CodeHints.HackerScriptSource = res.HackerScriptSource;
        CodeHints.IncludeFiles = res.IncludeFiles;
        CodeHints.NodeCodeHintSource = res.NodeCodeHintSource;
        CodeHints.ReplaceTextSource = res.ReplaceTextSource;
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.HasCodeHintFile', true);
        HasHintFile = true;
        EventManager.fireEvent(EventType.CodeHintParseCompleted, CodeHints);
        WatchCodeHintFile(CommonUtils.GetExtensionContext(), CodeHints.IncludeFiles, false);
    } catch (err) {
        ClearHacknetCodeHint();
        if (!(err instanceof FileSystemErrorWrapper) ||
            err.fileError.code !== vscode.FileSystemError.FileNotFound().code ||
            err.fileUri.fsPath !== targetUri.fsPath
        ) {
            console.error(err);
            vscode.window.showErrorMessage('解析Hacknet提示文件出错: ' + err);
        }
    }
}

/**
 * 监控hacknet提示文件
 */
function WatchCodeHintFile(context: vscode.ExtensionContext, relativeIncludeFilePath: string[], isRootHintFile:boolean) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
        return;
    }

    const config = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hintFile');
    if (!config.get<boolean>("autoRefresh")) {return;}

    // 清空旧的文件监控
    const [_, ...includeFileWatchers] = HintFileWatchers;
    includeFileWatchers.forEach(watch => {
        const watchIdx = context.subscriptions.findIndex(item => item === watch);
        if (watchIdx >= 0) {
            context.subscriptions.splice(watchIdx, 1);
        }
        watch.dispose();
    });
    HintFileWatchers.splice(1, HintFileWatchers.length - 1);

    const debounceGetCodeHintFromHacknetCodeHintFile = lodash.debounce(GetCodeHintFromHacknetCodeHintFile, 3000);
    relativeIncludeFilePath.forEach(filepath => {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolders[0], filepath));
        // 文件内容变更（磁盘层面）
        watcher.onDidChange(_ => {
            debounceGetCodeHintFromHacknetCodeHintFile();
        });

        // 文件创建
        watcher.onDidCreate(_ => {
            debounceGetCodeHintFromHacknetCodeHintFile();
        });

        // 文件删除
        watcher.onDidDelete(_ => {
            debounceGetCodeHintFromHacknetCodeHintFile();
        });

        context.subscriptions.push(watcher);

        if (isRootHintFile) {
            HintFileWatchers.unshift(watcher);
        } else {
            HintFileWatchers.push(watcher);
        }
    });
}

/**
 * 释放所有提示文件监控
 */
function DisposeAllHintFileWatcher() {
    const context = CommonUtils.GetExtensionContext();

    HintFileWatchers.forEach(watch => {
        const watchIdx = context.subscriptions.findIndex(item => item === watch);
        if (watchIdx >= 0) {
            context.subscriptions.splice(watchIdx, 1);
        }
        watch.dispose();
    });
    HintFileWatchers.splice(0, HintFileWatchers.length);
}


/**
 * 监听Hacknet-EditorHint.xml文件改变
 */
function WatchHacknetCodeHintFile(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
        return;
    }

    vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.HasCodeHintFile', false);
    HasHintFile = false;

    // Hacknet-EditorHint.xml文件监控，必要项
    WatchCodeHintFile(context, ["Hacknet-EditorHint.xml"], true);
}

/**
 * 根据当前激活节点获取最新的属性提示信息
 */
function GetNewAttributesByActiveNodeForHint(actNode: ActiveNode, nodeCodeHint: NodeCodeHints): AttributeHint {
    if (nodeCodeHint.ConditionAttributeHints.length === 0) {
        return nodeCodeHint.AttributeNodeHint;
    }
    const newAttrNodeHint:AttributeHint = {};
    // 复制一份老的，不需要全部深拷贝
    for (const attrName in nodeCodeHint.AttributeNodeHint) {
        newAttrNodeHint[attrName] = nodeCodeHint.AttributeNodeHint[attrName];
    }

    // 进行condition判断
    nodeCodeHint.ConditionAttributeHints.forEach(conditionAttr => {
        const attrValue = actNode.node.attribute.get(conditionAttr.attrName);
        if (attrValue === undefined) {
            return;
        }

        if (attrValue.match(conditionAttr.match)) {
            // 条件检测成功附加新属性
            for (const newAttrName in conditionAttr.attributes) {
                newAttrNodeHint[newAttrName] = conditionAttr.attributes[newAttrName];
            }
        }
    });

    return newAttrNodeHint;
}

/**
 * 获取最外侧Node提示信息
 * @returns 提示信息
 */
function GetFirstLevelCodeHint() : vscode.CompletionItem[]  {
    return CodeHints.NodeCodeHintSource.filter(item => item.Leval === 1)
        .map((item, idx) => {
            const completionItem = new vscode.CompletionItem(item.Name);
            completionItem.detail = item.Desc;
            completionItem.insertText = new vscode.SnippetString(item.CodeSnippets);
            completionItem.sortText = idx.toString().padStart(3, '0');
            completionItem.kind = vscode.CompletionItemKind.Snippet;
            return completionItem;
        });
}

/**
 * 获取Step类型的提示信息
 */
async function GetCodeHintItemForStep(actNode: ActiveNode, codeHint: CodeHint): Promise<CodeHintItem[]> {
    if (codeHint.type !== HintType.Step) {
        return [];
    }

    let curValue = actNode.cursorPosition === CursorPosition.Content ?
        actNode.node?.content :
        actNode.activeAttributeValueToken?.value;
    if (curValue === undefined || curValue === null) {
        return [];
    }

    curValue = curValue.trim(); 
    if (curValue.length === 0) {
        return codeHint.items;
    }

    function GetLastStep(curHint: CodeHint, matchValue: string):CodeHint | undefined {
        const curStepItem = curHint.items.find(it => it.value.length > 0 && matchValue.startsWith(it.value));
        if (!curStepItem) {
            return;
        }
        matchValue = matchValue.substring(curStepItem.value.length);

        if (matchValue.length === 0) {
            return curStepItem.nextStep;
        }
        
        if (curStepItem.nextStep === undefined) {
            return;
        }

        if (curStepItem.nextStep.type === HintType.Step) {
            return GetLastStep(curStepItem.nextStep, matchValue);
        }        
    }

    const lastCodeHint = GetLastStep(codeHint, curValue);
    if (!lastCodeHint) {
        return [];
    }

    if (lastCodeHint.type === HintType.Step) {
        return lastCodeHint.items;
    }
    
    return GetCodeHintItems(actNode, lastCodeHint);
}

/**
 * 获取路径类型的提示信息
 */
async function GetPathToGetCodeHintItems(codeHint: CodeHint):Promise<CodeHintItem[]> {
    if (codeHint.type !== HintType.Folder && codeHint.type !== HintType.Path) {
        return [];
    }
    const rootUri = CommonUtils.GetWorkspaceRootUri()!;
    const uriArr = await vscode.workspace.findFiles(codeHint.content);
    // 返回文件路径
    if (codeHint.type === HintType.Path) {
        return uriArr.map(uri => {
            return {
                value: path.relative(rootUri.fsPath, uri.fsPath).replaceAll('\\', '/'), 
                desc: '',
                filterText: undefined,
                kind: 'file'
            };
        });
    }
    
    // 返回folder路径
    const folders = new Set(uriArr.map(uri => path.relative(rootUri.fsPath, vscode.Uri.joinPath(uri, '..').fsPath).replaceAll('\\', '/')));
    const resFolder = new Set<string>();
    for (const folder of folders) {
        let parentPath = path.resolve(rootUri.fsPath, folder);
        while (true) {
            const relaPath = path.relative(rootUri.fsPath, parentPath).replaceAll('\\', '/');
            resFolder.add(relaPath === '' ? './' : relaPath);
            if (parentPath === rootUri.fsPath) {
                break;
            }
            parentPath = path.resolve(rootUri.fsPath, parentPath, '..');
        }
    }
    return [...resFolder].map(relativePath => {
        return {
                value: relativePath, 
                desc: '',
                filterText: undefined,
                kind: 'folder'
            };
    });
}

/**
 * 获取计算机或eos设备ID的提示信息
 * @param codeHint 
 */
function GetComputerOrEosIdToGetCodeHintItems(codeHint: CodeHint):CodeHintItem[]{
    const res:CodeHintItem[] = [];

    if (codeHint.type !== HintType.ComputerOrEos) {
        return res;
    }

    hacknetNodeHolder.GetComputers().forEach(item => {
        if (item.id) {
            res.push({value: item.id, desc: item.name, filterText: item.id, kind: 'Reference'});
        }

        if (!item.eosDevice) {
            return;
        }

        const eosDeviceArr = [];
        if (Array.isArray(item.eosDevice)) {
            eosDeviceArr.push(...item.eosDevice);
        } else {
            eosDeviceArr.push(item.eosDevice);
        }

        eosDeviceArr.forEach(eos => {
            res.push({value: eos.id, desc: eos.name, filterText: eos.id, kind: 'Reference'});
        });
    });

    return res;
}

/**
 * 根据CodeHint获取实际的提示信息
 * @param actNode 当前激活节点
 * @param codeHint 定义的提示信息
 * @returns 实际提示信息
 */
async function GetCodeHintItems(actNode: ActiveNode, codeHint: CodeHint): Promise<CodeHintItem[]> {
    if (codeHint.type === HintType.Enum) {
        return codeHint.items;
    }

    if (codeHint.type === HintType.EnumWithCommonString) {
        return [...codeHint.items, ...CodeHints.CommonTextSource];
    }

    if (codeHint.type === HintType.JavaScript) {
        return ExecJsFuncToGetCodeHintItems(actNode, codeHint);
    }

    if (codeHint.type === HintType.Computer) {
        return hacknetNodeHolder.GetComputers().map(item => {
            return {value: item.id, desc: item.name, filterText: item.id, kind: 'Reference'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.ComputerOrEos) {
        return GetComputerOrEosIdToGetCodeHintItems(codeHint).concat(codeHint.items);
    }

    if (codeHint.type === HintType.ActionFile) {
        return hacknetNodeHolder.GetActions().map(item => {
            return {value: item['__RelativePath__'] ?? '', desc: '', filterText: undefined, kind: 'file'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.ThemeFile) {
        return hacknetNodeHolder.GetThemes().map(item => {
            return {value: item['__RelativePath__'] ?? '', desc: '', filterText: undefined, kind: 'file'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.MisisonFile) {
        return hacknetNodeHolder.GetMissions().map(item => {
            return {value: item['__RelativePath__'] ?? '', desc: '', filterText: undefined, kind: 'file'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.FactionFile) {
        return hacknetNodeHolder.GetFactions().map(item => {
            return {value: item['__RelativePath__'] ?? '', desc: '', filterText: undefined, kind: 'file'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.PeopleFile) {
        return hacknetNodeHolder.GetPeoples().map(item => {
            return {value: item['__RelativePath__'] ?? '', desc: '', filterText: undefined, kind: 'file'} as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.Step) {
        return GetCodeHintItemForStep(actNode, codeHint);
    }

    if (codeHint.type === HintType.Color) {
        return new Array(5).fill(0).map(_ => {
            const r = Math.floor(Math.random() * 256).toString();
            const g = Math.floor(Math.random() * 256).toString();
            const b = Math.floor(Math.random() * 256).toString();
            return {value: `${r},${g},${b}`, desc: '随机生成的颜色',filterText: undefined, kind: 'color' } as CodeHintItem;
        }).concat(codeHint.items);
    }

    if (codeHint.type === HintType.Path || codeHint.type === HintType.Folder) {
        return (await GetPathToGetCodeHintItems(codeHint)).concat(codeHint.items);
    }

    return [];
}

/**
 * 获取内容则提示信息
 * @param actNode 当前激活的节点信息
 * @returns 提示信息
 */
async function GetHacknetNodeContentHint(actNode: ActiveNode) : Promise<vscode.CompletionItem[]>  {
    const compArr = CodeHints.NodeCodeHintSource.filter(item => item.Leval === actNode.Level + 1 && XmlPathUtil.IsParentPath(actNode.Path, item.NodePath))
        .filter(item => actNode.node.children.every(childNode => childNode.name !== item.Name || item.Multi))
        .map((item, idx) => {
            const completionItem = new vscode.CompletionItem(item.Name);
            completionItem.detail = item.Desc;
            completionItem.insertText = new vscode.SnippetString(item.CodeSnippets);
            completionItem.sortText = idx.toString().padStart(3, '0');
            completionItem.kind = vscode.CompletionItemKind.Snippet;
            
            return completionItem;
        });
    
    // 存在子节点提示则忽略content提示
    if (compArr.length > 0) {
        return compArr;
    }
    
    const nodeHint = CodeHints.NodeCodeHintSource.find(item => XmlPathUtil.EqualPath(item.NodePath, actNode.Path));
    if (!nodeHint || nodeHint.ContentHint === null) {
        return compArr;
    }

    const codeHintItems = await GetCodeHintItems(actNode, nodeHint.ContentHint);

    codeHintItems.forEach((item, idx) => {
            const completionItem = new vscode.CompletionItem(item.label ?? item.value);
            completionItem.detail = item.desc;
            completionItem.insertText = item.value;
            completionItem.sortText = idx.toString().padStart(3, '0');
            completionItem.filterText = item.filterText;
            completionItem.kind = GetCompletionItemKindFromStr(item.kind);

            compArr.push(completionItem);
        });

    return compArr;
}

/**
 * 执行JS代码获取属性值提示信息
 */
function ExecJsFuncToGetCodeHintItems(actNode: ActiveNode, codeHint: CodeHint): CodeHintItem[] {
    if (codeHint.type !== HintType.JavaScript) {
        return [];
    }

    const checkObjIsCodeHintItem = (obj:any) => {
        if (!('value' in obj)) {
            return false;
        }

        if (!('desc' in obj)) {
            obj['desc'] = '';
        }

        if (typeof obj['value'] !== 'string') {
            obj['value'] = obj['value'].toString();
        }

        return true;
    };

    const codeHintArr: CodeHintItem[] = [];
    const res = eval(codeHint.content)(actNode, hacknetNodeHolder);
    if (res === null || res === undefined) {
        return [];
    }
    if (Array.isArray(res)) {
        for (const item of res) {
            if (checkObjIsCodeHintItem(item)) {
                codeHintArr.push(item as CodeHintItem);
            }
        }
    } else if (checkObjIsCodeHintItem(res)) {
        codeHintArr.push(res as CodeHintItem);
    }

    return codeHintArr;
}

function GetCompletionItemKindFromStr(str: string | undefined): vscode.CompletionItemKind | undefined {
    if (str === undefined || str === null) {
        return;
    }

    const key = Object.keys(vscode.CompletionItemKind).find(key => key.toLocaleLowerCase() === str.toLocaleLowerCase());
    if (key === undefined) {
        return;
    }

    return (vscode.CompletionItemKind as any)[key];
}

async function GetHacknetNodeAttributeHint(actNode: ActiveNode) : Promise<vscode.CompletionItem[]>{
    const completionItems : vscode.CompletionItem[] = [];
    const codeHint = CodeHints.NodeCodeHintSource.find(item => XmlPathUtil.EqualPath(item.NodePath, actNode.Path));
    if (codeHint === undefined) {
        return completionItems;
    }

    const attributes = GetNewAttributesByActiveNodeForHint(actNode, codeHint);

    // 提示属性
    if (actNode.activeAttributeNameToken === null) {
        let idx = 0;
        for (const attrName in attributes) {
            // 排除已经存在的属性
            if (actNode.node.attribute.has(attrName)) {
                continue;
            }

            const attrCodeHint = attributes[attrName];
            const completionItem = new vscode.CompletionItem(attrName);
            completionItem.detail = attrCodeHint.desc;
            completionItem.insertText = new vscode.SnippetString(attrCodeHint.codeSnippets);
            completionItem.sortText = (idx++).toString().padStart(3, '0');
            completionItem.kind = vscode.CompletionItemKind.Property;
            completionItems.push(completionItem);
        }

        return completionItems;
    }

    // 提示属性值
    if (actNode.activeAttributeValueToken !== null) {
        const attrName = actNode.activeAttributeNameToken.value;
        if (!(attrName in attributes)) {
            return completionItems;
        }

        const attrCodeHint = attributes[attrName];
        const codeHintItems = await GetCodeHintItems(actNode, attrCodeHint);
        
        codeHintItems.forEach((item, idx) => {
            const completionItem = new vscode.CompletionItem(item.label ?? item.value);
            completionItem.detail = item.desc;
            completionItem.insertText = item.value;
            completionItem.sortText = idx.toString().padStart(3, '0');
            completionItem.filterText = item.filterText;
            completionItem.kind = GetCompletionItemKindFromStr(item.kind);
            completionItems.push(completionItem);
        });
    }

    return completionItems;
}

/**
 * 根据当前光标处的node信息获取提示信息
 * @param actNode 当前光标处的node信息
 */
async function GetCoedHintByActiveNode(actNode: ActiveNode | null, documentFileUri:vscode.Uri): Promise<vscode.CompletionItem[] | undefined | null> {
    const sourceNodeHints = CodeHints.NodeCodeHintSource;
    CodeHints.NodeCodeHintSource = [];
    const replativeDocumentFilePath = path.relative(CommonUtils.GetWorkspaceRootUri()!.fsPath, documentFileUri.fsPath);
    try {
        // 过滤文件进行提示
        for (const nodeCodeHints of sourceNodeHints) {
            if (nodeCodeHints.FileTriggerPattern === null || minimatch(replativeDocumentFilePath, nodeCodeHints.FileTriggerPattern)) {
                CodeHints.NodeCodeHintSource.push(nodeCodeHints);
            }
        }

        // 获取所有第一层级的完整节点提示
        if (actNode === null) {
            return GetFirstLevelCodeHint();
        }

        // 获取Content提示
        if (actNode.cursorPosition === CursorPosition.Content) {
            return await GetHacknetNodeContentHint(actNode);
        }

        // 获取attribute提示
        if (actNode.cursorPosition === CursorPosition.Attribute) {
            return await GetHacknetNodeAttributeHint(actNode);
        }
    } catch (error) {
        console.error(error);
    } finally {
        CodeHints.NodeCodeHintSource = sourceNodeHints;
    }

    return [];
}

/**
 * 获取当前鼠标所在文档对应的激活节点
 * @param text 文档内容
 * @param currentOffset 当前鼠标对应的文档内偏移 
 * @returns 激活节点信息
 */
function GetActiveNodeInMouseHover(text: string, currentOffset: number): ActiveNode | null {
    const xmlParser = new XmlParser();
    while (currentOffset < text.length) {
        const curText = text[currentOffset];
        const curText2Char = text.substring(currentOffset, currentOffset + 2);
        if (curText.match(/[<>\s="]/) !== null || curText2Char === "/>") {
            break;
        }
        currentOffset++;
    }

    return xmlParser.parseActiveNode(text, {
        needToken: true,
        activeOffset: currentOffset
    });
}

function GetMouseHoverDescByCodeHint(codeHint: CodeHint, value: string):string{
    if (codeHint.type === HintType.Enum) {
        return codeHint.items.find(item => item.value === value)?.desc ?? codeHint.desc;
    }

    if (codeHint.type === HintType.Step) {
        return codeHint.items.find(item => value.startsWith(item.value))?.desc ?? codeHint.desc;
    }

    return codeHint.desc;
}

/**
 * 根据当前鼠标悬浮的位置获取提示信息
 * @param actNode 当前激活的node信息
 */
function GetHintDescByActiveNode(actNode: ActiveNode): vscode.ProviderResult<vscode.Hover> {
    const codeHint = CodeHints.NodeCodeHintSource.find(item => XmlPathUtil.EqualPath(item.NodePath, actNode.Path));
    if (codeHint === undefined) {
        return null;
    }

    if (actNode.cursorPosition === CursorPosition.Content) {
        if (codeHint.ContentHint !== null && codeHint.ContentHint.desc !== '') {
            return new vscode.Hover(GetMouseHoverDescByCodeHint(codeHint.ContentHint, actNode.node.content));
        }
        return null;
    }

    if (actNode.activeAttributeNameToken === null) {
        return new vscode.Hover(codeHint.Desc);
    } else {
        const attributes = GetNewAttributesByActiveNodeForHint(actNode, codeHint);
        const attrName = actNode.activeAttributeNameToken.value;
        const attrCodeHint = attributes[attrName];
        if (attrCodeHint === undefined) {
            return null;
        }

        if (actNode.activeAttributeValueToken !== null) {
            return new vscode.Hover(GetMouseHoverDescByCodeHint(attrCodeHint, actNode.activeAttributeValueToken.value));
        }

        return new vscode.Hover(attrCodeHint.desc);
    }
}

async function ParseNodeLinkToUri(codeHint: CodeHint, linkValue:string): Promise<vscode.Uri[]>{
    const uriList:vscode.Uri[] = [];
    if (codeHint.linkByCollection.length === 0) {
        return uriList;
    }

    let matchedValue = linkValue.trim();
    const linkBy = codeHint.linkByCollection.find(linkByItem => {
        if (linkByItem.linkByValuePattern === null) {
            return true;
        }
        const linkByValueRegex = new RegExp(linkByItem.linkByValuePattern);
        const matchRes = linkValue.match(linkByValueRegex);
        if (matchRes !== null) {
            matchedValue = matchRes[matchRes.length - 1];
            return true;
        }
    })?.linkBy;

    if (!linkBy) {
        return uriList;
    }

    const rootUri = CommonUtils.GetWorkspaceRootUri();
    if (!rootUri) {
        return uriList;
    }

    if (linkBy.startsWith('Computer.')) {
        return CommonUtils.filterObjectByExpression(hacknetNodeHolder.GetComputers(), linkBy, matchedValue)
            .map(comp => vscode.Uri.joinPath(rootUri, comp['__RelativePath__']));
    }

    if (linkBy.startsWith('Mission.')) {
        return CommonUtils.filterObjectByExpression(hacknetNodeHolder.GetMissions(), linkBy, matchedValue)
            .map(mission => vscode.Uri.joinPath(rootUri, mission['__RelativePath__']));
    }

    if (linkBy.startsWith('Action.')) {
        return CommonUtils.filterObjectByExpression(hacknetNodeHolder.GetActions(), linkBy, matchedValue)
            .map(action => vscode.Uri.joinPath(rootUri, action['__RelativePath__']));
    }

    if (linkBy.startsWith('Theme.')) {
        return CommonUtils.filterObjectByExpression(hacknetNodeHolder.GetThemes(), linkBy, matchedValue)
            .map(theme => vscode.Uri.joinPath(rootUri, theme['__RelativePath__']));
    }

    if (linkBy.startsWith('Faction.')) {
        return CommonUtils.filterObjectByExpression(hacknetNodeHolder.GetFactions(), linkBy, matchedValue)
            .map(faction => vscode.Uri.joinPath(rootUri, faction['__RelativePath__']));
    }

    if (linkBy === "path") {
        try {
            const uri = vscode.Uri.joinPath(rootUri, matchedValue);
            // 测试文件是否存在
            await vscode.workspace.fs.stat(uri);
            uriList.push(uri);
        } catch (error) {
            console.error('hint:path link跳转出错:' + error);
        }
    }

    return uriList;
}

/**
 * 根据当前激活节点的属性值进行跳转
 * @returns 链接数组
 */
async function ParseAttrValueLinkByToGetDefinitionLink(actNode: ActiveNode, nodeHint: NodeCodeHints, document: vscode.TextDocument): Promise<vscode.LocationLink[] | null | undefined> {
    if (actNode.activeAttributeNameToken === null || actNode.activeAttributeValueToken === null) {
        return;
    }

    const attributes = GetNewAttributesByActiveNodeForHint(actNode, nodeHint);
    const attrName = actNode.activeAttributeNameToken.value;
    const attrCodeHint = attributes[attrName];
    if (!attrCodeHint) {
        return;
    }
    
    const originSelectionRange = new vscode.Range(
        document.positionAt(actNode.activeAttributeValueToken.offset + 1), 
        document.positionAt(actNode.activeAttributeValueToken.offset + 1 + actNode.activeAttributeValueToken.value.length)
    );

    const attrValue = actNode.activeAttributeValueToken.value;

    const uriList = await ParseNodeLinkToUri(attrCodeHint, attrValue);
    return uriList.map(uri => {
        return {
            originSelectionRange,
            targetUri: uri,
            targetRange: new vscode.Range(0, 0, 0, 0)
        };
    });
}

/**
 * 根据当前激活节点的内容进行跳转
 * @returns 链接数组
 */
async function ParseContentLinkByToGetDefinitionLink(actNode: ActiveNode, nodeHint: NodeCodeHints, document: vscode.TextDocument): Promise<vscode.LocationLink[] | null | undefined> {
    if (actNode.cursorPosition !== CursorPosition.Content) {
        return;
    }

    if (actNode.node.contentToken === null || actNode.node.content.length === 0) {
        return;
    }

    const contentHint = nodeHint.ContentHint;
    if (contentHint === null) {
        return;
    }
    
    const originSelectionRange = new vscode.Range(
        document.positionAt(actNode.node.contentToken.offset), 
        document.positionAt(actNode.node.contentToken.offset + actNode.node.content.length)
    );

    const uriList = await ParseNodeLinkToUri(contentHint, actNode.node.content);
    return uriList.map(uri => {
        return {
            originSelectionRange,
            targetUri: uri,
            targetRange: new vscode.Range(0, 0, 0, 0)
        };
    });
}

/**
 * 根据当前鼠标悬浮的位置在按下ctrl+鼠标左键时链接到目标文件
 * @param actNode 当前激活的node信息
 */
function GetLocationLinkByActiveNode(actNode: ActiveNode, document: vscode.TextDocument): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const codeHint = CodeHints.NodeCodeHintSource.find(item => XmlPathUtil.EqualPath(item.NodePath, actNode.Path));
    if (codeHint === undefined) {
        return;
    }
    // console.log('linkNode', actNode, codeHint);
    if (actNode.cursorPosition === CursorPosition.Content) {
        return ParseContentLinkByToGetDefinitionLink(actNode, codeHint, document);
    }

    return ParseAttrValueLinkByToGetDefinitionLink(actNode, codeHint, document);
}

/**
 * 监听配置文件改变
 */
function WatchConfigFileChange(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('hacknetextensionhelperconfig.hintFile.autoRefresh'))
        {
            const config = vscode.workspace.getConfiguration('hacknetextensionhelperconfig.hintFile');
            const autoRefrehHintFile = config.get<boolean>('autoRefresh');
            DisposeAllHintFileWatcher();
            if (autoRefrehHintFile) {
                // 重新添加根提示文件监控
                WatchHacknetCodeHintFile(context);
                // 解析提示文件内容
                GetCodeHintFromHacknetCodeHintFile();
            }
        }
    }));
}

export function RegisterHacknetXmlCodeHint(context: vscode.ExtensionContext) {
    const xmlParser = new XmlParser();

    // 监听配置文件改变
    WatchConfigFileChange(context);

    // 获取提示信息
    GetCodeHintFromHacknetCodeHintFile();

    // 监听根提示文件变动
	WatchHacknetCodeHintFile(context);

    // 注册xml文档提供器
    const xmlProvider = vscode.languages.registerCompletionItemProvider('xml', {
        provideCompletionItems: async function (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionList<vscode.CompletionItem> | vscode.CompletionItem[] | null> {
            const actNode = xmlParser.parseActiveNode(document.getText(), {
                needToken: true,
                activeOffset: document.offsetAt(position)
            });

            // console.log("xmlDoc========================");
            // console.log(actNode);

            const tipItems = await GetCoedHintByActiveNode(actNode, document.uri);
            if (!tipItems || tipItems.length === 0) {
                return null;
            }

            return tipItems;
        }
    }, ' ');
    context.subscriptions.push(xmlProvider);

    // 注册悬停提供器
    context.subscriptions.push(vscode.languages.registerHoverProvider('xml', {
        provideHover(document, position, token) {
            
            const actNode = GetActiveNodeInMouseHover(document.getText(), document.offsetAt(position));
            // console.log("xmlHover========================");
            // console.log(actNode);

            if (actNode === null) {
                return null;
            }

            return GetHintDescByActiveNode(actNode);
        }
    }));

    // 替换文本即#xxx#的文档提供器
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(['xml', 'plaintext'], {
        provideCompletionItems: function (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem> | vscode.CompletionItem[]> {
            const text = document.getText();
            const curOffset = document.offsetAt(position);
            if (curOffset === 0 || (curOffset > 0 && text[curOffset - 1] !== '#')) {
                return null;
            }
            
            const tipItems = CodeHints.ReplaceTextSource.map((item, idx) => {
                const completionItem = new vscode.CompletionItem(item.value);
                completionItem.detail = item.desc;
                completionItem.insertText = item.value.substring(1);
                completionItem.sortText = (idx + 300).toString().padStart(3, '0');
                completionItem.kind = vscode.CompletionItemKind.Text;

                return completionItem;
            });

            if (tipItems.length === 0) {
                return null;
            }

            return tipItems;
        }
    }, '#'));

    // 注册xml文档链接器
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(['xml'], {
            provideDefinition: function (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
                const actNode = GetActiveNodeInMouseHover(document.getText(), document.offsetAt(position));
                if (actNode === null) {
                    return;
                }

                return GetLocationLinkByActiveNode(actNode, document);
            }
        })
    );

    // 注册HackerScript脚本提供器
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('plaintext', {
            provideCompletionItems: function (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem> | vscode.CompletionItem[]> {
                const hackerScriptsHint = CodeHints.HackerScriptSource;
                const rootUri = CommonUtils.GetWorkspaceRootUri();
                if (!rootUri) {
                    return;
                }

                const replativeDocumentFilePath = path.relative(rootUri.fsPath, document.uri.fsPath);
                if (!minimatch(replativeDocumentFilePath, hackerScriptsHint.fileTriggerPattern)) {
                    return;
                }

                if (position.character !== 0 && document.getText(new vscode.Range(position.line, 0, position.line, position.character)).match(/^\s+$/) === null) {
                    return;
                }

                return hackerScriptsHint.codeHintItems.map((item, idx) => {
                    const completionItem = new vscode.CompletionItem(item.label ?? item.value);
                    completionItem.detail = item.desc;
                    completionItem.documentation = item.document;
                    completionItem.insertText = new vscode.SnippetString(item.value);
                    completionItem.sortText = (idx).toString().padStart(3, '0');
                    completionItem.kind = vscode.CompletionItemKind.Function;

                    return completionItem;
                });
            }
        },' ')
    );

    // 注册重新读取提示文件内容命令
    context.subscriptions.push(vscode.commands.registerCommand('hacknetextensionhelper.refreshHintFile', _ => {
        GetCodeHintFromHacknetCodeHintFile();
    }));
}