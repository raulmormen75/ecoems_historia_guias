(() => {
  const DATA = window.IFR_APP_DATA || { meta: {}, topics: [], guides: [] };
  const GUIDES = DATA.guides || [];
  const TOPICS = DATA.topics || [];
  const GUIDE_ORDER = Object.fromEntries(GUIDES.map((guide, index) => [guide.id, index]));
  const STATE = { guide: 'all', topic: 'all' };
  const CARD_STATE = {};

  const GUIDE_TEXT = {
    'guia-1': 'Primera guía con reactivos del 53 al 64 y cuatro opciones por ejercicio.',
    'guia-2': 'Segunda guía con reactivos del 53 al 64 y cinco opciones por ejercicio.'
  };

  const byId = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function paragraphs(text) {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) return '';

    return `<div class="text">${blocks
      .map((block) => block.split('\n').map((line) => `<p>${esc(line)}</p>`).join(''))
      .join('')}</div>`;
  }

  function questionMarkup(lines) {
    return `<div class="question">${(Array.isArray(lines) ? lines : [])
      .filter(Boolean)
      .map((line) => `<p>${esc(line)}</p>`)
      .join('')}</div>`;
  }

  const EXERCISES = GUIDES.flatMap((guide) =>
    (guide.exercises || []).map((exercise) => ({
      ...exercise,
      guideOrder: GUIDE_ORDER[guide.id] || 0,
      searchIndex: normalizeText([
        exercise.guideName,
        exercise.number,
        exercise.topic,
        exercise.question,
        exercise.hint,
        exercise.whatToSolve,
        exercise.argument,
        exercise.analysisPrelude,
        ...(exercise.stimulus?.romanStatements || []),
        ...(exercise.options || []).map((option) => option.text)
      ].join(' '))
    }))
  );

  function cardState(exerciseId) {
    if (!CARD_STATE[exerciseId]) {
      CARD_STATE[exerciseId] = {
        status: 'idle',
        selectedOption: '',
        hintOpen: false
      };
    }

    return CARD_STATE[exerciseId];
  }

  function matches() {
    return EXERCISES.filter((exercise) => {
      if (STATE.guide !== 'all' && exercise.guideId !== STATE.guide) return false;
      if (STATE.topic !== 'all' && exercise.topicId !== STATE.topic) return false;
      return true;
    }).sort((left, right) => {
      if (left.guideOrder !== right.guideOrder) return left.guideOrder - right.guideOrder;
      return left.sourceOrder - right.sourceOrder;
    });
  }

  function distinct(exercises, field) {
    return new Set(exercises.map((exercise) => exercise[field])).size;
  }

  function chip(label, active, action, data = {}) {
    const attrs = Object.entries(data)
      .map(([key, value]) => ` ${key}="${esc(value)}"`)
      .join('');
    return `<button class="chip${active ? ' active' : ''}" type="button" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
  }

  function selectionState(exercise) {
    const state = cardState(exercise.id);
    return {
      selected: state.selectedOption || '',
      correct: exercise.correctOption?.label || '',
      status: state.status
    };
  }

  function optionTone(exercise, option) {
    const { selected, status } = selectionState(exercise);

    if (status === 'idle') {
      return { tone: '', label: 'Selecciona', disabled: false };
    }

    if (status === 'wrong') {
      return {
        tone: option.label === selected ? ' is-wrong' : ' is-locked',
        label: option.label === selected ? 'Incorrecta' : 'Bloqueada',
        disabled: true
      };
    }

    if (status === 'correct') {
      return {
        tone: option.label === selected ? ' is-correct' : ' is-locked',
        label: option.label === selected ? 'Correcta' : 'Bloqueada',
        disabled: true
      };
    }

    return { tone: '', label: 'Selecciona', disabled: false };
  }

  function optionList(exercise) {
    return `<div class="opts">${(exercise.options || [])
      .map((option) => {
        const state = optionTone(exercise, option);
        return `<button class="opt${state.tone}" type="button" data-action="pick-option" data-id="${esc(exercise.id)}" data-option="${esc(option.label)}"${state.disabled ? ' disabled' : ''}>
          <div class="row">
            <span class="let">${esc(option.label)}</span>
            <span class="lab">${esc(state.label)}</span>
          </div>
          <div class="opt-text">${esc(option.text)}</div>
        </button>`;
      })
      .join('')}</div>`;
  }

  function retryButton(exercise) {
    const { status } = selectionState(exercise);
    if (status !== 'wrong') return '';
    return `<button class="action retry-action" type="button" data-action="retry-option" data-id="${esc(exercise.id)}">Reintentar</button>`;
  }

  function hintButton(exerciseId) {
    const open = cardState(exerciseId).hintOpen;
    return `<button class="action hint-action${open ? ' open' : ''}" type="button" data-action="toggle-hint" data-id="${esc(exerciseId)}">${open ? 'Ocultar pista' : 'Ver pista'}</button>`;
  }

  function attemptMessage(exercise) {
    const { status } = selectionState(exercise);

    if (status === 'wrong') {
      return `<section class="attempt-state warning">
        <div class="meta">Intenta de nuevo</div>
        <p>Revisa la pista y vuelve a intentarlo 🧠</p>
      </section>`;
    }

    if (status === 'correct') {
      return `<section class="attempt-state success">
        <div class="meta">Acierto confirmado</div>
        <p>Bien resuelto ✅ Ahora revisa por qué las demás no corresponden.</p>
      </section>`;
    }

    return '';
  }

  function analysisCard(item, compact = false) {
    return `<article class="analysis${compact ? ' compact' : ''}">
      <div class="analysis-head">
        <span class="badge">${esc(item.label)}</span>
        <span>${esc(item.option || `Opción ${item.label}`)}</span>
      </div>
      ${paragraphs(item.text)}
    </article>`;
  }

  function renderStimulus(exercise) {
    const romanStatements = exercise.stimulus?.romanStatements || [];
    if (!romanStatements.length) return '';

    return `<section class="stimulus-panel" data-reactive-type="${esc(exercise.reactiveType)}">
      <div class="meta">Enunciados del reactivo</div>
      <div class="stimulus-list">
        ${romanStatements.map((statement) => `<article class="stimulus-item"><p>${esc(statement)}</p></article>`).join('')}
      </div>
    </section>`;
  }

  function solvedNarrative(exercise) {
    return [exercise.analysisPrelude, exercise.argument].filter(Boolean).join('\n\n');
  }

  function solvedContent(exercise) {
    const { status, correct } = selectionState(exercise);
    if (status !== 'correct') return '';

    const correctAnalysis = (exercise.optionsAnalysis || []).find((item) => item.label === correct);
    const wrongAnalyses = (exercise.optionsAnalysis || []).filter((item) => item.label !== correct);
    const narrative = solvedNarrative(exercise);

    return `<section class="feedback-stack">
      ${exercise.whatToSolve ? `
        <article class="support solved-panel">
          <div class="meta">Qué pide resolver</div>
          ${paragraphs(exercise.whatToSolve)}
        </article>
      ` : ''}
      ${correctAnalysis ? `
        <article class="support solved-panel final">
          <div class="meta">Por qué la correcta sí corresponde</div>
          ${analysisCard(correctAnalysis, true)}
        </article>
      ` : ''}
      ${wrongAnalyses.length ? `
        <article class="support solved-panel">
          <div class="meta">Por qué las demás no corresponden</div>
          <div class="analysis-grid">${wrongAnalyses.map((item) => analysisCard(item)).join('')}</div>
        </article>
      ` : ''}
      ${narrative ? `
        <article class="support solved-panel">
          <div class="meta">Análisis del reactivo</div>
          ${paragraphs(narrative)}
        </article>
      ` : ''}
    </section>`;
  }

  function card(exercise) {
    return `<article class="card" id="reactivo-${esc(exercise.id)}">
      <div class="head">
        <div>
          <div class="type">${esc(`${exercise.guideName} · Reactivo ${exercise.number}`)}</div>
          <h3>${esc(exercise.topic)}</h3>
        </div>
      </div>
      <div class="layout">
        <div class="block question-block">
          <div class="problem-head">
            <div class="meta">Pregunta</div>
            <span class="reactivo-chip">${esc(`${exercise.options.length} opciones`)}</span>
          </div>
          ${questionMarkup(exercise.questionLines)}
          ${renderStimulus(exercise)}
        </div>
        <div class="block">
          <div class="problem-head">
            <div class="meta">Opciones</div>
          </div>
          ${optionList(exercise)}
        </div>
      </div>
      <div class="actions act">
        ${retryButton(exercise)}
        ${hintButton(exercise.id)}
      </div>
      ${attemptMessage(exercise)}
      <section class="support hint"${cardState(exercise.id).hintOpen ? '' : ' hidden'}>
        <div class="meta">Pista</div>
        ${paragraphs(exercise.hint)}
      </section>
      ${solvedContent(exercise)}
    </article>`;
  }

  function guideSection(guide, exercises) {
    if (!exercises.length) return '';

    return `<section class="section">
      <header class="section-head">
        <div>
          <h2>${esc(guide.name)}</h2>
          <p>${esc(GUIDE_TEXT[guide.id] || 'Consulta los reactivos de esta guía sin alterar su secuencia original.')}</p>
        </div>
        <span class="count">${esc(String(exercises.length))} reactivos</span>
      </header>
      <div class="cards">${exercises.map(card).join('')}</div>
    </section>`;
  }

  function renderGuideChips() {
    return [
      chip('Todas las guías', STATE.guide === 'all', 'guide', { 'data-guide': 'all' }),
      ...GUIDES.map((guide) => chip(guide.name, STATE.guide === guide.id, 'guide', { 'data-guide': guide.id }))
    ].join('');
  }

  function renderTopicChips(list) {
    const visibleTopics = TOPICS.filter((topic) => list.some((exercise) => exercise.topicId === topic.id) || STATE.topic === topic.id);

    return [
      chip('Todos los temas', STATE.topic === 'all', 'topic', { 'data-topic': 'all' }),
      ...visibleTopics.map((topic) =>
        chip(`${topic.name} (${topic.exerciseCount})`, STATE.topic === topic.id, 'topic', { 'data-topic': topic.id })
      )
    ].join('');
  }

  function renderMetrics(list) {
    return [
      { value: list.length, label: 'Reactivos visibles' },
      { value: distinct(list, 'guideId'), label: 'Guías activas' },
      { value: distinct(list, 'topicId'), label: 'Temas activos' }
    ].map((item) => `<div><b>${esc(String(item.value))}</b><span>${esc(item.label)}</span></div>`).join('');
  }

  function render() {
    const list = matches();

    byId('topStats').textContent = `Visibles: ${list.length} | Guías: ${distinct(list, 'guideId')} | Temas: ${distinct(list, 'topicId')}`;
    byId('guideChips').innerHTML = renderGuideChips();
    byId('topicChips').innerHTML = renderTopicChips(list);
    byId('metrics').innerHTML = renderMetrics(list);

    if (!list.length) {
      byId('content').innerHTML = '';
      byId('empty').hidden = false;
      return;
    }

    byId('empty').hidden = true;

    byId('content').innerHTML = GUIDES
      .map((guide) => guideSection(guide, list.filter((exercise) => exercise.guideId === guide.id)))
      .join('');
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]');
    if (!node) return;

    const action = node.dataset.action;

    if (action === 'guide') {
      STATE.guide = node.dataset.guide || 'all';
      render();
      return;
    }

    if (action === 'topic') {
      STATE.topic = node.dataset.topic || 'all';
      render();
      return;
    }

    if (action === 'pick-option') {
      const exerciseId = node.dataset.id;
      const option = node.dataset.option || '';
      const exercise = EXERCISES.find((item) => item.id === exerciseId);

      if (!exerciseId || !option || !exercise) return;

      const state = cardState(exerciseId);
      if (state.status !== 'idle') return;

      state.selectedOption = option;
      const solved = option === exercise.correctOption?.label;
      state.status = solved ? 'correct' : 'wrong';
      render();

      if (solved) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const target = cardNode?.querySelector('.feedback-stack');
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return;
    }

    if (action === 'retry-option') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;

      const state = cardState(exerciseId);
      state.status = 'idle';
      state.selectedOption = '';
      render();

      window.requestAnimationFrame(() => {
        const cardNode = document.getElementById(`reactivo-${exerciseId}`);
        const promptNode = cardNode?.querySelector('.question-block');
        promptNode?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (action === 'toggle-hint') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;

      const state = cardState(exerciseId);
      state.hintOpen = !state.hintOpen;
      render();

      if (state.hintOpen) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const hintNode = cardNode?.querySelector('.support.hint');
          hintNode?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  });

  const toTop = byId('toTop');
  const syncTop = () => toTop.classList.toggle('show', window.scrollY > 260);

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', syncTop, { passive: true });
  window.addEventListener('load', syncTop);

  render();
  syncTop();
})();
