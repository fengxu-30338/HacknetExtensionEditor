const NodePathSplitChar = '.';

interface XmlPathCompPart {
    Part: string;
    Index: number;
    NotEqualJumpIndex: number;
}

class XmlPathCompare {

    private constructor(){}

    public static GetInstance() {
        return new XmlPathCompare();
    }

    private static CheckPathPartEqual(part1: string, part2: string) {
        return part1 === "*" || part2 === "*" ||
            part1 === "**" || part2 === "**" || 
            part1 === part2;
    }

    private static ParseXmlPathToCompParts(path: string): XmlPathCompPart[] {
        const parts = path.split(NodePathSplitChar);
        const result: XmlPathCompPart[] = [];
        let beforeUniversalPartIdx = -1;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === "**") {
                beforeUniversalPartIdx = i;
            }
            const xmlPart: XmlPathCompPart = {
                Part: part,
                Index: i,
                NotEqualJumpIndex: beforeUniversalPartIdx,
            };
            result.push(xmlPart);
        }

        return result;
    }

    public ComparePath(xmlPath: string, patternPath: string): boolean {
        const xmlParts = xmlPath.split(NodePathSplitChar);
        const parternParts = XmlPathCompare.ParseXmlPathToCompParts(patternPath);

        let targetIdx = 0;
        for (let i = 0; i < xmlParts.length; i++) {
            const curPart = xmlParts[i];
            const isLast = i === xmlParts.length - 1;
            
            while (true) {
                if (targetIdx < 0 || targetIdx >= parternParts.length) {
                    return false;
                }

                if (!XmlPathCompare.CheckPathPartEqual(curPart, parternParts[targetIdx].Part)) {
                    targetIdx = parternParts[targetIdx].NotEqualJumpIndex;
                    continue;
                }

                break;
            }

            if (!isLast && targetIdx + 1 >= parternParts.length) {
                targetIdx = parternParts[targetIdx].NotEqualJumpIndex;
                continue;
            }

            targetIdx++;
        }
        
        return targetIdx === parternParts.length;
    }

    public IsDirectParentPath(parentXmlPath: string, patternPath: string):boolean {
        return this.ComparePath(parentXmlPath + ".*", patternPath);
    }
}

export default XmlPathCompare.GetInstance();