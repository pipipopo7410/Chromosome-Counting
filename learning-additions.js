'use strict';
/* 生殖網站原版增量模組。原版的計數 (+1)、染色體造型、配對動畫與受精動畫在 index.html 中保留。 */
const chromRoundPredictions = { pairs: null, sets: null, m: null, f: null };
const chromShownGameteResults = { m: false, f: false };
const chromCompletedModes = new Set(); // 本次學習歷程，重新載入即重新依序解鎖。
const chromModeOrder = ['2n10','2n12','3n12'];
const chromImageCache = new Map();

function resetRoundPredictions() {
    for (const k of Object.keys(chromRoundPredictions)) chromRoundPredictions[k] = null;
    chromShownGameteResults.m = false;
    chromShownGameteResults.f = false;
}

function preloadImages(names) {
    names.forEach(name => {
        if (chromImageCache.has(name)) return;
        const img = new Image();
        img.decoding = 'async';
        img.src = name;
        chromImageCache.set(name, img);
        if (img.decode) img.decode().catch(() => {});
    });
}
function preloadNextImages() {
    const work = () => preloadImages(['02-2.webp','02.webp','03.webp','04.webp','05.webp']);
    if ('requestIdleCallback' in window) window.requestIdleCallback(work, { timeout: 1200 });
    else setTimeout(work, 500);
}

function learningOverlay() {
    let el = document.getElementById('chrom-learning-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'chrom-learning-overlay';
        el.setAttribute('role','dialog');
        el.setAttribute('aria-modal','true');
        el.setAttribute('aria-label','學習任務');
        el.innerHTML = '<div class="chrom-learning-card"><h2 class="chrom-learning-title"></h2><div class="chrom-learning-body"></div><div class="chrom-learning-actions"></div></div>';
        document.body.appendChild(el);
    }
    return el;
}
// 預測區塊佈局：只在提問期間移動顯示位置，作答後還原原版細胞。
let chromQuantitySavedLayout = null;
let chromGameteSavedLayout = null;
function restoreQuantityScale() {
    if (!chromQuantitySavedLayout) return;
    const {element, left, scale} = chromQuantitySavedLayout;
    gsap.set(element, {left:left || '50%', scale});
    chromQuantitySavedLayout = null;
}
function restoreGameteLayout() {
    if (!chromGameteSavedLayout) return;
    const {element, left, scale} = chromGameteSavedLayout;
    gsap.set(element, {left:left || '50%', scale});
    chromGameteSavedLayout = null;
}
function clearLearningOverlay() {
    restoreQuantityScale();
    restoreGameteLayout();
    const overlay=learningOverlay();
    overlay.classList.remove('chrom-visible','chrom-quantity-visible','chrom-gamete-visible');
}
function placePredictionCard(card, x, y, width, maxHeight) {
    card.classList.remove('chrom-quantity-narrow');
    card.style.left=Math.round(x)+'px';
    card.style.top=Math.round(y)+'px';
    card.style.right='auto';
    card.style.bottom='auto';
    card.style.width=Math.round(width)+'px';
    card.style.maxHeight=Math.round(maxHeight)+'px';
    card.style.transform='none';
}

// 「幾對／幾套」與原版左上角計數框完全同寬，固定貼在它下方。
// 如細胞會碰到題目，只在預測期間讓整個細胞靠右，不改染色體大小／座標。
function positionQuantityPrediction() {
    const overlay=learningOverlay();
    if(!overlay.classList.contains('chrom-quantity-visible'))return;
    restoreQuantityScale();
    const card=overlay.querySelector('.chrom-learning-card');
    const score=document.getElementById('score-board-s1');
    const nucleus=document.getElementById('nucleus');
    const wrapper=document.getElementById('nucleus-wrapper');
    const vw=window.innerWidth, vh=window.innerHeight;
    const margin=12;
    const sr=score.getBoundingClientRect();
    const width=Math.min(sr.width,vw-2*margin);
    const x=Math.max(margin,Math.min(sr.left,vw-width-margin));
    const y=Math.max(margin,Math.min(vh-125,sr.bottom+12));
    placePredictionCard(card,x,y,width,Math.max(160,vh-y-margin));

    // 使用矩形的邊界隔開題目與細胞；避免題目卡片蓋到細胞的一角。
    const cr=card.getBoundingClientRect();
    const nr=nucleus.getBoundingClientRect();
    const intersect=cr.right+12>nr.left && cr.left-12<nr.right && cr.bottom+12>nr.top && cr.top-12<nr.bottom;
    if(intersect){
        const scale=Number(gsap.getProperty(wrapper,'scale'))||1;
        chromQuantitySavedLayout={element:wrapper,left:wrapper.style.left,scale};
        const fullWidth=nr.width/scale;
        const available=Math.max(230,vw-cr.right-2*margin);
        const targetScale=Math.min(scale,available/fullWidth);
        const sizedWidth=fullWidth*targetScale;
        const centerX=Math.min(vw-margin-sizedWidth/2,cr.right+margin+sizedWidth/2);
        gsap.set(wrapper,{left:Math.round(centerX)+'px',scale:targetScale});
    }
}

