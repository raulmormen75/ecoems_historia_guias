const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT_FILE = path.join(ROOT, 'historia-data.js');

const GUIDE_FILES = [
  { id: 'guia-1', name: 'Guía 1', fileHint: '1' },
  { id: 'guia-2', name: 'Guía 2', fileHint: '2' }
];

const SECTION_LABELS = [
  'tematica del ejercicio',
  'reactivo',
  'fuente',
  'planteamiento del problema',
  'opciones',
  'que pide resolver el ejercicio',
  'desarrollo y descarte de opciones',
  'desarrollo y evaluacion de opciones',
  'opcion correcta',
  'argumento',
  'pista'
];

const VERIFIED_OVERRIDES = {
  'guia-1-56': {
    options: {
      A: 'la consolidación del Imperio austrohúngaro.'
    },
    audit: {
      sourceObservations: [
        'La opción A fue verificada contra la Guía.pdf y se normalizó la separación tipográfica en «austrohúngaro».'
      ]
    }
  },
  'guia-2-54': {
    audit: {
      sourceObservations: [
        'La opción E fue verificada contra la Guía 2.pdf y se conserva como «Diderot y Payne».'
      ]
    }
  },
  'guia-2-58': {
    options: {
      A: 'I, II, III y IV'
    },
    audit: {
      textIssues: [
        'El txt incluía una nota editorial incrustada en la opción A.'
      ],
      sourceObservations: [
        'La combinación de la opción A se verificó contra la Guía 2.pdf y la nota editorial se movió a auditoría.'
      ]
    }
  },
  'guia-2-60': {
    options: {
      A: 'I y III',
      C: 'II y IV'
    },
    audit: {
      textIssues: [
        'El txt traía la opción A truncada y la opción C con una nota editorial.'
      ],
      sourceObservations: [
        'Las opciones del reactivo 60 se reconstruyeron con base en la Guía 2.pdf, página 23.'
      ]
    }
  },
  'guia-2-62': {
    audit: {
      sourceObservations: [
        'Las combinaciones de respuesta se verificaron contra la Guía 2.pdf, página 24.'
      ]
    }
  }
};

function toMexicoTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function stripReferences(text) {
  return String(text || '')
    .replace(/\uFEFF/g, '')
    .replace(/:contentReference\[[^\]]+\]\{[^}]+\}/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\u00a0/g, ' ');
}

function cleanInline(text) {
  return stripReferences(String(text || '').replace(/\r/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLabel(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/:+$/, '');
}

function normalizeForToken(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(text) {
  return normalizeForToken(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && !cleanInline(lines[start])) start += 1;
  while (end > start && !cleanInline(lines[end - 1])) end -= 1;

  return lines.slice(start, end);
}

function joinLines(lines) {
  return trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTags(topic) {
  const tokens = normalizeForToken(topic)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 2)
    .slice(0, 6);

  return Array.from(new Set([slugify(topic), ...tokens]));
}

function findGuideFile(fileHint) {
  const entry = fs.readdirSync(ROOT).find((name) => {
    const normalized = normalizeForToken(name);
    return normalized.endsWith('.txt') && normalized.includes(`guia ${fileHint}`);
  });

  if (!entry) {
    throw new Error(`No se encontró un archivo .txt para la guía ${fileHint}.`);
  }

  return path.join(ROOT, entry);
}

function splitExerciseBlocks(rawText) {
  const lines = stripReferences(rawText).replace(/\r\n/g, '\n').split('\n');
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (normalizeLabel(lines[index]).startsWith('tematica del ejercicio')) {
      starts.push(index);
    }
  }

  return starts
    .map((startIndex, index) => {
      const endIndex = index + 1 < starts.length ? starts[index + 1] : lines.length;
      return lines.slice(startIndex, endIndex);
    })
    .filter((block) => block.some((line) => normalizeLabel(line).startsWith('reactivo')));
}

function validateBlock(blockLines, guideName) {
  const normalizedLines = blockLines.map((line) => normalizeLabel(line));

  for (const label of SECTION_LABELS) {
    if (
      label === 'desarrollo y descarte de opciones' ||
      label === 'desarrollo y evaluacion de opciones'
    ) {
      continue;
    }

    const found = normalizedLines.some((line) => line.startsWith(label));
    if (!found) {
      throw new Error(`Falta la sección "${label}" en un bloque de ${guideName}.`);
    }
  }

  const hasDevelopment = normalizedLines.some(
    (line) =>
      line.startsWith('desarrollo y descarte de opciones') ||
      line.startsWith('desarrollo y evaluacion de opciones')
  );

  if (!hasDevelopment) {
    throw new Error(`Falta la sección de desarrollo de opciones en un bloque de ${guideName}.`);
  }
}

function findSectionIndex(lines, label) {
  return lines.findIndex((line) => normalizeLabel(line).startsWith(label));
}

function extractSection(lines, startLabel, endLabels) {
  const startIndex = findSectionIndex(lines, startLabel);
  if (startIndex === -1) return [];

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const normalized = normalizeLabel(lines[index]);
    if (endLabels.some((label) => normalized.startsWith(label))) {
      endIndex = index;
      break;
    }
  }

  const collected = [];
  const startLine = stripReferences(String(lines[startIndex] || '')).replace(/\r/g, '');
  const separatorIndex = startLine.indexOf(':');
  if (separatorIndex >= 0) {
    const inline = cleanInline(startLine.slice(separatorIndex + 1));
    if (inline) collected.push(inline);
  }

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    collected.push(String(lines[index] || ''));
  }

  return trimBlankLines(collected).filter((line) => cleanInline(line) !== '---');
}

