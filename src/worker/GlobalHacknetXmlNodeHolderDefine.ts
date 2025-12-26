export enum HacknetNodeType {
    Computer,
    Mission,
    Action,
    Theme,
    Faction,
    People,
    Other
}

export type HacknetXmlNodeMap = {
    [key in HacknetNodeType] : Map<string, any>
}

export interface HacknetNodeInfo {
    [key: string]: string
}

export interface ComputerInfo extends HacknetNodeInfo {
    id: string
    name: string
    ip: string
}