// 精子／卵子預測採獨立的大型表格，停靠在正在觀察的細胞旁。
// 不加模糊遮罩、不蓋住細胞；直向畫面若空間不夠，預測期間才微調母細胞位置。
function positionGametePrediction() {
    const overlay=learningOverlay();
    if(!overlay.classList.contains('chrom-gamete-visible'))return;
    restoreGameteLayout();
    const card=overlay.querySelector('.chrom-learning-card');
    const gender=overlay.dataset.gameteGender==='f'?'f':'m';
    const container=document.getElementById(gender==='m'?'male-container':'female-container');
    const cell=document.getElementById(gender==='m'?'mother-cell':'female-mother-cell');
    const vw=window.innerWidth, vh=window.innerHeight;
    const margin=14,gap=16,minWidth=298;
    const wanted=Math.min(400,Math.max(320,vw*.35));
    let rect=cell.getBoundingClientRect();
    let leftFree=rect.left-margin-gap;
    let rightFree=vw-rect.right-margin-gap;
    if(Math.max(leftFree,rightFree)<minWidth) {
        // 小螢幕才短暫讓作用中的細胞靠右，左側留下完整表格寬度。
        const scale=Number(gsap.getProperty(container,'scale'))||1;
        chromGameteSavedLayout={element:container,left:container.style.left,scale};
        const targetWidth=Math.min(rect.width, vw-minWidth-3*gap);
        const targetScale=scale*targetWidth/rect.width;
        const centerX=margin+minWidth+gap+targetWidth/2;
        gsap.set(container,{left:Math.round(centerX)+'px',scale:targetScale});
        rect=cell.getBoundingClientRect();
        leftFree=rect.left-margin-gap;
        rightFree=vw-rect.right-margin-gap;
    }
    const useLeft=leftFree>=rightFree;
    const space=Math.max(leftFree,rightFree);
    const width=Math.min(wanted,Math.max(minWidth,space));
    // 通常在左邊；雌性關卡則靠左上，避開上一階段留下的精子細胞。
    const x=useLeft?Math.max(margin,rect.left-gap-width):Math.min(vw-width-margin,rect.right+gap);
    card.style.width=Math.round(width)+'px';
    const h=card.getBoundingClientRect().height;
    const y=gender==='f' ? margin : Math.max(margin,(vh-h)/2);
    placePredictionCard(card,x,Math.min(y,Math.max(margin,vh-h-margin)),width,vh-2*margin);
}
window.addEventListener('resize',()=>{
    positionQuantityPrediction();
    positionGametePrediction();
});