function splitQuestionAndStimulus(lines) {
  const cleaned = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---');

  const romanStart = cleaned.findIndex((line) => /^[IVXLCDM]+\.\s*/.test(line));
  if (romanStart === -1) {
    return {
      questionLines: cleaned,
      stimulus: {
        leadLines: cleaned,
        romanStatements: [],
        sourceNotes: []
      }
    };
  }

  const leadLines = cleaned.slice(0, romanStart);
  const romanStatements = cleaned.slice(romanStart);

  return {
    questionLines: leadLines,
    stimulus: {
      leadLines,
      romanStatements,
      sourceNotes: []
    }
  };
}

function parseOptions(lines) {
  const options = [];
  let current = null;

  for (const rawLine of trimBlankLines(lines)) {
    const line = cleanInline(rawLine);
    if (!line || line === '---') continue;

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      if (current) options.push(current);
      current = {
        label: match[1],
        text: cleanInline(match[2])
      };
      continue;
    }

    if (current) {
      current.text = cleanInline(`${current.text} ${line}`);
    }
  }

  if (current) options.push(current);
  return options;
}

function splitDevelopment(lines) {
  const cleaned = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---');

  const firstOptionIndex = cleaned.findIndex((line) => /^[A-E]\)\s*/.test(line));
  if (firstOptionIndex === -1) {
    return {
      analysisPrelude: joinLines(cleaned),
      optionLines: []
    };
  }

  return {
    analysisPrelude: joinLines(cleaned.slice(0, firstOptionIndex)),
    optionLines: cleaned.slice(firstOptionIndex)
  };
}

function parseOptionsAnalysis(optionLines, optionMap) {
  const items = [];
  let current = null;
  let started = false;

  for (const rawLine of optionLines) {
    const line = cleanInline(rawLine);
    if (!line || line === '---') {
      if (current && current.lines[current.lines.length - 1] !== '') {
        current.lines.push('');
      }
      continue;
    }

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      started = true;
      if (current) items.push(current);
      current = {
        label: match[1],
        option: optionMap.get(match[1]) || cleanInline(match[2]),
        lines: []
      };
      continue;
    }

    if (started && current) {
      current.lines.push(line);
    }
  }

  if (current) items.push(current);

  return items.map((item) => ({
    label: item.label,
    option: item.option,
    text: joinLines(item.lines)
  }));
}

function parseCorrectOption(lines, optionMap) {
  const firstLine = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .find(Boolean);

  if (!firstLine) {
    throw new Error('No se encontró una opción correcta visible en el bloque.');
  }

  const match = firstLine.match(/^([A-E])\)\s*(.*)$/);
  if (!match) {
    throw new Error(`No se pudo interpretar la opción correcta: "${firstLine}".`);
  }

  const label = match[1];
  return {
    label,
    text: optionMap.get(label) || cleanInline(match[2])
  };
}

