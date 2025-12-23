import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import {ActiveNode, Node, XmlParser} from '../parser/XmlParser';
import { AttributeHint, CodeHint, CodeHintItem, HintType, NodeCodeHints } from "../code-hint/CodeHintDefine";
import { ComputerInfo, HacknetNodeInfo, HacknetNodeType, HacknetXmlNodeMap } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import XmlPathUtil from "../utils/XmlPathUtil";

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export enum DiagnosticWorkerMsgType {
    DiagnosticReq,
    DiagnosticResp,
    QueryRelativeFileReq
}

export interface DiagnosticWorkerMsg {
    type: DiagnosticWorkerMsgType,
    data: any
}

export interface DiagnosticRequest {
    filepath: string
    nodeHints: NodeCodeHints[]
    nodeHolder: NodeHolder
}

export interface NodeHolder {
    NodeMap: HacknetXmlNodeMap,
    FilePathSymbol: string
    RelativePathSymbol: string
    NodeTypeSymbol: string
    GetComputers: () => ComputerInfo[],
    GetMissions: () => HacknetNodeInfo[]
    GetActions: () => HacknetNodeInfo[]
    GetThemes: () => HacknetNodeInfo[]
    GetFactions: () => HacknetNodeInfo[]
    GetPeoples: () => HacknetNodeInfo[]
}


export interface DiagnosticResult {
    filepath: string
    result: Diagnostic[]
}

export enum DiagnosticType { 
    Error = 0,
	Warning = 1,
	Information = 2,
	Hint = 3
}

export interface Range {
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number
}

export interface Diagnostic {
    range: Range,
    message: string,
    type: DiagnosticType
    source?: string
}

enum CheckType {
    Text,   // 整段文本匹配
    Prefix,  // 前缀匹配
    Regex, // 正则匹配
    Func, // 函数匹配
}

interface CheckItem {
    values: string[],
    diagMsg: string,
    type: CheckType,
    checkFunc?: (checkVal: string) => boolean
}

export interface UniqueMsg {
    id?: number
}

export interface QueryRelativeFileReq extends UniqueMsg {
    queryStr: string
    queryFolder: boolean
}

export interface QueryRelativeFileResp extends UniqueMsg{
    result: string[]
}

class UniqueMsgSender {

    private static id: number = 0;
    private msgMap: Map<number, (resp: UniqueMsg) => void> = new Map();

    constructor() {
        // 唯一消息的返回按ID匹配无需遵循DiagnosticWorkerMsg格式
        parentPort?.on('message', resp => {
            if (!('id' in resp)) {
                return;
            }
            const msgId = resp.id;
            const resolveFunc = this.msgMap.get(msgId);
            if (resolveFunc) {
                this.msgMap.delete(msgId);
                resolveFunc(resp);
            }
        });
    }

    public Send(msg: UniqueMsg, type:DiagnosticWorkerMsgType):Promise<UniqueMsg> {
        msg.id = UniqueMsgSender.id++;
        const promise = new Promise<UniqueMsg>((resolve) => {
            this.msgMap.set(msg.id!, resolve);
        });
        SendMessage({
            type,
            data: msg
        });
        return promise;
    }
}
const uniqueMsgSender = new UniqueMsgSender();

console.log('StartDiagnostic Worker 启动成功======================');

// 发送消息
function SendMessage(msg: DiagnosticWorkerMsg) {
    try {
        // console.log('发送消息', msg.type);
        parentPort?.postMessage(msg);
    } catch (error) {
        console.error('消息发送失败:', error);
    }
}

// 监听解析消息
parentPort?.on('message', (req:DiagnosticWorkerMsg) => {
    switch (req.type) {
        case DiagnosticWorkerMsgType.DiagnosticReq: 
            StartDiagnosticFile(req.data);
            break;
    }

});