function learningModal(title, body, buttons, options = {}) {
    const el = learningOverlay();
    el.querySelector('.chrom-learning-title').textContent = title;
    const bodyArea = el.querySelector('.chrom-learning-body');
    bodyArea.replaceChildren();
    if (typeof body === 'string') bodyArea.textContent = body;
    else if (body) bodyArea.appendChild(body);
    const actions = el.querySelector('.chrom-learning-actions');
    actions.replaceChildren();
    for (const item of buttons) {
        const btn = document.createElement('button');
        btn.className = 'chrom-learning-button';
        btn.textContent = item.label;
        btn.disabled = !!item.disabled;
        btn.onclick = () => { if (item.action) item.action(); };
        actions.appendChild(btn);
        item.element = btn;
    }
    el.classList.toggle('chrom-quantity-visible', !!options.quantity);
    el.classList.toggle('chrom-gamete-visible', !!options.gamete);
    if (options.gamete) el.dataset.gameteGender=options.gamete;
    el.classList.add('chrom-visible');
    if (options.quantity) positionQuantityPrediction();
    if (options.gamete) positionGametePrediction();
    return { el, actions, bodyArea };
}
function makeCountSelect(max, value = '') {
    const sel = document.createElement('select');
    sel.className = 'chrom-learning-number';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '請選擇';
    sel.appendChild(placeholder);
    for (let n = 0; n <= max; n++) {
        const opt = document.createElement('option');
        opt.value = String(n); opt.textContent = String(n);
        sel.appendChild(opt);
    }
    sel.value = value;
    return sel;
}
function getCountQuestion(kind) {
    const animal = getAnimalName();
    const count = gameConfig.nValue * gameConfig.ploidy;
    if (kind === 'pairs') {
        const unit = gameConfig.ploidy === 3 ? '組' : '對';
        return `${animal}體細胞有${count}條染色體，你覺得有幾${unit}染色體？`;
    }
    return `${animal}體細胞的染色體，你覺得有幾套？`;
}
function showQuantityPrediction(kind, next) {
    const unit = kind === 'pairs' ? (gameConfig.ploidy === 3 ? '組' : '對') : '套';
    const holder = document.createElement('div');
    holder.className = 'chrom-learning-check';
    const select = makeCountSelect(gameConfig.nValue * gameConfig.ploidy);
    select.setAttribute('aria-label',`預測染色體有幾${unit}`);
    holder.appendChild(select);
    const suffix = document.createElement('strong'); suffix.textContent = unit;
    holder.appendChild(suffix);
    const step = {label:kind==='pairs'?'開始配對':'開始分套',disabled:true,action:()=>{
        chromRoundPredictions[kind] = Number(select.value);
        clearLearningOverlay();
        next();
    }};
    learningModal(getCountQuestion(kind),holder,[step],{quantity:true});
    select.addEventListener('change',()=> {step.element.disabled = select.value === '';});
}
function showQuantityResult(kind, next) {
    const isPairs = kind === 'pairs';
    const unit = isPairs ? (gameConfig.ploidy === 3 ? '組' : '對') : '套';
    const correct = isPairs ? gameConfig.nValue : gameConfig.ploidy;
    const predicted = chromRoundPredictions[kind];
    if (predicted === correct) {
        learningModal(`${correct}${unit}，完全正確！`,null,[{label:'繼續',action:()=>{clearLearningOverlay();next();}}]);
    } else {
        const original = document.createElement('p');
        original.className = 'chrom-learning-result-no';
        original.textContent = `你原本預測 ${predicted} ${unit}`;
        learningModal(`正確答案：${correct}${unit}`,original,[{label:'繼續',action:()=>{clearLearningOverlay();next();}}]);
    }
}

