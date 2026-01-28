import * as vscode from 'vscode';


function checkCharIsValid(char: string) {
    return char.match(/['"\s<>]/) !== null;
}

function GetColorRangeFromDocument(document: vscode.TextDocument): vscode.ColorInformation[] {
    const ColorRegex = /\d+(?:\s*,\s*\d+){2,}/g;
    const res: vscode.ColorInformation[] = [];
    let match;
    const text = document.getText();
    outer:while ((match = ColorRegex.exec(text)) !== null) {
        const startPos = match.index;
        const endPos = startPos + match[0].length;
        const colorStr = match[0];
        const beforeChar = startPos - 1 >= 0 ? text[startPos - 1] : '';
        const afterChar = endPos  <  text.length ? text[endPos] : '';

        // console.log(colorStr, beforeChar, afterChar);

        if (!checkCharIsValid(beforeChar) || !checkCharIsValid(afterChar)) {
            continue;
        }

        const values = colorStr.split(',');
        if (values.length !== 3 && values.length !== 4) {
            continue;
        }

        const rgba = [0, 0, 0, 1];
        for (let i = 0; i < values.length; i++) {
            const num = parseInt(values[i]);
            if (num < 0 || num > 255) {
                continue outer;
            }
            
            rgba[i] = num / 255;
        }

        res.push(new vscode.ColorInformation(
            new vscode.Range(document.positionAt(startPos), document.positionAt(endPos)),
            new vscode.Color(rgba[0], rgba[1], rgba[2], rgba[3])
        ));
    }

    return res;
}

function vsColorToHacknetString(color: vscode.Color):string {
    const colors = [color.red, color.green, color.blue];
    if (color.alpha < 1) {
        colors.push(color.alpha);
    }

    return colors.map(val => Math.floor(val * 255)).join(',');
}


class HacknetColorProvider implements vscode.DocumentColorProvider {

    provideDocumentColors(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.ColorInformation[]> {
        return GetColorRangeFromDocument(document);
    }

    provideColorPresentations(color: vscode.Color, context: { readonly document: vscode.TextDocument; readonly range: vscode.Range; }, token: vscode.CancellationToken): vscode.ProviderResult<vscode.ColorPresentation[]> {
        return [
            new vscode.ColorPresentation(vsColorToHacknetString(color))
        ];
    }

}


export function RegisterHacknetColorProvider(context: vscode.ExtensionContext) {
    // 注册颜色提供器
    context.subscriptions.push(vscode.languages.registerColorProvider('xml', new HacknetColorProvider()));
}