async function StartDiagnosticFile(req:DiagnosticRequest) {
    if (!req.filepath.toLocaleLowerCase().endsWith('.xml')) {
        return;
    }
    
    const xmlParser = new XmlParser();
    let diagnosticArray:Diagnostic[] = [];

    try {
        const node = xmlParser.parse(fs.readFileSync(req.filepath, 'utf-8'), {needToken: true});
        if (node === null) {
            return;
        }

        // 不诊断编辑器提示文件
        if (node.name === 'HacknetEditorHint') {
            return;
        }
        
        AttachFuncToNodeHolder(req);
        const res = await ParseNodeForDiagnostic(node, req);
        if (res && res.length > 0) {
            diagnosticArray = res;
        }

    } catch (error) {
        // ignore
        console.error(error);
    }

    const result:DiagnosticResult = {
        filepath: req.filepath,
        result: diagnosticArray
    };

    SendMessage({
        type: DiagnosticWorkerMsgType.DiagnosticResp,
        data: result
    });
}

function BuildDiagnostic(startLine:number, startCharacter:number, endLine:number, endCharacter:number, message:string, type:DiagnosticType) {
    return {
        range: {
            // mooToken的Line从1开始
            startLine: startLine - 1,
            startCharacter: startCharacter - 1,
            endLine: endLine - 1,
            endCharacter: endCharacter - 1
        },
        message,
        type
    };
}

// 诊断一个node节点
async function ParseNodeForDiagnostic(node:Node, req:DiagnosticRequest):Promise<Diagnostic[]> {
    const diagnosticArray:Diagnostic[] = [];
    const nodeHints = req.nodeHints;
    const matchArr = nodeHints.filter(item => XmlPathUtil.EqualPath(item.NodePath, node.nodePath));
    if (matchArr.length <= 0) {
        if (node.nameToken === null) {
            return [];
        }
        return [BuildDiagnostic(node.nameToken.line, node.nameToken.col, node.nameToken.line, node.nameToken.col + node.name.length, '未知作用的标签', DiagnosticType.Hint)];
    }

    const nodeHint = matchArr[0];

    // 验证Content
    diagnosticArray.push(...(await DiagnosticNodeContent(node, nodeHint, req)));

    // 验证Attribute
    diagnosticArray.push(...(await DiagnosticNodeAttribute(node, nodeHint, req)));

    // 递归诊断子项
    for (const childNode of node.children) {
        diagnosticArray.push(...(await ParseNodeForDiagnostic(childNode, req)));
    }  

    return diagnosticArray;
}