const chromGameteFields = [
    {key:'somatic-singles',name:'體染色體',unit:'條'},
    {key:'sex-singles',name:'性染色體',unit:'條'},
    {key:'somatic-pairs',name:'體染色體',unit:'對'},
    {key:'sex-pairs',name:'性染色體',unit:'對'},
    {key:'sets-score',name:'染色體套數',unit:'套'}
];
function gameteCorrect() {
    return {'somatic-singles':gameConfig.nValue-1,'sex-singles':1,'somatic-pairs':0,'sex-pairs':0,'sets-score':1};
}
function createGametePredictionGrid(onChange) {
    const tbl = document.createElement('table'); tbl.className='chrom-learning-grid';
    const thead=tbl.createTHead();const header=thead.insertRow();
    for(const title of ['類別','條數','對數']){const th=document.createElement('th');th.textContent=title;header.appendChild(th);}
    const tbody=tbl.createTBody();
    const choices={};
    for (const [label,singleKey,pairKey] of [
        ['體染色體','somatic-singles','somatic-pairs'],
        ['性染色體','sex-singles','sex-pairs']
    ]) {
        const tr=tbody.insertRow();
        tr.className = label === '體染色體' ? 'chrom-row-somatic' : 'chrom-row-sex';
        const cell=tr.insertCell();cell.textContent=label;cell.className='col-label';
        for (const [k,max] of [[singleKey,gameConfig.nValue*gameConfig.ploidy],[pairKey,gameConfig.nValue]]) {
            const td=tr.insertCell();const sel=makeCountSelect(max);sel.setAttribute('aria-label',`${label}${k.endsWith('pairs')?'對數':'條數'}`);
            sel.addEventListener('change',onChange);td.appendChild(sel);choices[k]=sel;
        }
    }
    const tr=tbody.insertRow();
    const td=tr.insertCell();td.textContent='染色體套數';td.className='col-label';
    const sets=tr.insertCell();sets.colSpan=2;const sel=makeCountSelect(gameConfig.ploidy+1);
    sel.setAttribute('aria-label','染色體套數'); sel.addEventListener('change',onChange);sets.appendChild(sel);choices['sets-score']=sel;
    return {tbl,choices};
}
function showGametePrediction(gender) {
    const label=gender==='m'?'精子':'卵子';
    const wrap=document.createElement('div');
    const grid=createGametePredictionGrid(()=>checkForm());
    // 題目下方不加補充句，避免重複提醒，降低文字負荷。
    wrap.append(grid.tbl);
    const step={label:'完成預測，開始操作',disabled:true,action:()=>{
        chromRoundPredictions[gender]=Object.fromEntries(Object.entries(grid.choices).map(([k,v])=>[k,Number(v.value)]));
        clearLearningOverlay();
        if(gender==='m') showMessage('💡 提示：在母細胞中「雙擊」同源染色體即可將其拆開！',4000);
    }};
    function checkForm(){step.element.disabled=!Object.values(grid.choices).every(el=>el.value!=='');}
    const total = gameConfig.nValue * gameConfig.ploidy;
    const title = gender === 'm'
        ? `這隻${getAnimalName()}有${total}條染色體，那精子內有多少條染色體？`
        : '先預測：卵子內有多少染色體？';
    learningModal(title,wrap,[step],{gamete:gender});
}
function showGameteResult(gender) {
    if(chromShownGameteResults[gender]) return;
    chromShownGameteResults[gender]=true;
    const label=gender==='m'?'精子':'卵子';
    const predicted=chromRoundPredictions[gender]||{};
    const answers=gameteCorrect();
    const tbl=document.createElement('table');tbl.className='chrom-learning-grid';
    const head=tbl.createTHead().insertRow();
    for(const title of ['項目','你的預測','正確答案']){const th=document.createElement('th');th.textContent=title;head.appendChild(th);}
    const tbody=tbl.createTBody();
    for(const field of chromGameteFields){
        const tr=tbody.insertRow();
        tr.className = field.name === '體染色體' ? 'chrom-row-somatic' : (field.name === '性染色體' ? 'chrom-row-sex' : '');
        const td=tr.insertCell();td.className='col-label';td.textContent=field.name+'（'+field.unit+'）';
        const guess=tr.insertCell();guess.textContent=predicted[field.key]===undefined?'—':String(predicted[field.key]);
        guess.className=predicted[field.key]===answers[field.key]?'chrom-cell-correct':'chrom-cell-mismatch';
        const real=tr.insertCell();real.textContent=String(answers[field.key]);real.className='chrom-cell-correct';
    }
    const foot=document.createElement('p');foot.className='chrom-learning-subtitle';foot.textContent='精子、卵子都是一套染色體，每種染色體各一條。';
    const wrap=document.createElement('div');wrap.append(tbl,foot);
    learningModal(`${label}：預測與答案核對`,wrap,[{label:'核對完成，繼續',action:()=>{
        clearLearningOverlay();triggerMotherCellQueue(gender);
    }}]);
}


// 跨關卡的性別挑戰：只由學生實際拖入的精子決定，不代替學生選染色體。
let chromFruitflyOffspringSex = null;
let chromJumpSexPromptShown = false;
let chromJumpSexChallengeTarget = null;
function rememberFruitflyOffspringSex(isBoy) {
    chromFruitflyOffspringSex = isBoy ? '雄性' : '雌性';
    chromJumpSexPromptShown = false; // 重新練習果蠅後，下一次跳鼠可再得到提醒。
}
function askAlternativeOffspringChallenge() {
    if (gameConfig.mode !== '2n12' || !chromFruitflyOffspringSex || chromJumpSexPromptShown) {
        showGametePrediction('m');
        return;
    }
    chromJumpSexPromptShown = true;
    const other = chromFruitflyOffspringSex === '雄性' ? '雌性' : '雄性';
    learningModal(`剛才果蠅生出${chromFruitflyOffspringSex}寶寶，這次試試讓跳鼠生出${other}寶寶？`,null,[
        {label:'好，試試看',action:()=>{
            chromJumpSexChallengeTarget = other;
            clearLearningOverlay();
            showGametePrediction('m');
        }},
        {label:'自由操作',action:()=>{
            chromJumpSexChallengeTarget = null;
            clearLearningOverlay();
            showGametePrediction('m');
        }}
    ]);
}

