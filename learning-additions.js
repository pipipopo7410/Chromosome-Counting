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
function clearLearningOverlay() {
    learningOverlay().classList.remove('chrom-visible');
}
function learningModal(title, body, buttons) {
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
    el.classList.add('chrom-visible');
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
    learningModal(getCountQuestion(kind),holder,[step]);
    select.addEventListener('change',()=> {step.element.disabled = select.value === '';});
}
function showQuantityResult(kind, next) {
    const isPairs = kind === 'pairs';
    const unit = isPairs ? (gameConfig.ploidy === 3 ? '組' : '對') : '套';
    const correct = isPairs ? gameConfig.nValue : gameConfig.ploidy;
    const predicted = chromRoundPredictions[kind];
    const wrap = document.createElement('div');
    const summary = document.createElement('div'); summary.className='chrom-learning-check';
    summary.textContent=`你的預測：${predicted === null ? '未填' : predicted} ${unit}　｜　實際操作：${correct} ${unit}`;
    const feedback = document.createElement('p');
    feedback.className = predicted === correct?'chrom-learning-result-ok':'chrom-learning-result-no';
    feedback.textContent = predicted === correct?'預測正確！':'和原本預測不同，現在知道答案了！';
    wrap.append(summary, feedback);
    learningModal('操作完成，對照你的預測',wrap,[{label:'繼續下一題',action:()=>{clearLearningOverlay();next();}}]);
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
    const hint=document.createElement('p');hint.className='chrom-learning-subtitle';hint.textContent='先預測，操作完成後再對答案。';
    const grid=createGametePredictionGrid(()=>checkForm());
    wrap.append(hint,grid.tbl);
    const step={label:'完成預測，開始操作',disabled:true,action:()=>{
        chromRoundPredictions[gender]=Object.fromEntries(Object.entries(grid.choices).map(([k,v])=>[k,Number(v.value)]));
        clearLearningOverlay();
        if(gender==='m') showMessage('💡 提示：在母細胞中「雙擊」同源染色體即可將其拆開！',4000);
    }};
    function checkForm(){step.element.disabled=!Object.values(grid.choices).every(el=>el.value!=='');}
    learningModal(`先預測：${label}內有多少染色體？`,wrap,[step]);
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
        const tr=tbody.insertRow();const td=tr.insertCell();td.className='col-label';td.textContent=field.name+'（'+field.unit+'）';
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
    learningModal('🦪 牡蠣說：',wrap,[{label:'完成挑戰',action:()=>{clearLearningOverlay();showLevelMenu();}}]);
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
        addLevelButton(actions,'下一關：跳鼠（12 條）','2n12');
        preloadImages(['07.webp','07-2.webp','08.webp','08-2.webp','09.webp','10.webp','11.webp']);
    } else if(gameConfig.mode==='2n12'){
        title.textContent='🎉 跳鼠過關！';
        addLevelButton(actions,'下一關：牡蠣（三套）','3n12');
        preloadImages(['06.webp','06-2.webp']);
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
