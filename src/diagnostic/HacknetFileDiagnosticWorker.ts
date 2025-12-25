import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import {ActiveNode, Node, XmlParser} from '../parser/XmlParser';
import { AttributeHint, CodeHint, CodeHintItem, HintType, NodeCodeHints } from "../code-hint/CodeHintDefine";
import { ComputerInfo, HacknetNodeInfo, HacknetNodeType, HacknetXmlNodeMap } from "../worker/GlobalHacknetXmlNodeHolderDefine";
import XmlPathUtil from "../utils/XmlPathUtil";
import path from 'path';

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface DiagnosticWorkerDataType {
    workspacePath: string
}

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
    filepath: string | string[]
    scanDepedencyFile: boolean
    resetDepedencyTable: boolean
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

interface DiagnosticItem {
    diagnosticArr: PartialBy<Diagnostic, 'range'>[]
    depdendencyPath: string[]
}

interface DepdendencyInfo {
    [identifier: string]: string[] // 资源定位符： 依赖路径数组[]
}

interface DiagnosticAndDependency {
    diagnosticArr: Diagnostic[]
    depdendencyInfo: DepdendencyInfo
}

enum CheckType {
    Text,   // 整段文本匹配
    Prefix,  // 前缀匹配
    Regex, // 正则匹配
    Func, // 函数匹配
}

interface CheckItem {
    checkFunc: (checkVal: string) => {validate: boolean, diagMsg: string, depdendencyPath: string[]}
}

interface PathItem<K> {
    path: string,
    item: K
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

interface NodeHolderHookType {
    hookFunc: (nodeType:HacknetNodeType) => void
}

class NodeHolderHook {

    public static hookList:NodeHolderHookType[] = [];

    private constructor(){}

    public static TriggerHook(nodeType:HacknetNodeType) {
        this.hookList.forEach(hook => hook.hookFunc(nodeType));
    }

    public static AddHook(hook:NodeHolderHookType) {
        this.hookList.push(hook);
    }