function showTriploidExplanation(){
    const wrap=document.createElement('div');
    wrap.textContent='三倍體有三套染色體。進行減數分裂時，同種染色體較難平均分配，可能產生染色體數目異常的配子，因此生殖能力通常降低，但不是完全不能生殖。';
    learningModal('三倍體為什麼常有生殖困難？',wrap,[{label:'繼續',action:()=>{
        clearLearningOverlay();
        const mating=document.getElementById('mating-btn');
        mating.textContent='交配';mating.onclick=showOysterJoke;
        mating.style.display='block';gsap.set(mating,{scale:1});
    }}]);
}
function showOysterJoke(){
    const mating=document.getElementById('mating-btn');mating.style.display='none';
    const wrap=document.createElement('div');
    const joke=document.createElement('p');joke.className='chrom-oyster-joke';
    joke.textContent='牡蠣是體外受精，你在期待什麼...= =？';
    const desc=document.createElement('p');desc.textContent='精子和卵子排入水中，在體外完成受精。';
    wrap.append(joke,desc);
    learningModal('',wrap,[{label:'完成挑戰',action:()=>{clearLearningOverlay();showLevelMenu();}}]);
}
function showLevelMenu(){
    chromCompletedModes.add(gameConfig.mode);
    const menu=document.getElementById('next-level-overlay');
    const title=document.getElementById('level-menu-title');
    const actions=document.getElementById('level-menu-actions');
    actions.replaceChildren();
    const allDone=chromModeOrder.every(m=>chromCompletedModes.has(m));
    if(allDone){
        title.textContent='🎉 三關完成！自由重練';
        for(const [mode,label] of [['2n10','重練：果蠅（10 條）'],['2n12','重練：跳鼠（12 條）'],['3n12','重練：牡蠣（三套）']]){
            addLevelButton(actions,label,mode);
        }
    } else if(gameConfig.mode==='2n10') {
        title.textContent='🎉 果蠅過關！';
        if (chromCompletedModes.has('2n12')) {
            showEarnedReviewActions(actions);
        } else {
            addLevelButton(actions,'下一關：跳鼠（12 條）','2n12');
        }
        preloadImages(['07.webp','07-2.webp','08.webp','08-2.webp','09.webp','10.webp','11.webp']);
    } else if(gameConfig.mode==='2n12'){
        // 跳鼠完成後先詢問：高中挑戰非必修。
        preloadImages(['06.webp','06-2.webp']);
        showOptionalOysterPrompt();
        return;
    }
    menu.style.display='flex';
    gsap.fromTo('#next-level-overlay .menu-box',{scale:.7,opacity:0},{scale:1,opacity:1,duration:.4,ease:'back.out(1.2)'});
}
function addLevelButton(container,label,mode){
    const btn=document.createElement('button');
    btn.className='menu-btn'+(mode==='3n12'?' menu-btn-advanced':'');
    btn.textContent=label;
    btn.onclick=()=>{clearLearningOverlay();restartGame(mode);};
    container.appendChild(btn);
}

// 牡蠣為高中進階選修；拒絕後只解鎖「已完成」的前兩關，第三關不強迫開始。
function showOptionalOysterPrompt() {
    if (chromCompletedModes.has('3n12')) { showLevelMenu(); return; }
    document.getElementById('next-level-overlay').style.display = 'none';
    learningModal('牡蠣是高中課程，想挑戰看看嗎？',null,[
        {label:'好',action:()=>{clearLearningOverlay();restartGame('3n12');}},
        {label:'還是回去多操作多複習幾次鞏固記憶',action:()=>{
            clearLearningOverlay();showEarnedReviewMenu();
        }}
    ]);
}
function showEarnedReviewActions(actions) {
    if (chromCompletedModes.has('2n10')) addLevelButton(actions,'再練一次：果蠅','2n10');
    if (chromCompletedModes.has('2n12')) addLevelButton(actions,'再練一次：跳鼠','2n12');
    if (chromCompletedModes.has('2n12') && !chromCompletedModes.has('3n12')) {
        const btn=document.createElement('button');
        btn.className='menu-btn menu-btn-advanced';
        btn.textContent='準備好了，挑戰牡蠣';
        btn.onclick=()=>{document.getElementById('next-level-overlay').style.display='none';showOptionalOysterPrompt();};
        actions.appendChild(btn);
    }
}
function showEarnedReviewMenu() {
    const menu=document.getElementById('next-level-overlay');
    const title=document.getElementById('level-menu-title');
    const actions=document.getElementById('level-menu-actions');
    title.textContent='完成兩關！想複習哪一關？';
    actions.replaceChildren();
    showEarnedReviewActions(actions);
    menu.style.display='flex';
    gsap.fromTo('#next-level-overlay .menu-box',{scale:.7,opacity:0},{scale:1,opacity:1,duration:.4,ease:'back.out(1.2)'});
}
