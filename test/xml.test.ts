import { test, expect } from 'vitest';
import {XmlParser} from '../src/parser/XmlParser';

function GetReplaceTextInfo(text: string, index: number, findRange: number = 30): string | undefined {
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


function filterByExpression<T>(
  array: T[], 
  expression: string, 
  targetValue: string
): T[] {
  const parts = expression.split('.').filter(Boolean);
  
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
  targetValue: string
): boolean {
  const [currentKey, ...remainingKeys] = parts;
  
  // 处理通配符 *
  if (currentKey === '*') {
    if (!obj || typeof obj !== 'object') {return false;}
    
    // 如果是最后一级
    if (remainingKeys.length === 0) {
      return Object.values(obj).some(val => {
        return !isCompositeType(val) && (val as any).toString() === targetValue;
      });
    }
    
    // 递归检查所有子属性
    return Object.values(obj).some(childVal => 
      childVal && typeof childVal === 'object' && 
      matchObject(childVal, remainingKeys, targetValue)
    );
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
    return !isCompositeType(childValue) && childValue.toString() === targetValue;
  }
  
  // 不是最后一级，继续递归检查
  return childValue && typeof childValue === 'object' && 
         matchObject(childValue, remainingKeys, targetValue);
}

test('测试CommonUtils', () => {
    const arr = [{a: {b: {c: 10}}}, {a: {b: 2}}];

    console.log(filterByExpression(arr, 'a.*.c', '10'));
});


test('测试Color', () => {
    const ColorRegex = /\d+(?:,\d+){2,}/;

    const valid = [
    "0,0,0,",      // 末尾逗号
    "0,0,0,1",
    "255,255,255",
    "192,168,1,1",
    "10,0,0,1",
    "100,200,100",
    "256,0,0",     // 256 > 255
    "01,2,3",      // 前导零（01无效）
    
    "1.2.3.4",     // 点号分隔
    "100,200,300"  // 300 > 255
    ];

    valid.forEach(str => {
        ColorRegex.lastIndex = 0;
        console.log(str, ColorRegex.test(str));
    });
});