    public static RemoveHook(hook:NodeHolderHookType) {
        this.hookList = this.hookList.filter(item => item !== hook);
    }
}

// 父进程传递的数据
const DiagnosticWorkerData = workerData as DiagnosticWorkerDataType;

// 消息发送器，与父进程传递消息
const uniqueMsgSender = new UniqueMsgSender();

// 依赖的文件类型
const DependencyFileType = {
    AllFile: '*',
    ComputerFile: '|COMP|',
    MissionFile: '|MIS|',
    ActionFile: '|ACT|',
    ThemeFile: '|THM|',
    FactionFile: '|FAC|',
    PeopleFile: '|PEO|'
} as const;

// 维护hn的xml文件的相互依赖关系: (文件路径、DependencyFileType) -> 引用到该文件的所有资源标识符（xx.xml|computer.mial->file）
const HacknetFileRelationMap = new Map<string, Set<string>>();

console.log('StartDiagnostic Worker 启动成功======================', DiagnosticWorkerData);

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

// 启动扫描
async function StartDiagnosticFile(req:DiagnosticRequest) {
    const filepathArr:string[] = [];
    if (Array.isArray(req.filepath)) {
        filepathArr.push(...req.filepath);
    } else {
        filepathArr.push(req.filepath);
    }

    if (req.resetDepedencyTable) {
        HacknetFileRelationMap.clear();
    }

    for (const filepath of filepathArr) {
        // console.log('创建扫描任务', filepath);
        const diagnosticArray = await ScanFileFromDiagnostic(filepath, req, req.scanDepedencyFile);

        diagnosticArray.forEach(diagnostic => {
            SendMessage({
                type: DiagnosticWorkerMsgType.DiagnosticResp,
                data: diagnostic
            });
        });
    }
}

// 扫描文件诊断
async function ScanFileFromDiagnostic(filepath:string, req:DiagnosticRequest, scanDepy:boolean):Promise<DiagnosticResult[]> {
    let diagnosticResult:DiagnosticResult[] = [];

    AttachFuncToNodeHolder(req);
    
    let depdendencyInfo: DepdendencyInfo = {};
    if (filepath.toLocaleLowerCase().endsWith('.xml')) {
        try {
            const resultItem:DiagnosticResult = {
                filepath,
                result: []
            };
            const xmlParser = new XmlParser();
            const node = xmlParser.parse(fs.readFileSync(filepath, 'utf-8'), {needToken: true});
            if (node === null) {
                return diagnosticResult;
            }

            // 不诊断编辑器提示文件
            if (node.name === 'HacknetEditorHint') {
                return diagnosticResult;
            }

            // 进行node诊断
            const res = await ParseNodeForDiagnostic(node, req);
            depdendencyInfo = res.depdendencyInfo;
            resultItem.result.push(...res.diagnosticArr);

            diagnosticResult.push(resultItem);
        } catch (error) {
            do {
                if (error instanceof Error && error.message.includes('no such file or directory')) {
                    break;
                }
                console.error('诊断xml错误', error);
            } while (false);
        }
    }

    // 添加其他依赖本文件的诊断
    if (scanDepy) {
        // console.log('开始扫描依赖:', filepath);
        for (const depyPath of GetDependencyFilePath(filepath, req)) {
            // console.log('扫描依赖子项:', depyPath);
            diagnosticResult.push(...(await ScanFileFromDiagnostic(depyPath, req, false)));
        }
    }

    // 构建文件依赖表
    BuildHacknetFileRelationMap(filepath, depdendencyInfo);

    return diagnosticResult;
}

// 获取当前文件变动后哪些文件依赖了该文件
function GetDependencyFilePath(filepath: string, req:DiagnosticRequest,):Iterable<string> {
    const depResourceArray = [...(HacknetFileRelationMap.get(filepath) ?? []), ...(HacknetFileRelationMap.get(DependencyFileType.AllFile) ?? [])];

    const fileNodeType = GetFileNodeType(filepath, req);

    if (fileNodeType !== null) {
        const depFileType = GetDependencyFileType(fileNodeType);
        depResourceArray.push(...(HacknetFileRelationMap.get(depFileType) ?? []));
    }

    return new Set<string>(depResourceArray.map(resourceIdentifier => resourceIdentifier.split('|')[0]));
}

// 构建hacknet文件管理引用表
function BuildHacknetFileRelationMap(filepath: string, dependencies: DepdendencyInfo) {

    // 获取依赖路径的绝对路径
    const getAbsolutePath = (depyPath: string) => {
        const specFilepath = Object.values(DependencyFileType) as string[];
        if (specFilepath.includes(depyPath)) {
            return depyPath;
        }

        return path.resolve(DiagnosticWorkerData.workspacePath, depyPath);
    };

    for (const identifier in dependencies) {
        const dependencyPathArray = dependencies[identifier];
        const resourceIdentifier = `${filepath}|${identifier}`;

        // 移除所有的旧资源依赖
        HacknetFileRelationMap.forEach(resourceSet => {
            resourceSet.delete(resourceIdentifier);
        });

        // 添加新资源依赖
        for (const depyPath of dependencyPathArray) {
            const absPath = getAbsolutePath(depyPath);

            let depResourceSet = HacknetFileRelationMap.get(absPath);
            if (depResourceSet === undefined) {
                depResourceSet = new Set<string>();
                HacknetFileRelationMap.set(absPath, depResourceSet);
            }
            depResourceSet.add(resourceIdentifier);
        }
    }
}

function BuildDiagnostic(startLine:number, startCharacter:number, endLine:number, endCharacter:number, message:string, type:DiagnosticType):Diagnostic {
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

function CombineDiagnosticAndDependency(source:DiagnosticAndDependency, other:DiagnosticAndDependency) {
    for (const identifier in other.depdendencyInfo) {
        if (identifier in source.depdendencyInfo) {
            source.depdendencyInfo[identifier].push(...other.depdendencyInfo[identifier]);
        } else {
            source.depdendencyInfo[identifier] = other.depdendencyInfo[identifier];
        }
    }
    source.diagnosticArr.push(...other.diagnosticArr);
    return source;
}

// 诊断一个node节点
async function ParseNodeForDiagnostic(node:Node, req:DiagnosticRequest):Promise<DiagnosticAndDependency> {
    const result:DiagnosticAndDependency = {
        diagnosticArr: [],
        depdendencyInfo: {}
    };

    const nodeHints = req.nodeHints;
    const matchArr = nodeHints.filter(item => XmlPathUtil.EqualPath(item.NodePath, node.nodePath));
    if (matchArr.length <= 0) {
        if (node.nameToken === null) {
            return result;
        }
        result.diagnosticArr.push(
            BuildDiagnostic(node.nameToken.line, node.nameToken.col, node.nameToken.line, node.nameToken.col + node.name.length, '未知作用的标签', DiagnosticType.Hint)
        );
        return result;
    }

    const nodeHint = matchArr[0];

    // 验证Content
    CombineDiagnosticAndDependency(result, (await DiagnosticNodeContent(node, nodeHint, req)));

    // 验证Attribute
    CombineDiagnosticAndDependency(result, (await DiagnosticNodeAttribute(node, nodeHint, req)));

    // 递归诊断子项
    for (const childNode of node.children) {
        CombineDiagnosticAndDependency(result, (await ParseNodeForDiagnostic(childNode, req)));
    }  

    return result;
}

// 诊断属性
async function DiagnosticNodeAttribute(node: Node, hint: NodeCodeHints, req: DiagnosticRequest): Promise<DiagnosticAndDependency> { 
    const result:DiagnosticAndDependency = {
        diagnosticArr: [],
        depdendencyInfo: {}
    };

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
            result.diagnosticArr.push(
                BuildDiagnostic(attrToken.line, attrToken.col, attrToken.line, attrToken.col + attrToken.text.length, '未知作用的属性', DiagnosticType.Hint)
            );
        } else {
            // 诊断特殊属性
            const specRes = HandleSpecialAttribute(node, attrName, req);
            const attrCodeHint = newAttrNodeHint[attrName];
            const attrValue = node.attribute.get(attrName)!;
            const attrValueToken = node.attributeValueToken.get(attrName)!;
            const identifier = `${node.nodePath}>${attrName}`;

            if (specRes !== null) {
                result.depdendencyInfo[identifier] = specRes.depdendencyPath;
                result.diagnosticArr.push(...specRes.diagnosticArr.map(item => {
                    item.range = {
                        startLine: attrValueToken.line - 1,
                        startCharacter: attrValueToken.col - 1,
                        endLine: attrValueToken.line - 1,
                        endCharacter: attrValueToken.col - 1 + attrValueToken.text.length,
                    };
                    return item as Diagnostic;
                }));
                continue;
            }
            
            // 诊断已经存在的属性值的正确性
            if (attrCodeHint.diag === undefined) {
                continue;
            }
            const items = await DiagnosticByCodeHint(node, attrValue.trim(), attrCodeHint, req);
            
            result.depdendencyInfo[identifier] = items.depdendencyPath;
            result.diagnosticArr.push(
                ...items.diagnosticArr.map(item => {
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

    return result;
}

// 处理特殊属性
function HandleSpecialAttribute(node: Node, attrName:string, req: DiagnosticRequest): DiagnosticItem | null {
    if (!node.attribute.has(attrName)) {
        return null;
    }

    const result:DiagnosticItem = {
        diagnosticArr: [],
        depdendencyPath: []
    };
    const attrValue = node.attribute.get(attrName)!;

    // 检查计算机ID是否重复
    if (node.nodePath === 'Computer' && attrName === 'id') {
        const ids = GetAllComputerAndEosId(req);
        const idArr = ids.filter(item => item.item === attrValue);
        if (idArr && idArr.length > 1) {
            result.diagnosticArr.push({
                message: '计算机id重复',
                type: DiagnosticType.Error
            });
            result.depdendencyPath.push(DependencyFileType.ComputerFile);
        }

        return result;
    }

    // 检查计算机IP是否重复
    if (node.nodePath === 'Computer' && attrName === 'ip') {
        const ips = req.nodeHolder.GetComputers().filter(item => item.ip).map(item => item.ip);
        const repeatIpArr = ips.filter(item => item === attrValue);
        if (repeatIpArr && repeatIpArr.length > 1) {
            result.diagnosticArr.push({
                message: '计算机ip重复',
                type: DiagnosticType.Warning
            });
            result.depdendencyPath.push(DependencyFileType.ComputerFile);
        }

        return result;
    }

    return null;
}

// 诊断内容
async function DiagnosticNodeContent(node:Node, hint:NodeCodeHints, req:DiagnosticRequest):Promise<DiagnosticAndDependency> {
    const result:DiagnosticAndDependency = {
        diagnosticArr: [],
        depdendencyInfo: {}
    };
    const identifier = node.nodePath + '#content';

    if (!hint.ContentHint || hint.ContentHint.diag === undefined || !node.contentToken) {
        return result;
    }

    const items = await DiagnosticByCodeHint(node, node.content.trim(), hint.ContentHint, req);

    result.depdendencyInfo[identifier] = items.depdendencyPath;
    result.diagnosticArr.push(...items.diagnosticArr.map(item => {
        item.range = {
            startLine: node.contentToken!.line - 1,
            startCharacter: node.contentToken!.col - 1,
            endLine: node.contentToken!.line - 1,
            endCharacter: node.contentToken!.col - 1 + node.content.length,
        };
        return item as Diagnostic;
    }));

    return result;
}

// 开始根据定义诊断
async function DiagnosticByCodeHint(node:Node, checkVal:string, codeHint:CodeHint, req:DiagnosticRequest):Promise<DiagnosticItem> {
    const result:DiagnosticItem = {
        diagnosticArr: [],
        depdendencyPath: []
    };

    const checkItem = await GetHintItems(node, codeHint, req);
    if (checkItem === null) {
        return result;
    }

    const checkResult = checkItem.checkFunc(checkVal);
    result.depdendencyPath.push(...checkResult.depdendencyPath);

    if (!checkResult.validate) {
        result.diagnosticArr.push({
            message: checkResult.diagMsg,
            type: codeHint.diag! as any
        });
    }

    return result;
}


// 获取提示信息
async function GetHintItems(node: Node, codeHint: CodeHint, req:DiagnosticRequest): Promise<CheckItem | null> {
    const enumCheckFunc = (checkVal:string) => {
        const values = codeHint.items.map(item => item.value);
        return values.includes(checkVal);
    };

    // 枚举
    if (codeHint.type === HintType.Enum) {
        return {
            checkFunc: (checkVal: string) => {
                const values = codeHint.items.map(item => item.value);
                return {
                    validate: values.includes(checkVal),
                    depdendencyPath: [],
                    diagMsg: `错误的值,应为：[${values.join(',')}]之一`
                };
            }
        };
    }

    // 计算机ID
    if (codeHint.type === HintType.Computer) {
        return {
            checkFunc: (checkVal: string) => {
                const comps = req.nodeHolder.GetComputers();
                const comp = comps.find(item => item.id === checkVal);
                const validate = comp !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: validate ? [comp[req.nodeHolder.RelativePathSymbol]] : [DependencyFileType.ComputerFile],
                    diagMsg:`未在当前工作空间中找到该计算机`
                };
            }
        };
    }

    // 执行JS
    if (codeHint.type === HintType.JavaScript) {
        return {
            checkFunc: (checkVal: string) => {
                const depPath:Set<string> = new Set<string>();
                const hook: NodeHolderHookType = {
                    hookFunc: nodeType => {
                        depPath.add(GetDependencyFileType(nodeType));
                    }
                };
                NodeHolderHook.AddHook(hook);
                const values = ExecJsFuncToGetCodeHintItems(node, codeHint, req);
                NodeHolderHook.RemoveHook(hook);
                return {
                    validate: values.includes(checkVal),
                    depdendencyPath: [...depPath],
                    diagMsg: `当前值不在计算结果中，可能不正确`
                };
            }
        };
    }

    // 计算机ID或EosID
    if (codeHint.type === HintType.ComputerOrEos) {
        return {
            checkFunc: (checkVal: string) => {
                const res = GetAllComputerAndEosId(req);
                const comp = res.find(item => item.item === checkVal);
                const validate = comp !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: validate ? [comp.path] : [DependencyFileType.ComputerFile],
                    diagMsg: '未在当前工作空间中找到该计算机或eos设备'
                };
            }
        };
    }

    // Action文件
    if (codeHint.type === HintType.ActionFile) {
        return {
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = req.nodeHolder.GetActions().map(item => item[req.nodeHolder.RelativePathSymbol] ?? '').find(item => item === checkVal);
                const validate = filepath !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该Action文件路径'
                };
            }
        };
    }

    // Theme文件
    if (codeHint.type === HintType.ThemeFile) {
        return {
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = req.nodeHolder.GetThemes().map(item => item[req.nodeHolder.RelativePathSymbol] ?? '').find(item => item === checkVal);
                const validate = filepath !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该Theme文件路径'
                };
            }
        };
    }

    // Misison文件
    if (codeHint.type === HintType.MisisonFile) {
        return {
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = req.nodeHolder.GetMissions().map(item => item[req.nodeHolder.RelativePathSymbol] ?? '').find(item => item === checkVal);
                const validate = filepath !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该Misison文件路径'
                };
            }
        };
    }

    // Faction文件
    if (codeHint.type === HintType.FactionFile) {
        return {
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = req.nodeHolder.GetFactions().map(item => item[req.nodeHolder.RelativePathSymbol] ?? '').find(item => item === checkVal);
                const validate = filepath !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该Faction文件路径'
                };
            }
        };
    }

    // People文件
    if (codeHint.type === HintType.PeopleFile) {
        return {
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = req.nodeHolder.GetPeoples().map(item => item[req.nodeHolder.RelativePathSymbol] ?? '').find(item => item === checkVal);
                const validate = filepath !== undefined;
                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该Person文件路径'
                };
            }
        };
    }

    // Color
    if (codeHint.type === HintType.Color) {
        return {
            checkFunc: (checkVal: string) => {
                return {
                    validate: checkVal.match(/^\s*\d+(?:\s*\,\s*\d+){2,3}$/) !== null || enumCheckFunc(checkVal),
                    depdendencyPath: [],
                    diagMsg: '当前颜色的格式不正确'
                };
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
            checkFunc: (checkVal: string) => {
                checkVal = checkVal.replaceAll('\\', '/');
                const filepath = resp.result.find(item => item === checkVal);
                const validate = filepath !== undefined;

                return {
                    validate: validate || enumCheckFunc(checkVal),
                    depdendencyPath: [checkVal],
                    diagMsg: '未在当前工作空间中找到该路径'
                };
            }
        };
    }

    // 分步匹配
    if (codeHint.type === HintType.Step) {
        return {
            checkFunc: (checkVal: string) => {
                const values = codeHint.items.map(item => item.value);
                return {
                    validate: values.some(prefix => checkVal.startsWith(prefix)),
                    depdendencyPath: [],
                    diagMsg: `错误的值,应为：[${values.join(',')}]之一`
                };
            }
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

function GetAllComputerAndEosId(req:DiagnosticRequest) : PathItem<string>[] { 
    const computerId:PathItem<string>[] = [];
    for (const node of req.nodeHolder.NodeMap[HacknetNodeType.Computer].values()) {
        if (node.Computer.id !== undefined) {
            computerId.push({
                item: node.Computer.id,
                path: node[req.nodeHolder.RelativePathSymbol]
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
                item: eos.id,
                path: node[req.nodeHolder.RelativePathSymbol]
            });
        });
    }
    return computerId;
}

// 判断当前文件属于什么node类型
function GetFileNodeType(filepath: string, req:DiagnosticRequest): HacknetNodeType | null {
    const nodeHolder = req.nodeHolder;
    const nodeTypes = Object.values(HacknetNodeType)
        .filter(value => typeof value === 'number') as HacknetNodeType[];

    for (const nodeType of nodeTypes) {
        const nodeMap = nodeHolder.NodeMap[nodeType];
        if (nodeMap.has(filepath)) {
            return nodeType;
        }
    }

    return null;
}

// 获取nodeType对于的依赖文件Type
function GetDependencyFileType(nodeType: HacknetNodeType) {
    switch (nodeType) {
        case HacknetNodeType.Action:
            return DependencyFileType.ActionFile;
        case HacknetNodeType.Computer:
            return DependencyFileType.ComputerFile;
        case HacknetNodeType.Faction:
            return DependencyFileType.FactionFile;
        case HacknetNodeType.Mission:
            return DependencyFileType.MissionFile;
        case HacknetNodeType.People:
            return DependencyFileType.PeopleFile;
        case HacknetNodeType.Theme:
            return DependencyFileType.ThemeFile;
    }
}

// 挂载js环境需要的函数到nodeHolder
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
        NodeHolderHook.TriggerHook(HacknetNodeType.Computer);

        return res;
    };

    nodeHolder.GetMissions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Mission];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.mission);
            res.push(node.mission);
        });
        NodeHolderHook.TriggerHook(HacknetNodeType.Mission);

        return res;
    };

    nodeHolder.GetActions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Action];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.ConditionalActions);
            res.push(node.ConditionalActions);
        });
        NodeHolderHook.TriggerHook(HacknetNodeType.Action);

        return res;
    };

    nodeHolder.GetThemes = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Theme];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.CustomTheme);
            res.push(node.CustomTheme);
        });
        NodeHolderHook.TriggerHook(HacknetNodeType.Theme);

        return res;
    };

    nodeHolder.GetFactions = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.Faction];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.CustomFaction);
            res.push(node.CustomFaction);
        });
        NodeHolderHook.TriggerHook(HacknetNodeType.Faction);

        return res;
    };

    nodeHolder.GetPeoples = () => {
        const actionNodes = req.nodeHolder.NodeMap[HacknetNodeType.People];
        const res:HacknetNodeInfo[] = [];
        actionNodes.forEach(node => {
            attachNodeFunc(node, node.Person);
            res.push(node.Person);
        });
        NodeHolderHook.TriggerHook(HacknetNodeType.People);

        return res;
    };
}
