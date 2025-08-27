let netmapResizeObserver;
let displayDetailBgResizeObserver;
let vscodeApi;
let isMouseInPage = false;

window.onload = () => {
    useCursorFlickerEffect();
    listenNetmapSizeChange();
    listenDisplayDetailBgSizeChange();
    drawConnectNodeArc();
    drawNodeLine();
    generateTopBarRandomNum();
    generatePortRandomNum();
    displayContentChange('default');
    displayLoginChange('default');
    listenUserSelectNodeSendToVsCode();
    listenVscodeChangePropEvent();
    listenMouseInPage();

    SwitchLayout('purple');
};

// 获取可用根节点
function GetRootNode() {
    return document.querySelector('#app');
}

// 监听来自vscode的切换属性事件
function listenVscodeChangePropEvent() {
    window.addEventListener('message', msg => {
        if (msg.data.type === 'config') {
            SetConfig(msg.data.config);
        }
    });
}

// 应用配置
function SetConfig(configItmes) {
    const rootElement = GetRootNode();
    for (const config of configItmes) {
        const valueArr = config.value.split(',');

        if (valueArr.length === 3) {
            rootElement.style.setProperty(`--${config.name}`, `rgb(${config.value})`);
            continue;
        }
        
        if (valueArr.length === 4) {
            valueArr[3] = parseInt(valueArr[3]) / 255;
            rootElement.style.setProperty(`--${config.name}`, `rgb(${valueArr.join(',')})`);
            continue;
        }

        if (config.name === 'themeLayoutName') {
            SwitchLayout(config.value);
            continue;
        }

        rootElement.style.setProperty(`--${config.name}`, `${config.value}`);
    }
}

// 切换布局
function SwitchLayout(layoutName) {
    const moduleRoot = document.querySelector('#module');
    const currentLayout = moduleRoot.getAttribute('themeLayoutName');
    if (layoutName === currentLayout) {
        return;
    }

    const leftModule = moduleRoot.querySelector('#left-module');
    const midModule = moduleRoot.querySelector('#mid-module');
    const rightModule = moduleRoot.querySelector('#right-module');
    const doubleModule = moduleRoot.querySelector('#double-colume');

    const ramModule = moduleRoot.querySelector('#ram-content');
    const displayModule = moduleRoot.querySelector('#display');
    const netmapModule = moduleRoot.querySelector('#netmap');
    const terminalModule = moduleRoot.querySelector('#terminal');

    if (layoutName === 'blue' || layoutName === 'purple') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(displayModule);
        doubleModule.appendChild(netmapModule);

        leftModule.appendChild(ramModule);
        midModule.appendChild(doubleModule);
        rightModule.appendChild(terminalModule);
        return;
    }

    if (layoutName === 'green' || layoutName === 'greencompact') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(displayModule);
        doubleModule.appendChild(netmapModule);
        leftModule.appendChild(doubleModule);
        midModule.appendChild(terminalModule);
        rightModule.appendChild(ramModule);
        return;
    }

    if (layoutName === 'white') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(terminalModule);
        doubleModule.appendChild(netmapModule);

        leftModule.appendChild(ramModule);
        midModule.appendChild(displayModule);
        rightModule.appendChild(doubleModule);
        return;
    }

    if (layoutName === 'mint') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(terminalModule);
        doubleModule.appendChild(netmapModule);

        leftModule.appendChild(ramModule);
        midModule.appendChild(doubleModule);
        rightModule.appendChild(displayModule);
        return;
    }

    if (layoutName === 'riptide') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(netmapModule);
        doubleModule.appendChild(displayModule);

        leftModule.appendChild(doubleModule);
        midModule.appendChild(terminalModule);
        rightModule.appendChild(ramModule);
        return;
    }

    if (layoutName === 'riptide2') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(netmapModule);
        doubleModule.appendChild(terminalModule);

        leftModule.appendChild(displayModule);
        midModule.appendChild(doubleModule);
        rightModule.appendChild(ramModule);
        return;
    }

    if (layoutName === 'colamaeleon') {
        moduleRoot.setAttribute('themeLayoutName', layoutName);
        leftModule.innerHTML = '';
        midModule.innerHTML = '';
        rightModule.innerHTML = '';
        doubleModule.innerHTML = '';

        doubleModule.appendChild(netmapModule);
        doubleModule.appendChild(displayModule);

        leftModule.appendChild(doubleModule);
        midModule.appendChild(terminalModule);
        rightModule.appendChild(ramModule);
        return;
    }
    
}

// 监听用户选择节点，发送给vscode
function listenUserSelectNodeSendToVsCode() {
    if (!vscodeApi && 'acquireVsCodeApi' in window) {
        vscodeApi = acquireVsCodeApi();
    }

    document.addEventListener('mousemove', debounce((e) => {
        if (!isMouseInPage) {
            return;
        }
        const el = document.elementsFromPoint(e.clientX, e.clientY);
        if (el.length > 0) {
            const prop = getComputedStyle(el[0]).getPropertyValue('--hacknetProp');
            if (!prop) {
                return;
            }

            if (vscodeApi) {
                vscodeApi?.postMessage({type: 'activeNode', res: prop});
            } else {
                console.log('当前激活节点属性:', prop);
            }
        }
    }, 1000));
}