function mergeAudit(baseAudit, overrideAudit) {
  const merged = {
    textIssues: [...(baseAudit.textIssues || []), ...(overrideAudit.textIssues || [])],
    requiresSourceCheck: Boolean(baseAudit.requiresSourceCheck || overrideAudit.requiresSourceCheck),
    sourceObservations: [
      ...(baseAudit.sourceObservations || []),
      ...(overrideAudit.sourceObservations || [])
    ]
  };

  return merged;
}

function detectReactiveType(question, stimulus, options) {
  if (stimulus.romanStatements.length) return 'roman-combination';
  if (question.includes('______')) return 'fill-blank';

  const optionTexts = options.map((option) => option.text);
  const combinedText = optionTexts.filter((text) => /\s+y\s+|,/.test(text)).length;

  if (combinedText >= Math.max(2, Math.floor(options.length / 2))) {
    return 'text-combination';
  }

  return options.length === 5 ? 'multiple-choice-5' : 'multiple-choice-4';
}

function getDescriptorVisual(reactiveType, stimulus) {
  if (reactiveType === 'roman-combination') {
    return 'Lista previa con numerales romanos y combinaciones de respuesta.';
  }

  if (reactiveType === 'text-combination') {
    return 'Opciones compuestas que combinan procesos, hechos o factores históricos.';
  }

  if (stimulus.leadLines.length > 1) {
    return 'Bloque textual previo que conviene leerse como apoyo del reactivo.';
  }

  return null;
}

function applyVerifiedOverrides(guideId, number, exercise, rawOptionMap) {
  const key = `${guideId}-${number}`;
  const override = VERIFIED_OVERRIDES[key];
  if (!override) return exercise;

  const nextExercise = { ...exercise };

  if (override.options) {
    nextExercise.options = nextExercise.options.map((option) => {
      const text = override.options[option.label];
      return text ? { ...option, text } : option;
    });

    nextExercise.correctOption = {
      ...nextExercise.correctOption,
      text: override.options[nextExercise.correctOption.label] || nextExercise.correctOption.text
    };

    nextExercise.optionsAnalysis = nextExercise.optionsAnalysis.map((item) => ({
      ...item,
      option: override.options[item.label] || item.option
    }));
  }

  const baseAudit = nextExercise.audit || {
    textIssues: [],
    requiresSourceCheck: false,
    sourceObservations: []
  };

  nextExercise.audit = mergeAudit(baseAudit, override.audit || {});

  if (key === 'guia-2-58' && rawOptionMap.A) {
    nextExercise.audit.sourceObservations.push(`Texto original en txt para A: "${rawOptionMap.A}"`);
  }

  if (key === 'guia-2-60') {
    nextExercise.audit.sourceObservations.push('La lectura final de opciones quedó: A) I y III, B) I y V, C) II y IV, D) II y V, E) IV y V.');
  }

  return nextExercise;
}

function parseExercise(blockLines, guide, order) {
  validateBlock(blockLines, guide.name);

  const topic = joinLines(extractSection(blockLines, 'tematica del ejercicio', ['reactivo']));
  const numberText = joinLines(extractSection(blockLines, 'reactivo', ['fuente', 'planteamiento del problema']));
  const number = Number(numberText);

  if (!Number.isFinite(number)) {
    throw new Error(`No se pudo leer el número de reactivo para ${guide.name}.`);
  }

  const sourceSection = extractSection(blockLines, 'fuente', ['planteamiento del problema']);
  const source = cleanInline(sourceSection[0] || '');
  const sourceNotes = sourceSection.slice(1).map((line) => cleanInline(line)).filter(Boolean);

  const questionSection = extractSection(blockLines, 'planteamiento del problema', ['opciones']);
  const { questionLines, stimulus } = splitQuestionAndStimulus(questionSection);

  const optionsSection = extractSection(blockLines, 'opciones', ['que pide resolver el ejercicio']);
  const options = parseOptions(optionsSection);
  const rawOptionMap = Object.fromEntries(options.map((option) => [option.label, option.text]));
  const optionMap = new Map(options.map((option) => [option.label, option.text]));

  const whatToSolve = joinLines(
    extractSection(blockLines, 'que pide resolver el ejercicio', [
      'desarrollo y descarte de opciones',
      'desarrollo y evaluacion de opciones'
    ])
  );

  const developmentLabel = blockLines.some((line) =>
    normalizeLabel(line).startsWith('desarrollo y evaluacion de opciones')
  )
    ? 'desarrollo y evaluacion de opciones'
    : 'desarrollo y descarte de opciones';

  const developmentSection = extractSection(blockLines, developmentLabel, ['opcion correcta']);
  const { analysisPrelude, optionLines } = splitDevelopment(developmentSection);
  const optionsAnalysis = parseOptionsAnalysis(optionLines, optionMap);
  const correctOption = parseCorrectOption(extractSection(blockLines, 'opcion correcta', ['argumento']), optionMap);
  const argument = joinLines(extractSection(blockLines, 'argumento', ['pista']));
  const hint = joinLines(extractSection(blockLines, 'pista', []));

  let exercise = {
    id: `${guide.id.replace('guia-', 'g')}-r${number}`,
    guideId: guide.id,
    guideName: guide.name,
    number,
    order,
    sourceOrder: order,
    source,
    topic,
    topicId: slugify(topic),
    question: questionLines.join('\n'),
    questionLines,
    stimulus: {
      ...stimulus,
      sourceNotes
    },
    options,
    correctOption,
    hint,
    whatToSolve,
    analysisPrelude,
    optionsAnalysis,
    argument,
    reactiveType: detectReactiveType(questionLines.join('\n'), stimulus, options),
    descriptorVisual: null,
    visualSpec: null,
    audit: {
      textIssues: [],
      requiresSourceCheck: false,
      sourceObservations: []
    },
    tags: buildTags(topic)
  };

  exercise.descriptorVisual = getDescriptorVisual(exercise.reactiveType, exercise.stimulus);
  exercise = applyVerifiedOverrides(guide.id, number, exercise, rawOptionMap);

  return exercise;
}

