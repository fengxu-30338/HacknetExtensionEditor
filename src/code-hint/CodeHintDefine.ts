export interface CodeHintItem {
    value: string
    desc: string
    filterText: string | undefined
    kind: string | undefined
    label?: string
}

export interface CommonTextHintItem extends CodeHintItem {
    document?: string
}

export interface FileCodeHint {
    fileTriggerPattern: string
    codeHintItems: CommonTextHintItem[];
}

export interface GlobalCodeHints {
    NodeCodeHintSource: NodeCodeHints[]
    ReplaceTextSource: CodeHintItem[]
    CommonTextSource: CodeHintItem[]
    HackerScriptSource: FileCodeHint
    IncludeFiles: string[]
}

export enum HintType {
    Enum,
    EnumWithCommonString,
    JavaScript,
    Computer,
    ComputerOrEos,
    ActionFile,
    ThemeFile,
    MisisonFile,
    FactionFile,
    PeopleFile,
    Color,  // 只用来标识不做提示，由hover触发colorPicker
    Path,
    Folder,
    Step
}

export interface NodeCodeHintItem extends CodeHintItem {
    nextStep?: CodeHint
}

export interface LinkBy {
    linkBy: string
    linkByValuePattern: string | null
    ignoreCaseForMatch: boolean
    overrideValue: string | null
    split: string | null
}

export const RepeatRuleDef = {
    OverrideOrAppend: "override",
    Remove: "remove",
    OverrideOrAppendItem: "overrideItem",
    RemoveItem: "removeItem",
} as const;
export type RepeatRule = (typeof RepeatRuleDef)[keyof typeof RepeatRuleDef];

export interface Diag {
    type: number // 诊断等级
    ignoreCase: boolean
    jsRule: 'attach' | 'override'
    jsContent: string
}

export interface CodeHint {
    type: HintType
    content: string
    items: NodeCodeHintItem[]
    required: boolean
    desc: string
    codeSnippets: string
    default: string
    linkByCollection: LinkBy[]
    diag?: Diag // 诊断等级
    repeatRule: RepeatRule // 标签的重复合并规则
}

export interface AttributeHint {
    [key: string] : CodeHint
}

export interface AttributeHintItem {
    attrName: string
    codeHint: CodeHint
}

export interface ConditionAttributeHint {
    attrName: string
    match: string
    attributes: AttributeHint
    ignoreCase: boolean
    repeatRule: RepeatRule // 标签的重复合并规则
}

export interface NodeCodeHints {
    Name: string
    NodePath: string
    Leval: number
    Desc: string
    AttributeNodeHint: AttributeHint
    ConditionAttributeHints: ConditionAttributeHint[]
    ContentHint: CodeHint | null
    CodeSnippets: string
    Multi: boolean
    Enable: boolean
    FileTriggerPattern: string | null
}

export async function GetLinkByFinalMatchValue(linkByCollection:LinkBy[], linkValue:string, forEach?:(value:string, linkBy:LinkBy) => Promise<void> | void):Promise<string[]> {
    if (linkByCollection.length === 0) {
        return [];
    }

    let matchedValue = linkValue.trim();
    const linkBy = linkByCollection.find(linkByItem => {
        if (linkByItem.linkByValuePattern === null) {
            return true;
        }
        const linkByValueRegex = new RegExp(linkByItem.linkByValuePattern, linkByItem.ignoreCaseForMatch ? 'i' : undefined);
        const matchRes = linkValue.match(linkByValueRegex);
        if (matchRes !== null) {
            matchedValue = matchRes[matchRes.length - 1];
            return true;
        }
    });

    if (linkBy === undefined) {
        return [];
    }

    if (linkBy.overrideValue !== null) {
        matchedValue = linkBy.overrideValue;
    }

    const handleContents = linkBy.split === null ? [matchedValue] : matchedValue.split(new RegExp(linkBy.split)).filter(item => item.trim() !== '').map(item => item.trim());
    if (handleContents.length === 0) {
        return [];
    }

    if (forEach !== undefined) {
        for (const val of handleContents) {
            await forEach(val, linkBy);
        }
    }
    
    return handleContents;
}