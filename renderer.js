/**
 * 渲染进程：多题库管理、答题逻辑、按题库存错题、localStorage
 *
 * Excel 固定列：题号、题目、A、B、C、D、答案、解析
 * 题型：单选 / 多选 / 判断
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'quiz_app_state_v2';
  const STORAGE_KEY_LEGACY = 'quiz_app_state_v1';
  const REQUIRED_HEADERS = ['题号', '题目', 'A', 'B', 'C', 'D', '答案', '解析'];

  /** @type {Bank[]} */
  let banks = [];
  /** 当前操作的题库 id */
  let activeBankId = null;
  /** 待确认导入的临时数据 */
  let pendingImport = null;

  /** @type {Question[]} 本次答题队列 */
  let quizQueue = [];
  let currentIndex = 0;
  let correctCount = 0;
  /** @type {WrongRecord[]} 本次会话错题（用于成绩报告） */
  let sessionWrongList = [];
  let answered = false;
  /** 当前测验来源：normal | wrong */
  let quizSource = 'normal';
  /** 再测一次时使用的设置 */
  let lastQuizOptions = { mode: 'sequential', count: 10 };

  const $ = (id) => document.getElementById(id);

  const viewHome = $('view-home');
  const viewSetup = $('view-setup');
  const viewWrongs = $('view-wrongs');
  const viewQuiz = $('view-quiz');
  const viewReport = $('view-report');

  const btnImport = $('btn-import');
  const importStatus = $('import-status');
  const bankListEl = $('bank-list');
  const bankEmpty = $('bank-empty');

  const setupBankName = $('setup-bank-name');
  const setupBankMeta = $('setup-bank-meta');
  const quizCountInput = $('quiz-count');
  const quizCountHint = $('quiz-count-hint');
  const btnSetupBack = $('btn-setup-back');
  const btnStart = $('btn-start');
  const btnOpenWrongs = $('btn-open-wrongs');

  const wrongsTitle = $('wrongs-title');
  const wrongsMeta = $('wrongs-meta');
  const wrongsEmpty = $('wrongs-empty');
  const wrongsListEl = $('wrongs-list');
  const btnWrongsBack = $('btn-wrongs-back');
  const btnPracticeWrongs = $('btn-practice-wrongs');
  const btnClearWrongs = $('btn-clear-wrongs');

  const progressText = $('progress-text');
  const accuracyText = $('accuracy-text');
  const progressFill = $('progress-fill');
  const btnQuit = $('btn-quit');
  const qType = $('q-type');
  const qNo = $('q-no');
  const qTitle = $('q-title');
  const optionsBox = $('options-box');
  const feedback = $('feedback');
  const feedbackResult = $('feedback-result');
  const feedbackAnswer = $('feedback-answer');
  const feedbackExplain = $('feedback-explain');
  const btnSubmit = $('btn-submit');
  const btnNext = $('btn-next');

  const reportBankName = $('report-bank-name');
  const reportTotal = $('report-total');
  const reportCorrect = $('report-correct');
  const reportWrong = $('report-wrong');
  const reportRate = $('report-rate');
  const wrongListWrap = $('wrong-list-wrap');
  const wrongListEl = $('wrong-list');
  const btnRetryWrong = $('btn-retry-wrong');
  const btnRestart = $('btn-restart');
  const btnBackHome = $('btn-back-home');

  const modalImport = $('modal-import');
  const modalImportFile = $('modal-import-file');
  const modalImportCount = $('modal-import-count');
  const importNameInput = $('import-name-input');
  const btnImportCancel = $('btn-import-cancel');
  const btnImportConfirm = $('btn-import-confirm');

  // -------------------- 工具 --------------------

  function cellText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeAnswer(raw) {
    let a = cellText(raw).toUpperCase().replace(/\s+/g, '');
    a = a.replace(/[,，、|/\\]/g, '');
    if (a === '正确' || a === '对' || a === 'TRUE' || a === 'T' || a === '√' || a === 'YES' || a === 'Y') {
      return '对';
    }
    if (a === '错误' || a === '错' || a === 'FALSE' || a === 'F' || a === '×' || a === 'X' || a === 'NO' || a === 'N') {
      return '错';
    }
    return a;
  }

  function detectType(answer, opts) {
    if (answer === '对' || answer === '错') return 'judge';
    if (/^[ABCD]+$/.test(answer) && answer.length > 1) {
      const unique = [...new Set(answer.split(''))].sort().join('');
      return unique.length > 1 ? 'multiple' : 'single';
    }
    const ab = [opts.A, opts.B].map((t) => cellText(t));
    const cdEmpty = !cellText(opts.C) && !cellText(opts.D);
    if (cdEmpty && ab.includes('对') && ab.includes('错')) return 'judge';
    return 'single';
  }

  function typeLabel(type) {
    if (type === 'multiple') return '多选题';
    if (type === 'judge') return '判断题';
    return '单选题';
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function questionKey(q) {
    return String(q.id) + '|' + String(q.title);
  }

  function getActiveBank() {
    return banks.find((b) => b.id === activeBankId) || null;
  }

  function getSelectedMode() {
    const el = document.querySelector('input[name="mode"]:checked');
    return el ? el.value : 'sequential';
  }

  /**
   * @param {'home'|'setup'|'wrongs'|'quiz'|'report'} name
   */
  function showView(name) {
    viewHome.classList.toggle('hidden', name !== 'home');
    viewSetup.classList.toggle('hidden', name !== 'setup');
    viewWrongs.classList.toggle('hidden', name !== 'wrongs');
    viewQuiz.classList.toggle('hidden', name !== 'quiz');
    viewReport.classList.toggle('hidden', name !== 'report');
  }

  // -------------------- Excel 解析 --------------------

  function parseWorkbook(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('未加载 sheetjs（XLSX），请确认已 npm install');
    }
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel 中没有工作表');

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) throw new Error('题库为空，请检查 Excel 内容');

    const headers = Object.keys(rows[0]);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error('缺少列：' + missing.join('、') + '。请按固定列名制作题库。');
    }

    /** @type {Question[]} */
    const list = [];
    rows.forEach((row, idx) => {
      const title = cellText(row['题目']);
      const answerRaw = cellText(row['答案']);
      if (!title || !answerRaw) return;

      const options = {
        A: cellText(row['A']),
        B: cellText(row['B']),
        C: cellText(row['C']),
        D: cellText(row['D'])
      };
      const answer = normalizeAnswer(answerRaw);
      const type = detectType(answer, options);
      let finalAnswer = answer;
      if (type === 'multiple' && /^[ABCD]+$/.test(answer)) {
        finalAnswer = [...new Set(answer.split(''))].sort().join('');
      }
      if (type === 'judge' && !options.A && !options.B) {
        options.A = '对';
        options.B = '错';
      }

      list.push({
        id: cellText(row['题号']) || String(idx + 1),
        title,
        options,
        answer: finalAnswer,
        explain: cellText(row['解析']),
        type
      });
    });

    if (!list.length) throw new Error('未解析到有效题目（题目与答案不能为空）');
    return list;
  }

  // -------------------- 持久化 --------------------

  function saveAll() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        banks,
        updatedAt: Date.now()
      })
    );
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.banks)) {
          banks = data.banks.map(normalizeBank);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    // 兼容旧版单题库数据
    try {
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (!legacy) return;
      const old = JSON.parse(legacy);
      if (Array.isArray(old.questionBank) && old.questionBank.length) {
        banks = [
          normalizeBank({
            id: uid(),
            name: old.bankFileName ? String(old.bankFileName).replace(/\.xlsx$/i, '') : '导入的题库',
            fileName: old.bankFileName || '',
            questions: old.questionBank,
            wrongList: Array.isArray(old.lastWrongList) ? old.lastWrongList : [],
            createdAt: Date.now()
          })
        ];
        saveAll();
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {Partial<Bank>} b
   * @returns {Bank}
   */
  function normalizeBank(b) {
    return {
      id: b.id || uid(),
      name: cellText(b.name) || '未命名题库',
      fileName: cellText(b.fileName),
      questions: Array.isArray(b.questions) ? b.questions : [],
      wrongList: Array.isArray(b.wrongList) ? b.wrongList : [],
      createdAt: b.createdAt || Date.now()
    };
  }

  /**
   * 将本次错题合并进题库错题本（按题目去重，保留最新）
   * @param {Bank} bank
   * @param {WrongRecord[]} records
   */
  function mergeWrongsIntoBank(bank, records) {
    const map = new Map();
    bank.wrongList.forEach((w) => {
      const q = w.question || w;
      map.set(questionKey(q), w);
    });
    records.forEach((w) => {
      const q = w.question || w;
      map.set(questionKey(q), w);
    });
    bank.wrongList = Array.from(map.values());
  }

  // -------------------- 题库列表 UI --------------------

  function renderBankList() {
    bankListEl.innerHTML = '';
    if (!banks.length) {
      bankEmpty.classList.remove('hidden');
      return;
    }
    bankEmpty.classList.add('hidden');

    banks.forEach((bank) => {
      const li = document.createElement('li');
      li.className = 'bank-item';

      const main = document.createElement('div');
      main.className = 'bank-item-main';
      main.innerHTML =
        '<p class="bank-item-name">' + escapeHtml(bank.name) + '</p>' +
        '<div class="bank-item-meta">' +
        bank.questions.length + ' 题' +
        (bank.fileName ? ' · 来源 ' + escapeHtml(bank.fileName) : '') +
        ' · 错题 ' + bank.wrongList.length +
        '</div>';

      const actions = document.createElement('div');
      actions.className = 'bank-item-actions';

      const btnQuiz = document.createElement('button');
      btnQuiz.className = 'btn btn-primary btn-sm';
      btnQuiz.textContent = '开始答题';
      btnQuiz.addEventListener('click', () => openSetup(bank.id));

      const btnWrong = document.createElement('button');
      btnWrong.className = 'btn btn-warn btn-sm';
      btnWrong.textContent = '错题本(' + bank.wrongList.length + ')';
      btnWrong.addEventListener('click', () => openWrongs(bank.id));

      const btnRename = document.createElement('button');
      btnRename.className = 'btn btn-ghost btn-sm';
      btnRename.textContent = '重命名';
      btnRename.addEventListener('click', () => renameBank(bank.id));

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn btn-danger btn-sm';
      btnDelete.textContent = '删除';
      btnDelete.addEventListener('click', () => deleteBank(bank.id));

      actions.appendChild(btnQuiz);
      actions.appendChild(btnWrong);
      actions.appendChild(btnRename);
      actions.appendChild(btnDelete);
      li.appendChild(main);
      li.appendChild(actions);
      bankListEl.appendChild(li);
    });
  }

  function openSetup(bankId) {
    activeBankId = bankId;
    const bank = getActiveBank();
    if (!bank) return;

    setupBankName.textContent = bank.name;
    setupBankMeta.textContent = '共 ' + bank.questions.length + ' 题，错题本 ' + bank.wrongList.length + ' 题';
    quizCountInput.max = String(Math.max(1, bank.questions.length));
    quizCountInput.value = String(Math.min(Number(quizCountInput.value) || 10, bank.questions.length) || bank.questions.length);
    quizCountHint.textContent = '最多 ' + bank.questions.length + ' 题';
    btnOpenWrongs.textContent = '查看错题（' + bank.wrongList.length + '）';
    showView('setup');
  }

  function renameBank(bankId) {
    const bank = banks.find((b) => b.id === bankId);
    if (!bank) return;
    const name = prompt('请输入新的题库名称', bank.name);
    if (name === null) return;
    const trimmed = cellText(name);
    if (!trimmed) {
      alert('名称不能为空');
      return;
    }
    bank.name = trimmed;
    saveAll();
    renderBankList();
    if (activeBankId === bankId && !viewSetup.classList.contains('hidden')) {
      setupBankName.textContent = bank.name;
    }
  }

  function deleteBank(bankId) {
    const bank = banks.find((b) => b.id === bankId);
    if (!bank) return;
    if (!confirm('确定删除题库「' + bank.name + '」？其错题记录也会一并删除。')) return;
    banks = banks.filter((b) => b.id !== bankId);
    if (activeBankId === bankId) activeBankId = null;
    saveAll();
    renderBankList();
    showView('home');
  }

  // -------------------- 错题本 --------------------

  function openWrongs(bankId) {
    activeBankId = bankId;
    renderWrongsView();
    showView('wrongs');
  }

  function renderWrongsView() {
    const bank = getActiveBank();
    if (!bank) {
      showView('home');
      return;
    }

    wrongsTitle.textContent = bank.name + ' · 错题本';
    wrongsMeta.textContent = '共 ' + bank.wrongList.length + ' 道错题（可手动删除）';
    wrongsListEl.innerHTML = '';

    if (!bank.wrongList.length) {
      wrongsEmpty.classList.remove('hidden');
      btnPracticeWrongs.classList.add('hidden');
      btnClearWrongs.classList.add('hidden');
      return;
    }

    wrongsEmpty.classList.add('hidden');
    btnPracticeWrongs.classList.remove('hidden');
    btnClearWrongs.classList.remove('hidden');

    bank.wrongList.forEach((w, index) => {
      const li = document.createElement('li');
      const body = document.createElement('div');
      body.className = 'w-body';
      body.innerHTML =
        '<div class="w-title">[' + typeLabel(w.type) + '] ' + escapeHtml(w.id) + '. ' + escapeHtml(w.title) + '</div>' +
        '<div class="w-ans">正确答案：' + escapeHtml(w.answer) +
        (w.userAnswer ? '　你的答案：' + escapeHtml(w.userAnswer) : '') + '</div>' +
        (w.explain ? '<div class="w-ans">解析：' + escapeHtml(w.explain) + '</div>' : '');

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger btn-sm';
      btnDel.textContent = '删除';
      btnDel.addEventListener('click', () => {
        bank.wrongList.splice(index, 1);
        saveAll();
        renderBankList();
        renderWrongsView();
      });

      li.appendChild(body);
      li.appendChild(btnDel);
      wrongsListEl.appendChild(li);
    });
  }

  function clearAllWrongs() {
    const bank = getActiveBank();
    if (!bank || !bank.wrongList.length) return;
    if (!confirm('确定清空「' + bank.name + '」的全部错题？')) return;
    bank.wrongList = [];
    saveAll();
    renderBankList();
    renderWrongsView();
  }

  // -------------------- 答题流程 --------------------

  /**
   * @param {{mode:'sequential'|'random'|'wrong', count?:number, source?:Question[]}} options
   */
  function startQuiz(options) {
    const bank = getActiveBank();
    if (!bank) {
      alert('请先选择题库');
      return;
    }

    let queue;
    if (options.mode === 'wrong') {
      const source = options.source || bank.wrongList.map((w) => w.question || w).filter((q) => q && q.title && q.answer);
      queue = source.slice();
      quizSource = 'wrong';
    } else {
      const pool = bank.questions.slice();
      let n = parseInt(String(options.count), 10);
      if (!Number.isFinite(n) || n < 1) n = 1;
      n = Math.min(n, pool.length);
      queue = options.mode === 'random' ? shuffle(pool).slice(0, n) : pool.slice(0, n);
      quizSource = 'normal';
      lastQuizOptions = { mode: options.mode, count: n };
    }

    if (!queue.length) {
      alert('没有可答的题目');
      return;
    }

    quizQueue = queue;
    currentIndex = 0;
    correctCount = 0;
    sessionWrongList = [];
    answered = false;
    showView('quiz');
    renderQuestion();
    updateProgress();
  }

  function updateProgress() {
    const total = quizQueue.length;
    const done = Math.min(currentIndex + (answered ? 1 : 0), total);
    progressText.textContent = '第 ' + (currentIndex + 1) + ' / ' + total + ' 题';
    const answeredCount = correctCount + sessionWrongList.length;
    const rate = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
    accuracyText.textContent = '正确率 ' + rate + '%（已答 ' + answeredCount + '）';
    progressFill.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
  }

  function renderQuestion() {
    const q = quizQueue[currentIndex];
    answered = false;
    qType.textContent = typeLabel(q.type);
    qNo.textContent = '题号：' + q.id;
    qTitle.textContent = q.title;
    feedback.classList.add('hidden');
    btnSubmit.classList.remove('hidden');
    btnNext.classList.add('hidden');
    btnNext.textContent = currentIndex >= quizQueue.length - 1 ? '查看成绩' : '下一题';
    optionsBox.innerHTML = '';

    let keys = ['A', 'B', 'C', 'D'];
    if (q.type === 'judge') {
      keys = keys.filter((k) => q.options[k]);
      if (!keys.length) {
        q.options.A = '对';
        q.options.B = '错';
        keys = ['A', 'B'];
      }
    } else {
      keys = keys.filter((k) => q.options[k]);
    }

    const inputType = q.type === 'multiple' ? 'checkbox' : 'radio';
    const groupName = 'opt_' + currentIndex;

    keys.forEach((key) => {
      const label = document.createElement('label');
      label.className = 'option-item';
      label.dataset.key = key;

      const input = document.createElement('input');
      input.type = inputType;
      input.name = groupName;
      input.value = key;

      const keySpan = document.createElement('span');
      keySpan.className = 'option-key';
      keySpan.textContent = key + '.';

      const textSpan = document.createElement('span');
      textSpan.className = 'option-text';
      textSpan.textContent = q.options[key];

      label.appendChild(input);
      label.appendChild(keySpan);
      label.appendChild(textSpan);
      input.addEventListener('change', () => {
        if (answered) return;
        optionsBox.querySelectorAll('.option-item').forEach((item) => {
          const inp = item.querySelector('input');
          item.classList.toggle('selected', !!(inp && inp.checked));
        });
      });
      optionsBox.appendChild(label);
    });
  }

  function readUserAnswer(q) {
    const checked = optionsBox.querySelectorAll('input:checked');
    if (!checked.length) return '';
    if (q.type === 'judge') {
      const key = checked[0].value;
      const text = normalizeAnswer(q.options[key]);
      if (text === '对' || text === '错') return text;
      if (key === 'A') return '对';
      if (key === 'B') return '错';
      return normalizeAnswer(q.options[key] || key);
    }
    if (q.type === 'multiple') {
      const letters = Array.from(checked).map((el) => el.value).filter((v) => /^[ABCD]$/.test(v));
      return [...new Set(letters)].sort().join('');
    }
    return checked[0].value;
  }

  function getCorrectOptionKeys(q) {
    if (q.type === 'judge') {
      const target = q.answer;
      const found = Object.keys(q.options).filter((k) => normalizeAnswer(q.options[k]) === target);
      if (found.length) return found;
      return target === '对' ? ['A'] : ['B'];
    }
    if (q.type === 'multiple') return q.answer.split('');
    return [q.answer];
  }

  function highlightOptions(q, isCorrect) {
    const correctKeys = getCorrectOptionKeys(q);
    optionsBox.querySelectorAll('.option-item').forEach((item) => {
      const key = item.dataset.key;
      const input = item.querySelector('input');
      if (input) input.disabled = true;
      if (correctKeys.includes(key)) item.classList.add('correct');
      else if (input && input.checked && !isCorrect) item.classList.add('wrong');
    });
  }

  function formatAnswerDisplay(q) {
    if (q.type === 'judge') return q.answer;
    if (q.type === 'multiple') {
      return q.answer.split('').map((k) => k + '.' + (q.options[k] || '')).join('；');
    }
    return q.answer + (q.options[q.answer] ? '. ' + q.options[q.answer] : '');
  }

  function formatUserAnswerDisplay(q, userAnswer) {
    if (q.type === 'judge') return userAnswer;
    if (q.type === 'multiple') {
      return userAnswer.split('').map((k) => k + '.' + (q.options[k] || '')).join('；') || '未选';
    }
    return userAnswer + (q.options[userAnswer] ? '. ' + q.options[userAnswer] : '');
  }

  function submitAnswer() {
    if (answered) return;
    const bank = getActiveBank();
    const q = quizQueue[currentIndex];
    const userAnswer = readUserAnswer(q);
    if (!userAnswer) {
      alert(q.type === 'multiple' ? '请至少选择一个选项' : '请先选择答案');
      return;
    }

    answered = true;
    const isCorrect = userAnswer === q.answer;

    if (isCorrect) {
      correctCount += 1;
    } else {
      const record = {
        id: q.id,
        title: q.title,
        type: q.type,
        userAnswer,
        answer: q.answer,
        explain: q.explain,
        question: q
      };
      sessionWrongList.push(record);
      if (bank) {
        mergeWrongsIntoBank(bank, [record]);
        saveAll();
      }
    }

    feedback.classList.remove('hidden');
    feedbackResult.textContent = isCorrect ? '回答正确' : '回答错误';
    feedbackResult.className = 'feedback-result ' + (isCorrect ? 'ok' : 'bad');
    feedbackAnswer.textContent =
      '正确答案：' + formatAnswerDisplay(q) +
      (isCorrect ? '' : '　　你的答案：' + formatUserAnswerDisplay(q, userAnswer));
    feedbackExplain.textContent = q.explain ? '解析：' + q.explain : '解析：暂无';
    highlightOptions(q, isCorrect);
    btnSubmit.classList.add('hidden');
    btnNext.classList.remove('hidden');
    updateProgress();
  }

  function goNext() {
    if (!answered) return;
    if (currentIndex >= quizQueue.length - 1) {
      showReport();
      return;
    }
    currentIndex += 1;
    renderQuestion();
    updateProgress();
  }

  function showReport() {
    const bank = getActiveBank();
    const total = quizQueue.length;
    const wrong = sessionWrongList.length;
    const rate = total ? Math.round((correctCount / total) * 100) : 0;

    reportBankName.textContent = bank ? bank.name : '';
    reportTotal.textContent = String(total);
    reportCorrect.textContent = String(correctCount);
    reportWrong.textContent = String(wrong);
    reportRate.textContent = rate + '%';

    wrongListEl.innerHTML = '';
    if (wrong) {
      wrongListWrap.classList.remove('hidden');
      btnRetryWrong.classList.remove('hidden');
      sessionWrongList.forEach((w) => {
        const li = document.createElement('li');
        li.innerHTML =
          '<div class="w-title">[' + typeLabel(w.type) + '] ' + escapeHtml(w.id) + '. ' + escapeHtml(w.title) + '</div>' +
          '<div class="w-ans">正确答案：' + escapeHtml(w.answer) +
          '　你的答案：' + escapeHtml(w.userAnswer) + '</div>';
        wrongListEl.appendChild(li);
      });
    } else {
      wrongListWrap.classList.add('hidden');
      btnRetryWrong.classList.add('hidden');
    }

    progressFill.style.width = '100%';
    renderBankList();
    showView('report');
  }

  // -------------------- 导入弹层 --------------------

  function openImportModal(fileName, questions) {
    pendingImport = { fileName, questions };
    const defaultName = String(fileName || '题库').replace(/\.(xlsx|xls)$/i, '');
    modalImportFile.textContent = '文件：' + fileName;
    modalImportCount.textContent = '共解析到 ' + questions.length + ' 题';
    importNameInput.value = defaultName;
    modalImport.classList.remove('hidden');
    importNameInput.focus();
    importNameInput.select();
  }

  function closeImportModal() {
    pendingImport = null;
    modalImport.classList.add('hidden');
  }

  function confirmImport() {
    if (!pendingImport) return;
    const name = cellText(importNameInput.value);
    if (!name) {
      alert('请填写题库名称');
      return;
    }
    const bank = normalizeBank({
      id: uid(),
      name,
      fileName: pendingImport.fileName,
      questions: pendingImport.questions,
      wrongList: [],
      createdAt: Date.now()
    });
    banks.unshift(bank);
    saveAll();
    closeImportModal();
    importStatus.textContent = '已添加题库「' + name + '」（' + bank.questions.length + ' 题）';
    importStatus.classList.remove('error');
    renderBankList();
  }

  // -------------------- 事件 --------------------

  btnImport.addEventListener('click', async () => {
    importStatus.textContent = '正在打开文件…';
    importStatus.classList.remove('error');
    try {
      const result = await window.electronAPI.openXlsxFile();
      if (!result || result.canceled) {
        importStatus.textContent = '已取消选择';
        return;
      }
      const uint8 = new Uint8Array(result.data);
      const questions = parseWorkbook(uint8.buffer);
      importStatus.textContent = '解析成功，请为题库命名';
      openImportModal(result.fileName || '题库.xlsx', questions);
    } catch (err) {
      console.error(err);
      importStatus.textContent = '导入失败：' + (err && err.message ? err.message : String(err));
      importStatus.classList.add('error');
    }
  });

  btnImportCancel.addEventListener('click', closeImportModal);
  btnImportConfirm.addEventListener('click', confirmImport);
  importNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmImport();
  });

  btnSetupBack.addEventListener('click', () => {
    activeBankId = null;
    showView('home');
    renderBankList();
  });

  btnStart.addEventListener('click', () => {
    const bank = getActiveBank();
    if (!bank) return;
    startQuiz({
      mode: getSelectedMode(),
      count: parseInt(quizCountInput.value, 10)
    });
  });

  btnOpenWrongs.addEventListener('click', () => {
    if (!activeBankId) return;
    openWrongs(activeBankId);
  });

  btnWrongsBack.addEventListener('click', () => {
    if (activeBankId) openSetup(activeBankId);
    else showView('home');
  });

  btnPracticeWrongs.addEventListener('click', () => {
    startQuiz({ mode: 'wrong' });
  });

  btnClearWrongs.addEventListener('click', clearAllWrongs);

  btnSubmit.addEventListener('click', submitAnswer);
  btnNext.addEventListener('click', goNext);

  btnQuit.addEventListener('click', () => {
    if (!confirm('确定退出本次答题？已产生的错题已保存到该题库错题本。')) return;
    renderBankList();
    if (activeBankId) openSetup(activeBankId);
    else showView('home');
  });

  btnRetryWrong.addEventListener('click', () => {
    const bank = getActiveBank();
    if (!bank) return;
    // 优先练本次会话错题；否则练题库错题本
    const source = sessionWrongList.length
      ? sessionWrongList.map((w) => w.question || w)
      : bank.wrongList.map((w) => w.question || w);
    startQuiz({ mode: 'wrong', source });
  });

  btnRestart.addEventListener('click', () => {
    if (!getActiveBank()) {
      showView('home');
      return;
    }
    if (quizSource === 'wrong') {
      startQuiz({ mode: 'wrong' });
    } else {
      startQuiz({
        mode: lastQuizOptions.mode,
        count: lastQuizOptions.count
      });
    }
  });

  btnBackHome.addEventListener('click', () => {
    activeBankId = null;
    renderBankList();
    showView('home');
  });

  // -------------------- 启动 --------------------
  loadAll();
  renderBankList();
  showView('home');

  /**
   * @typedef {Object} Question
   * @property {string} id
   * @property {string} title
   * @property {{A:string,B:string,C:string,D:string}} options
   * @property {string} answer
   * @property {string} explain
   * @property {'single'|'multiple'|'judge'} type
   */

  /**
   * @typedef {Object} WrongRecord
   * @property {string} id
   * @property {string} title
   * @property {'single'|'multiple'|'judge'} type
   * @property {string} [userAnswer]
   * @property {string} answer
   * @property {string} [explain]
   * @property {Question} [question]
   */

  /**
   * @typedef {Object} Bank
   * @property {string} id
   * @property {string} name
   * @property {string} fileName
   * @property {Question[]} questions
   * @property {WrongRecord[]} wrongList
   * @property {number} createdAt
   */
})();