// 诊断属性
async function DiagnosticNodeAttribute(node: Node, hint: NodeCodeHints, req: DiagnosticRequest): Promise<Diagnostic[]> { 
    const diagArr: Diagnostic[] = [];

    const newAttrNodeHint:AttributeHint = {};
    // 复制一份老的，不需要全部深拷贝
    for (const attrName in hint.AttributeNodeHint) {
        newAttrNodeHint[attrName] = hint.AttributeNodeHint[attrName];
    }

    // 进行condition判断
    hint.ConditionAttributeHints.forEach(conditionAttr => {
        const attrValue = node.attribute.get(conditionAttr.attrName);
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

    for (const attrName of node.attribute.keys()) {
        // 诊断未出现的属性
        if (!(attrName in newAttrNodeHint)) {
            const attrToken = node.attributeNameToken.get(attrName)!;
            diagArr.push(
                BuildDiagnostic(attrToken.line, attrToken.col, attrToken.line, attrToken.col + attrToken.text.length, '未知作用的属性', DiagnosticType.Hint)
            );
        } else {
            // 诊断已经存在的属性值的正确性
            const attrCodeHint = newAttrNodeHint[attrName];
            const attrValue = node.attribute.get(attrName)!;
            const attrValueToken = node.attributeValueToken.get(attrName)!;
            if (attrCodeHint.diag === undefined) {
                continue;
            }

            const items = await DiagnosticByCodeHint(node, attrValue.trim(), attrCodeHint, req);
            diagArr.push(
                ...items.map(item => {
                    item.range = {
                        startLine: attrValueToken.line - 1,
                        startCharacter: attrValueToken.col - 1,
                        endLine: attrValueToken.line - 1,
                        endCharacter: attrValueToken.col - 1 + attrValueToken.text.length,
                    };
                    return item as Diagnostic;
                })
            );
        }
    }

    return diagArr;
}

// 诊断内容
async function DiagnosticNodeContent(node:Node, hint:NodeCodeHints, req:DiagnosticRequest):Promise<Diagnostic[]> {
    if (!hint.ContentHint || hint.ContentHint.diag === undefined || !node.contentToken) {
        return [];
    }

    // 处理一些特殊情况
    if (node.nodePath === 'mission.nextMission' && node.content.trim().toLowerCase() === 'none') {
        return [];
    }
    
    const items = await DiagnosticByCodeHint(node, node.content.trim(), hint.ContentHint, req);

    return items.map(item => {
        item.range = {
            startLine: node.contentToken!.line - 1,
            startCharacter: node.contentToken!.col - 1,
            endLine: node.contentToken!.line - 1,
            endCharacter: node.contentToken!.col - 1 + node.content.length,
        };
        return item as Diagnostic;
    });
}

// 开始根据定义诊断
async function DiagnosticByCodeHint(node:Node, checkVal:string, codeHint:CodeHint, req:DiagnosticRequest):Promise<PartialBy<Diagnostic, 'range'>[]> {
    const checkItem = await GetHintItems(node, codeHint, req);
    if (checkItem === null) {
        return [];
    }

    // 文本全匹配
    if (checkItem.type === CheckType.Text) {
        if (!checkItem.values.includes(checkVal)) {
            return [{
                message: checkItem.diagMsg,
                type: codeHint.diag! as any
            }];
        }
    }

    // 前缀匹配
    if (checkItem.type === CheckType.Prefix) {
        if (checkItem.values.every(val => !checkVal.startsWith(val))) {
            return [{
                message: checkItem.diagMsg,
                type: codeHint.diag! as any
            }];
        }
    }

    // 正则匹配
    if (checkItem.type === CheckType.Regex) {
        if (checkItem.values.every(val => checkVal.match(val) === null)) {
            return [{
                message: checkItem.diagMsg,
                type: codeHint.diag! as any
            }];
        }
    }

    // 函数匹配
    if (checkItem.type === CheckType.Func && !checkItem.checkFunc!(checkVal)) {
        return [{
            message: checkItem.diagMsg,
            type: codeHint.diag! as any
        }];
    }

    return [];
}


// 获取提示信息
async function GetHintItems(node: Node, codeHint: CodeHint, req:DiagnosticRequest): Promise<CheckItem | null> {
    // 枚举
    if (codeHint.type === HintType.Enum) {
        const values = codeHint.items.map(item => item.value);
        return {
            values,
            diagMsg: `错误的值,应为：[${values.join(',')}]之一`,
            type: CheckType.Text
        };
    }

    // 计算机ID
    if (codeHint.type === HintType.Computer) {
        return {
            values: GetAllComputerId(req),
            diagMsg: `未在当前工作空间中找到该计算机`,
            type: CheckType.Text
        };
    }

    // 执行JS
    if (codeHint.type === HintType.JavaScript) {
        return {
            values: ExecJsFuncToGetCodeHintItems(node, codeHint, req),
            diagMsg: `当前值不在计算结果中，可能不正确`,
            type: CheckType.Text
        };
    }

    // 计算机ID或EosID
    if (codeHint.type === HintType.ComputerOrEos) {
        return {
            values: GetAllComputerAndEosId(req),
            diagMsg: `未在当前工作空间中找到该计算机或eos设备`,
            type: CheckType.Text
        };
    }

    // Action文件
    if (codeHint.type === HintType.ActionFile) {
        return {
            values: req.nodeHolder.GetActions().map(item => item['__RelativePath__'] ?? ''),
            diagMsg: `未在当前工作空间中找到该Action文件路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // Theme文件
    if (codeHint.type === HintType.ThemeFile) {
        return {
            values: req.nodeHolder.GetThemes().map(item => item['__RelativePath__'] ?? ''),
            diagMsg: `未在当前工作空间中找到该Theme文件路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // Misison文件
    if (codeHint.type === HintType.MisisonFile) {
        return {
            values: req.nodeHolder.GetMissions().map(item => item['__RelativePath__'] ?? ''),
            diagMsg: `未在当前工作空间中找到该Misison文件路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // Faction文件
    if (codeHint.type === HintType.FactionFile) {
        return {
            values: req.nodeHolder.GetFactions().map(item => item['__RelativePath__'] ?? ''),
            diagMsg: `未在当前工作空间中找到该Faction文件路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // People文件
    if (codeHint.type === HintType.PeopleFile) {
        return {
            values: req.nodeHolder.GetPeoples().map(item => item['__RelativePath__'] ?? ''),
            diagMsg: `未在当前工作空间中找到该Person文件路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // Color
    if (codeHint.type === HintType.Color) {
        return {
            values: [],
            diagMsg: `当前颜色的格式不正确`,
            type: CheckType.Func,
            checkFunc: (val:string) => {
                return val.match(/^\s*\d+(?:\s*\,\s*\d+){2,3}$/) !== null;
            }
        };
    }

    // 路径
    if (codeHint.type === HintType.Path || codeHint.type === HintType.Folder) {
        const req:QueryRelativeFileReq = {
            queryStr: codeHint.content,
            queryFolder: codeHint.type === HintType.Folder
        };
        const resp = await QueryAllRelativeFile(req);
        return {
            values: resp.result,
            diagMsg: `未在当前工作空间中找到该路径`,
            type: CheckType.Func,
            checkFunc: function(val:string) {
                return (this as any).values.includes(val.replaceAll('\\', '/'));
            }
        };
    }

    // 分步匹配
    if (codeHint.type === HintType.Step) {
        const values = codeHint.items.map(item => item.value);
        return {
            values,
            diagMsg: `错误的值,应为：[${values.join(',')}]之一`,
            type: CheckType.Prefix
        };
    }

    return null;
}

// 查询文件路径
async function QueryAllRelativeFile(req:QueryRelativeFileReq):Promise<QueryRelativeFileResp> {
    // console.log("查询文件路径");
    const res = await uniqueMsgSender.Send(req, DiagnosticWorkerMsgType.QueryRelativeFileReq);
    // console.log("结果:", res);
    return res as QueryRelativeFileResp;
}

function GetAllComputerId(req:DiagnosticRequest) : string[] {
    const computerId = [];
    for (const node of req.nodeHolder.NodeMap[HacknetNodeType.Computer].values()) {
        if (node.Computer.id !== undefined) {
            computerId.push(node.Computer.id);
        }
    }
    return computerId;
}

/**
 * 执行JS代码获取属性值提示信息
 */
function ExecJsFuncToGetCodeHintItems(node: Node, codeHint: CodeHint, req:DiagnosticRequest): string[] {
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
    const res = eval(codeHint.content)(new ActiveNode(node), req.nodeHolder);
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

    return codeHintArr.map(item => item.value);
}

function GetAllComputerAndEosId(req:DiagnosticRequest) : string[] { 
    const computerId = [];
    for (const node of req.nodeHolder.NodeMap[HacknetNodeType.Computer].values()) {
        if (node.Computer.id !== undefined) {
            computerId.push(node.Computer.id);
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
            computerId.push(eos.id);
        });
    }
    return computerId;
}

function AttachFuncToNodeHolder(req:DiagnosticRequest) { 
    const nodeHolder = req.nodeHolder;
    const attachNodeFunc = (rootNode:any, realNode:any) => {
        realNode[req.nodeHolder.FilePathSymbol] = rootNode[req.nodeHolder.FilePathSymbol];
        realNode[req.nodeHolder.RelativePathSymbol] = rootNode[req.nodeHolder.RelativePathSymbol];
    };

    nodeHolder.GetComputers = () => {
        const computerNodes = req.nodeHolder.NodeMap[HacknetNodeType.Computer];
        const res:ComputerInfo[] = [];
        computerNodes.forEach(node => {
            if (node.Computer.id !== undefined) {
                attachNodeFunc(node, node.Computer);
                res.push(node.Computer);
            }
        });

        return res;
    };

    nodeHolder.GetMissions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Mission];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.mission);
            res.push(node.mission);
        });

        return res;
    };

    nodeHolder.GetActions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Action];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.ConditionalActions);
            res.push(node.ConditionalActions);
        });

        return res;
    };

    nodeHolder.GetThemes = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Theme];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.CustomTheme);
            res.push(node.CustomTheme);
        });

        return res;
    };

    nodeHolder.GetFactions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Faction];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.CustomFaction);
            res.push(node.CustomFaction);
        });

        return res;
    };

    nodeHolder.GetPeoples = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.People];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.Person);
            res.push(node.Person);
        });

        return res;
    };
}
