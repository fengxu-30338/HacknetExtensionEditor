import * as vscode from 'vscode';
import { EventManager, EventType } from '../event/EventManager';
import { HacknetNodeType } from '../worker/GlobalHacknetXmlNodeHolderDefine';


export function InitHacknetEditorActiveFileContextSet() {
    EventManager.onEvent(EventType.EditorActiveFileChange, ({nodeType}) => {
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsComputer', nodeType === HacknetNodeType.Computer);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsMission', nodeType === HacknetNodeType.Mission);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsAction', nodeType === HacknetNodeType.Action);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsTheme', nodeType === HacknetNodeType.Theme);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsFaction', nodeType === HacknetNodeType.Faction);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsPeople', nodeType === HacknetNodeType.People);
        vscode.commands.executeCommand('setContext', 'hacknetextensionhelper.CurrentIsHacknetNode', nodeType !== HacknetNodeType.Other && nodeType !== null);
    });
}