function buildGuideData(guide) {
  const sourceFile = findGuideFile(guide.fileHint);
  const rawText = fs.readFileSync(sourceFile, 'utf8');
  const blocks = splitExerciseBlocks(rawText);
  const exercises = blocks.map((block, index) => parseExercise(block, guide, index + 1));

  if (exercises.length !== 12) {
    throw new Error(`${guide.name} debe contener 12 reactivos y se detectaron ${exercises.length}.`);
  }

  const expectedNumbers = Array.from({ length: 12 }, (_, index) => 53 + index);
  const actualNumbers = exercises.map((exercise) => exercise.number);

  if (expectedNumbers.join(',') !== actualNumbers.join(',')) {
    throw new Error(
      `${guide.name} no conserva el orden esperado 53-64. Obtenido: ${actualNumbers.join(', ')}`
    );
  }

  return {
    id: guide.id,
    name: guide.name,
    exerciseCount: exercises.length,
    exercises
  };
}

function buildTopics(guides) {
  const topicMap = new Map();

  for (const guide of guides) {
    for (const exercise of guide.exercises) {
      if (!topicMap.has(exercise.topicId)) {
        topicMap.set(exercise.topicId, {
          id: exercise.topicId,
          name: exercise.topic,
          exerciseCount: 0,
          guides: new Set()
        });
      }

      const entry = topicMap.get(exercise.topicId);
      entry.exerciseCount += 1;
      entry.guides.add(guide.id);
    }
  }

  return Array.from(topicMap.values()).map((topic) => ({
    id: topic.id,
    name: topic.name,
    exerciseCount: topic.exerciseCount,
    guides: Array.from(topic.guides)
  }));
}

function buildAppData() {
  const guides = GUIDE_FILES.map(buildGuideData);
  const topics = buildTopics(guides);
  const totalExercises = guides.reduce((sum, guide) => sum + guide.exerciseCount, 0);

  if (totalExercises !== 24) {
    throw new Error(`Se esperaban 24 reactivos y se obtuvieron ${totalExercises}.`);
  }

  return {
    meta: {
      title: 'Instituto Fernando Ramírez · ECOEMS Historia',
      subject: 'Historia',
      version: '1.0.0',
      generatedAt: toMexicoTimestamp(),
      totalExercises,
      topicCount: topics.length
    },
    topics,
    guides
  };
}

function writeOutput() {
  const data = buildAppData();
  const content = `window.IFR_APP_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  return data;
}

if (require.main === module) {
  const data = writeOutput();
  console.log(`Archivo generado: ${path.basename(OUTPUT_FILE)}`);
  console.log(`Reactivos generados: ${data.meta.totalExercises}`);
  console.log(`Temas detectados: ${data.meta.topicCount}`);
}

module.exports = {
  buildAppData,
  writeOutput
};
