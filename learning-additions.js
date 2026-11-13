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
let chromQuantitySavedScale = null;
function restoreQuantityScale() {
    if (chromQuantitySavedScale === null) return;
    gsap.set('#nucleus-wrapper', {scale:chromQuantitySavedScale});
    chromQuantitySavedScale = null;
}
function clearLearningOverlay() {
    restoreQuantityScale();
    const overlay = learningOverlay();
    overlay.classList.remove('chrom-visible', 'chrom-quantity-visible');
}

// 「幾對／幾套」預測期間，將小問題卡片停靠在細胞外的空白處。
// 只改顯示位置，不移動細胞、不隱藏染色體、不改動計數／磁吸。
function positionQuantityPrediction() {
    const overlay = learningOverlay();
    if (!overlay.classList.contains('chrom-quantity-visible')) return;
    const card = overlay.querySelector('.chrom-learning-card');
    // 橫直向切換時，先回復原始大小再計算新版面。
    restoreQuantityScale();
    const nucleus = document.getElementById('nucleus');
    const vw = window.innerWidth, vh = window.innerHeight;
    let circle = nucleus.getBoundingClientRect();
    const outer = 10, gap = 12;
    let right = vw - circle.right - gap - outer;
    let left = circle.left - gap - outer;
    let top = circle.top - gap - outer;
    let bottom = vh - circle.bottom - gap - outer;
    // 僅當小螢幕四周完全放不下提問時，暫時縮小細胞。
    // 作答後恢復原版 100% 尺寸，避免遮住染色體，也不影響後續拖曳座標。
    if (Math.max(right, left) < 145 && Math.max(top, bottom) < 155) {
        const wrapper = document.getElementById('nucleus-wrapper');
        if (chromQuantitySavedScale === null) chromQuantitySavedScale = Number(gsap.getProperty(wrapper,'scale')) || 1;
        const miniScale = Math.min(chromQuantitySavedScale, 0.85, Math.max(0.48, (vw - 260) / 600));
        gsap.set(wrapper, {scale:miniScale});
        circle = nucleus.getBoundingClientRect();
        right = vw - circle.right - gap - outer;
        left = circle.left - gap - outer;
        top = circle.top - gap - outer;
        bottom = vh - circle.bottom - gap - outer;
    }
    card.classList.remove('chrom-quantity-narrow');
    card.style.width = ''; card.style.left = ''; card.style.top = '';
    card.style.right = ''; card.style.bottom = ''; card.style.transform = '';

    if (right >= 145 || left >= 145) {
        const useRight = right >= left || left < 145;
        const available = useRight ? right : left;
        const width = Math.max(105, Math.min(320, available));
        card.style.width = width + 'px';
        if (width < 205) card.classList.add('chrom-quantity-narrow');
        const height = card.getBoundingClientRect().height;
        const x = useRight ? circle.right + gap : circle.left - gap - width;
        card.style.left = Math.max(outer, Math.min(vw - width - outer, x)) + 'px';
        card.style.top = Math.max(outer, Math.min(vh - height - outer, (vh - height) / 2)) + 'px';
    } else if (top >= 155 || bottom >= 155) {
        const width = Math.min(570, vw - 2 * outer);
        card.style.width = width + 'px';
        const height = card.getBoundingClientRect().height;
        const useTop = top >= bottom || bottom < 155;
        card.style.left = (vw - width) / 2 + 'px';
        card.style.top = (useTop ? outer : vh - height - outer) + 'px';
    } else {
        // 低於一般平板大小的螢幕沒有足夠細胞外空間：最小化卡片、靠右。
        // 不讓任何全螢幕遮罩遮住染色體；原版細胞尺寸維持不變。
        const width = Math.max(70, Math.min(175, vw - circle.right - outer - gap));
        card.style.width = width + 'px';
        card.classList.add('chrom-quantity-narrow');
        const height = card.getBoundingClientRect().height;
        card.style.left = Math.max(outer, Math.min(vw - width - outer, circle.right + gap)) + 'px';
        card.style.top = Math.max(outer, (vh - height) / 2) + 'px';
    }
}
window.addEventListener('resize', positionQuantityPrediction);

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
    el.classList.add('chrom-visible');
    if (options.quantity) positionQuantityPrediction();
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
    learningModal(title,wrap,[step]);
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