// 监听鼠标是否在页面中
function listenMouseInPage() {
    // 鼠标进入页面时触发
    document.addEventListener('mouseenter', () => {
        isMouseInPage = true;
    });

    // 鼠标离开页面时触发
    document.addEventListener('mouseleave', () => {
        isMouseInPage = false;
    });
}

// 随机生成4位破解所需开放端口字符串
function generatePortRandomNum() {
    const el = document.querySelector('#display .detail .port-num-txt span');
    const spanTime = 80;
    let curTime = 0;
    let useTime = 0;

    function run(ts) {
        if (curTime <= 0) {
            curTime = ts;
        }

        useTime += (ts - curTime);
        curTime = ts;

        if (useTime >= spanTime) {
            el.innerHTML = generateRandomString();
            useTime = 0;
        }

        requestAnimationFrame(run);
    }
    requestAnimationFrame(run);
}

// 更改display模块login内容测
function displayLoginChange(mode) {
    const modeElements = document.querySelectorAll('#display *[login-mode]');
    for (const element of modeElements) {
        if (element.getAttribute('login-mode') === mode) {
            element.style.display = 'flex';
        } else {
            element.style.display = 'none';
        }
    }
}

// 更改display模块内容
function displayContentChange(mode) {
    const modeElements = document.querySelectorAll('#display *[mode]');
    for (const element of modeElements) {
        if (element.getAttribute('mode') === mode) {
            element.style.display = 'flex';
        } else {
            element.style.display = 'none';
        }
    }
}

