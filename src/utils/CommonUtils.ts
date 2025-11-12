import * as vscode from 'vscode';

let vscodeContext: vscode.ExtensionContext;

export function SetExtensionContext(ctx: vscode.ExtensionContext) {
  vscodeContext = ctx;
}

export function GetExtensionContext(): vscode.ExtensionContext {
  return vscodeContext;
}

export function GetWorkspaceRootUri(): vscode.Uri | undefined {
  // 获取当前工作区根目录
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    // vscode.window.showErrorMessage('No workspace is opened.');
    return;
  }

  return workspaceFolders[0].uri;
}

export function GetReplaceTextInfo(text: string, index: number, findRange: number = 30): string | undefined {
  const maxSeg = findRange;

  if (index < 0 || index >= text.length) {
    return;
  }

  // 向前直到遇到一个#或者特殊字符
  let i = 0;
  while (i < maxSeg && index - i >= 0) {
    const curIdx = index - i;
    if (text[curIdx].match(/[<>\s\/=\\"'#]/) !== null) {
      break;
    }
    i += 1;
  }
  const startIdx = index - i;

  if (startIdx < 0 || text[startIdx] !== '#') {
    return;
  }


  // 向后直到遇到一个#或者特殊字符
  i = 1;
  while (i < maxSeg && index + i < text.length) {
    const curIdx = index + i;
    if (text[curIdx].match(/[<>\s\/=\\"'#]/) !== null) {
      break;
    }
    i += 1;
  }
  const endIdx = index + i;

  if (endIdx >= text.length || text[endIdx] !== '#') {
    return;
  }

  return text.substring(startIdx, endIdx + 1);
}

export function filterObjectByExpression<T>(
  array: T[],
  expression: string,
  targetValue: string | null
): T[] {
  const exps = expression.split('|');
  const res: T[] = [];
  exps.some(exp => res.push(...filterByExpression(array, exp, targetValue)));

  return res;
}


function filterByExpression<T>(
  array: T[],
  expression: string,
  targetValue: string | null
): T[] {
  // 忽略第一层
  const [_, ...parts] = expression.split('.').filter(Boolean);

  if (parts.length === 0) {
    return array.filter(item =>
      !isCompositeType(item) && item === targetValue
    );
  }

  return array.filter(item => matchObject(item, parts, targetValue));
}

function isCompositeType(value: any): boolean {
  return value !== null && (typeof value === 'object' || Array.isArray(value));
}

function matchObject(
  obj: any,
  parts: string[],
  targetValue: string | null
): boolean {
  const [currentKey, ...remainingKeys] = parts;

  // 处理通配符 *
  if (currentKey === '*') {
    if (!obj || typeof obj !== 'object') { return false; }

    // 如果是最后一级
    if (remainingKeys.length === 0) {
      if (targetValue === null) {
        return true;
      }
      return Object.values(obj).some(val => {
        return !isCompositeType(val) && (val as any).toString() === targetValue;
      });
    }

    // 递归检查所有子属性
    return Object.values(obj).some(childVal => {
      if (!childVal) {return false;}
      if (Array.isArray(childVal) && childVal.some(item => typeof item === 'object' && matchObject(item, remainingKeys, targetValue))) {
        return true;
      }
      if (childVal === 'object' && matchObject(childVal, remainingKeys, targetValue)) {
          return true;
      }
      return false;
    });
  }

  // 精确键匹配
  // 检查键是否存在
  if (!(obj && typeof obj === 'object' && currentKey in obj)) {
    return false;
  }

  const childValue = obj[currentKey];

  // 如果是最后一级
  if (remainingKeys.length === 0) {
    // 要求最后一层必须是原始类型（非对象/非数组）
    if (targetValue === null) {
      return true;
    }
    return !isCompositeType(childValue) && childValue.toString() === targetValue;
  }

  if (!childValue) {
    return false;
  }

  if (Array.isArray(childValue) && childValue.some(item => typeof item === 'object' && matchObject(item, remainingKeys, targetValue))) {
    return true;
  }

  if (childValue === 'object' && matchObject(childValue, remainingKeys, targetValue)) {
    return true;
  }

  return false;
}


export function GetRandStr(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }
    
    return result;
}

export interface Range {
    startOffset: number
    endOffset: number
    match: string
}

export function SearchKeywordInDocument(pattern: RegExp, text: string, filter:((matchTtem:string) => boolean) | null = null):Range[] {
    const ranges:Range[]  = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const startPos = match.index;
        const endPos = startPos + match[0].length;
        const item = match[0];
        if (filter !== null && !filter(item)) {
          continue;
        }
        
        ranges.push({
            startOffset: startPos,
            endOffset: endPos,
            match: item
        });
    }

    return ranges;
}