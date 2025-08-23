const NodePathSplitChar = '.';

function CheckPathSegmentEqual(path1: string, path2: string) {
    if (path1 === "*" || path2 === "*" || path1 === path2) {
        return true;
    }

    return false;
}

export default {
    IsParentPath(current: string, target: string, includEqual: boolean = false) {
        // 父
        const sourceArr = current.split(NodePathSplitChar);
        // 子
        const targetArr = target.split(NodePathSplitChar);

        if (sourceArr.length > target.length) {
            return false;
        }

        if (!includEqual && sourceArr.length === target.length) {
            return false;
        }

        return sourceArr.every((sourceItem, idx) => CheckPathSegmentEqual(sourceItem, targetArr[idx]));
    },

    EqualPath(current: string, target: string): boolean {
        const sourceArr = current.split(NodePathSplitChar);
        const targetArr = target.split(NodePathSplitChar);

        if (sourceArr.length !== targetArr.length) {
            return false;
        }

        return sourceArr.every((sourceItem, idx) => CheckPathSegmentEqual(sourceItem, targetArr[idx]));
    }
};