// 随机生成左上角数字
function generateTopBarRandomNum() {
    const el = document.querySelector('#random-num-txt');
    
    function draw() {
        el.innerHTML = Math.random().toString().substring(2, 5).padStart(3, '0');
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
}

// 光标闪烁效果
function useCursorFlickerEffect() {
    const cursorElement = document.querySelector('#terminal .cursor');
    setInterval(() => {
        if (cursorElement.style.visibility === 'visible') {
            cursorElement.style.visibility = 'hidden';
        } else {
            cursorElement.style.visibility = 'visible';
        }
    }, 300);
}

// 监听netmap尺寸变化，更改canvas大小
function listenNetmapSizeChange() {
    const netMapGridElement = document.querySelector('#netmap .grid');
    const netMapCanvas = document.querySelector('#netMapCanvas');

    netmapResizeObserver = new ResizeObserver(entries => {
        netMapCanvas.width = entries[0].contentRect.width;
        netMapCanvas.height = entries[0].contentRect.height - 5;
    });
    netmapResizeObserver.observe(netMapGridElement);
}

// 监听dislay bg模块尺寸变化
function listenDisplayDetailBgSizeChange() {
    const detailBgEl = document.querySelector('#display .detail-bg');
    displayDetailBgResizeObserver = new ResizeObserver(entries => {
        detailBgEl.style.setProperty('--displayDetailBgHeight', entries[0].contentRect.height + 'px');
    });
    displayDetailBgResizeObserver.observe(detailBgEl);
}

// 绘制两节点的连线效果
function drawNodeLine() {
    const rootElement = GetRootNode();
    const netMapCanvas = document.querySelector('#netMapCanvas');
    const netMapCanvasCtx = netMapCanvas.getContext("2d");

    const node1 = document.querySelector('#netmap .other-node');
    const node2 = document.querySelector('#netmap .connect-node');

    function draw() {
        const canvasRect = netMapCanvas.getBoundingClientRect();
        const rect1 = node1.getBoundingClientRect();
        const rect2 = node2.getBoundingClientRect();

        netMapCanvasCtx.clearRect(0, 0, canvasRect.width, canvasRect.height);
        netMapCanvasCtx.beginPath();
        netMapCanvasCtx.moveTo(rect1.x - canvasRect.x + rect1.width / 2, rect1.y - canvasRect.y + rect1.height / 2 - 2);
        netMapCanvasCtx.lineTo(rect2.x - canvasRect.x + rect2.width / 2, rect2.y - canvasRect.y + rect2.height / 2 - 2);
        netMapCanvasCtx.strokeStyle = getComputedStyle(rootElement).getPropertyValue('--outlineColor').trim();
        netMapCanvasCtx.lineWidth = 1;
        netMapCanvasCtx.stroke();

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
}

// 绘制连接节点圆弧
function drawConnectNodeArc() {
    const canvas = document.querySelector('#arc');
    var ctx = canvas.getContext("2d"); 
    const drawArr = [
        {
            type: 'line',
            rStart: 15,
            rEnd: 35,
            arc: 0,
            change: 0.1,
            opcaity: 0.5
        },
        {
            type: 'line',
            rStart: 15,
            rEnd: 35,
            arc: -45,
            change: 0.2,
            opcaity: 0.5
        },
        {
            type: 'line',
            rStart: 20,
            rEnd: 40,
            arc: -180,
            change: 0.22,
            opcaity: 0.5
        },
        {
            type: 'arc',
            r: 35,
            arcStart: 0,
            arcEnd: 85,
            lineWidth: 1,
            change: -0.2
        },
        {
            type: 'arc',
            r: 35,
            arcStart: 180,
            arcEnd: 180 + 85,
            lineWidth: 0.8,
            change: -0.05
        },
        {
            type: 'line',
            rStart: 18,
            rEnd: 21,
            arc: -240,
            change: 0.1,
            opcaity: 1
        },
        {
            type: 'line',
            rStart: 18,
            rEnd: 21,
            arc: -240,
            change: 0.1,
            opcaity: 1
        },
        {
            type: 'line',
            rStart: 18,
            rEnd: 21,
            arc: -255,
            change: 0.1,
            opcaity: 0.5
        },
        {
            type: 'line',
            rStart: 18,
            rEnd: 21,
            arc: -270,
            change: 0.1,
            opcaity: 1
        },
        {
            type: 'line',
            rStart: 25,
            rEnd: 28,
            arc: -60,
            change: -0.2,
            opcaity: 1
        },
        {
            type: 'line',
            rStart: 25,
            rEnd: 28,
            arc: -75,
            change: -0.2,
            opcaity: 0.5
        },
        {
            type: 'line',
            rStart: 25,
            rEnd: 28,
            arc: -90,
            change: -0.2,
            opcaity: 1
        }
    ];

    function draw() {
        const bound = canvas.getBoundingClientRect();
        const center = {x: bound.width / 2, y:bound.height / 2};
        ctx.clearRect(0, 0, bound.width, bound.height);
        for (const darwInfo of drawArr) {
            if (darwInfo.type === 'line') {
                ctx.beginPath();

                ctx.moveTo(center.x + darwInfo.rStart * Math.cos(darwInfo.arc * Math.PI / 180), center.y + darwInfo.rStart * Math.sin(darwInfo.arc * Math.PI / 180));
                ctx.lineTo(center.x + darwInfo.rEnd * Math.cos(darwInfo.arc * Math.PI / 180), center.y + darwInfo.rEnd * Math.sin(darwInfo.arc * Math.PI / 180));

                ctx.strokeStyle = `rgba(240, 26, 26, ${darwInfo.opcaity ?? 1})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                darwInfo.arc += darwInfo.change;
                continue;
            }

            if (darwInfo.type === 'arc') {

                ctx.beginPath();
                ctx.arc(center.x, center.y, darwInfo.r, darwInfo.arcStart * Math.PI / 180, darwInfo.arcEnd * Math.PI / 180); 

                ctx.strokeStyle = `rgba(240, 26, 26, ${darwInfo.opcaity ?? 0.5})`;
                ctx.lineWidth = darwInfo.lineWidth;
                ctx.stroke();

                darwInfo.arcStart += darwInfo.change;
                darwInfo.arcEnd += darwInfo.change;
                continue;
            }
        }
        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
}

// 显示搜索进度条
function ShowProgress() {
    const searchBtn = document.querySelector('#display .search-service .search-btn');
    const progressEl = document.querySelector('#display .search-service .progress');
    const progressBar = progressEl.querySelector('.progress-bar');
    searchBtn.style.visibility = 'hidden';
    progressEl.style.visibility = 'visible';
    const animDuration = 3000;
    let startTimeMill = -1;

    function waitProgress(ts) {
        if (startTimeMill < 0) {
            startTimeMill = ts;
            requestAnimationFrame(waitProgress);
            return;
        }

        if (startTimeMill + animDuration < ts) {
            searchBtn.style.visibility = 'visible';
            progressEl.style.visibility = 'hidden';
            progressBar.style.width = '0px';
            return;
        }
        
        progressBar.style.width = `${(ts - startTimeMill) * 100 / animDuration}%`;
        requestAnimationFrame(waitProgress);
    }

    requestAnimationFrame(waitProgress);
}

function generateRandomString() {
  // 定义可能的字符：大写字母A-Z和数字0-9
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  // 生成4位随机字符
  for (let i = 0; i < 4; i++) {
    // 从chars中随机选取一个字符
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars.charAt(randomIndex);
  }
  
  return result;
}


// 防抖
function debounce(fn, delay) {
  // 1.定义一个定时器, 保存上一次的定时器
  let timer = null;
 
  // 2.真正执行的函数
  const _debounce = function (...args) {
    // 取消上一次的定时器
    if (timer) {clearTimeout(timer);}
    // 延迟执行
    timer = setTimeout(() => {
      // 外部传入的真正要执行的函数,绑定this和参数
      fn.apply(this, args);
    }, delay);
  };
 
  return _debounce;
}