import { CreatePayload, XmlNode } from "./Message";

export abstract class HacknetHotReplaceRequest {
    public MsgGuid: string = '';
    public Payload!: XmlNode;

    constructor(public CommandType: string, Payload: any) {
        this.MsgGuid = crypto.randomUUID();
        this.Payload = CreatePayload(Payload);
    }

    public GetMessage(): string {
        const root = new XmlNode('Command');
        root.Children.push(new XmlNode('CommandType', this.CommandType));
        root.Children.push(new XmlNode('MsgGuid', this.MsgGuid));
        root.Children.push(this.Payload);
        return root.formatToXml();
    }
}

export interface EnterExtensionRequestPayload {
    /** 扩展路径（绝对路径） */
    ExtensionFolder: string;
    /** 进入扩展时，是否需要用户认证 */
    NeedApproval: boolean;
    /** 是否直接进入无账户模式游戏 */
    EnterNoAccount: boolean;
}

/**
 * 进入扩展请求
 */
export class EnterExtensionRequest extends HacknetHotReplaceRequest {
    constructor(Payload: EnterExtensionRequestPayload) {
        super('EnterExtension', Payload);
    }
}

export interface HotReloadComputerRequestPayload {
    /** 计算机路径（绝对路径） */
    ComputerPath: string;
}

/**
 * 热重载计算机请求
 */
export class HotReloadComputerRequest extends HacknetHotReplaceRequest {
    constructor(Payload: HotReloadComputerRequestPayload) {
        super('HotReloadComputer', Payload);
    }
}

export interface HotReloadMissionRequestPayload {
    /** 任务路径（绝对路径） */
    MissionPath: string;
    /** 是否清除旧的Action */
    ClearOldAction: boolean;
}

/**
 * 热重载任务请求
 */
export class HotReloadMissionRequest extends HacknetHotReplaceRequest {
    constructor(Payload: HotReloadMissionRequestPayload) {
        super('HotReloadMission', Payload);
    }
}

export interface HotReloadActionRequestPayload {
    /** Action路径（绝对路径） */
    ActionPath: string;
    /** 是否清除旧的Action */
    ClearOldAction: boolean;
}

/**
 * 热重载Action请求
 */
export class HotReloadActionRequest extends HacknetHotReplaceRequest {
    constructor(Payload: HotReloadActionRequestPayload) {
        super('HotReloadAction', Payload);
    }
}

export interface HotReloadThemeRequestPayload {
    /** Theme路径（绝对路径） */
    ThemePath: string;
}

/**
 * 热重载Theme请求
 */
export class HotReloadThemeRequest extends HacknetHotReplaceRequest {
    constructor(Payload: HotReloadThemeRequestPayload) {
        super('HotReloadTheme', Payload);
    }
}

export interface HotReloadFactionRequestPayload {
    /** Faction路径（绝对路径） */
    FactionPath: string;
}

/**
 * 热重载Faction请求
 */
export class HotReloadFactionRequest extends HacknetHotReplaceRequest {
    constructor(Payload: HotReloadFactionRequestPayload) {
        super('HotReloadFaction', Payload);
    }
}

/**
 * 热重载People请求
 */
export class HotReloadPeopleRequest extends HacknetHotReplaceRequest {
    constructor() {
        super('HotReloadPeople', {});
    }
}

export interface ConnectComputerRequestPayload {
    /** 计算机ID */
    ComputerId: string;
}

/**
 * 连接计算机请求
 */
export class ConnectComputerRequest extends HacknetHotReplaceRequest {
    constructor(Payload: ConnectComputerRequestPayload) {
        super('ConnectComputer', Payload);
    }
}

export interface ExecuteActionRequestPayload {
    /** action xml 内容 */
    ActionXmlContent: string;
}

/**
 * 执行Action请求
 */
export class ExecuteActionRequest extends HacknetHotReplaceRequest {
    constructor(Payload: ExecuteActionRequestPayload) {
        super('ExecuteAction', Payload);
    }
}
