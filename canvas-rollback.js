'use strict';

/*
 * Симуляция неподвижной чёрной дыры в метрике Шварцшильда.
 *
 * Физика:
 *   - Гравитационное замедление времени для неподвижного наблюдателя на
 *     координатном радиусе r:  dτ/dt = sqrt(1 - rs/r)   (точная формула ОТО).
 *     Именно этим множителем масштабируется локальная частота пульсации точек.
 *   - Гравитационное красное смещение статического источника для удалённого
 *     наблюдателя описывается тем же множителем sqrt(1 - rs/r) — поэтому цвет
 *     и замедление пульсации завязаны на одну и ту же величину D(r).
 *   - Искривление пространства визуализируется через точный интеграл
 *     собственного радиального расстояния (парабола Фламма):
 *       dL/dr = 1/sqrt(1 - rs/r)
 *       L(r)  = sqrt(r(r-rs)) + rs*ln( (sqrt(r)+sqrt(r-rs)) / sqrt(rs) )
 *     Точки размещаются РАВНОМЕРНО по видимой площади экрана (иначе при малой
 *     массе — маленьком Rs — растяжение сильно разрежает точки у горизонта, и
 *     там образуется пустое кольцо), а их истинная координата r восстанав-
 *     ливается обратной (численной) функцией от видимого радиуса. Кольца
 *     сетки, наоборот, размещаются по формуле L(r) от равномерно расставленных
 *     по r колец — так на них видно само растяжение пространства.
 *
 * Радиус горизонта в пикселях — величина визуализации (масштаб «камеры»),
 * управляемая ползунком массы. Отношение r/rs, единственное, что реально
 * входит в формулы ОТО, при этом остаётся физически корректным.
 *
 * Положение, фаза и размер точек фиксируются один раз при генерации
 * (generatePoints) и меняются только при смене плотности или типа
 * распределения. Масса, частота и яркость влияют лишь на физику уже
 * существующих точек (recomputePhysics) — точки не "прыгают" при
 * движении соответствующих ползунков.
 *
 *   - Опционально (чекбокс) форма точки растягивается вдоль радиуса
 *     множителем sqrt(g_rr) = 1/sqrt(1-rs/r) — тем же точным метрическим
 *     коэффициентом, что определяет разницу собственной и координатной
 *     длины (см. dL/dr выше). Это честная визуализация приливного эффекта,
 *     а не декоративное приближение; пересчитывается вместе с остальной
 *     физикой в recomputePhysics(), без изменения позиции/фазы точки.
 */

(() => {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  const G = 6.674e-11;
  const C = 299792458;
  const M_SUN = 1.98847e30;
  const TWO_PI = Math.PI * 2;

  // ---- Локализация ------------------------------------------------------
  // Двуязычный (en/ru) словарь. Английский — язык по умолчанию; русский
  // включается только если браузер явно сообщает русскую локаль. Статический
  // текст размечен атрибутами data-i18n/data-i18n-placeholder в index.html и
  // проставляется один раз при старте (applyStaticTranslations); динамические
  // строки (readout'ы, статистика, тултип, подсказки кнопок) собираются из
  // переведённых фрагментов через t() там, где формируются.
  function detectLang() {
    const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (const l of langs) {
      if (typeof l === 'string' && l.toLowerCase().startsWith('ru')) return 'ru';
    }
    return 'en';
  }
  // Язык — либо ручной выбор пользователя (els.langSelect, персистится как
  // обычная настройка), либо (при значении "auto") определяется по локали
  // браузера заново при каждом обращении. currentLang() — единственный
  // источник истины, читается везде вместо статической константы, поэтому
  // переключение языка в настройках работает без перезагрузки страницы.
  function currentLang() {
    const v = els.langSelect ? els.langSelect.value : 'auto';
    return v === 'ru' || v === 'en' ? v : detectLang();
  }
  function localeTag() {
    return currentLang() === 'ru' ? 'ru-RU' : 'en-US';
  }

  const I18N = {
    en: {
      pageTitle: 'Schwarzschild Black Hole — gravitational time dilation',
      h1: 'Schwarzschild Black Hole',
      introToggle: 'About this simulation',
      introText: 'Points are stationary "beacons" around the black hole. Their pulsing slows down and reddens near the event horizon due to gravitational time dilation and gravitational redshift (Schwarzschild metric, exact formulas). Points can optionally stretch toward the horizon — the exact tidal-stretch factor 1/√(1-Rs/r). Mouse wheel — zoom, drag — pan, double-click — recenter (without resetting zoom). In signal mode, clicking the field launches a wave spreading from the click point: watch it lag and distort near the horizon.',
      group_simulation: 'Simulation',
      mass_label: 'Black hole mass',
      freq_label: 'Base pulse frequency (far from the BH)',
      density_label: 'Point density',
      tidalStretch_label: 'GR point stretching (spatial curvature)',
      stretchInfoToggle_label: 'What does this show?',
      stretchInfo_text: 'This is the exact Schwarzschild metric factor 1/√(1−Rs/r) — how much more "proper" (actually measured) radial distance there is near the horizon than the flat coordinate grid suggests. It\'s a real, exact quantity, but stretching a point\'s shape by it is a visualization trick: a single point has no size of its own to stretch, so this makes an otherwise invisible fact about curved space visible rather than showing something you\'d literally see happen to a small object. In plain language: space itself is stretched near a black hole, so a tape measure laid toward the horizon would read a longer length than the map distance implies — the elongated dots are a way to draw that stretch.',
      stretchCoefficient_label: 'Stretch coefficient',
      stretchDirection_label: 'Stretch direction',
      stretchDirection_toward: 'Toward the black hole only',
      stretchDirection_both: 'Symmetric (both directions)',
      tidalCompress_label: 'Tidal compression (perpendicular to radius)',
      compressInfoToggle_label: 'What does this show?',
      compressInfo_text: 'This visualizes the real tidal force from the Schwarzschild geodesic-deviation tensor: gravity pulls harder on the near side of an extended body than the far side, stretching it along the radius while squeezing it inward from the sides. Because the vacuum tensor is traceless, that sideways squeeze is always exactly half as strong as the radial stretch, and — unlike a purely geometric stretching of space — it stays finite right at the horizon; it only becomes destructive somewhat deeper inside. This is the same, genuinely physical effect popularly called "spaghettification": if you fell feet-first toward a black hole, gravity would stretch you head-to-toe while squeezing your sides inward, and each dot narrowing sideways is a small-scale picture of exactly that squeeze.',
      compressCoefficient_label: 'Compression coefficient',
      apparentSize_label: 'Apparent size (distant observer)',
      apparentInfoToggle_label: 'What does this show?',
      apparentInfo_text: 'This shows how an object of a fixed real (proper) size would look to a distant observer, rather than how the coordinate grid the points sit on behaves. Its radial extent shrinks by the factor D(r) = √(1−Rs/r) as it nears the horizon — the same factor that governs gravitational redshift and time dilation — while its size across the radius stays exactly the same, since the Schwarzschild angular part of the metric has no such factor. It mixes a real GR quantity with a simplified observer model (no actual ray-tracing through bent light paths), so treat it as a physically grounded approximation rather than a literal rendered photograph. In plain language: a spaceship of the same real size would look shorter — but not narrower — the closer it drifts toward a black hole, as seen from far away, and that\'s the shrinking this shows directly.',
      apparentCoefficient_label: 'Apparent-size coefficient',
      distribution_label: 'Point distribution',
      distribution_random: 'Random',
      distribution_polar: 'Grid — radial coordinates',
      distribution_cartesian: 'Grid — cartesian coordinates',
      syncMode_label: 'Sync mode (shared start phase)',
      signalMode_label: 'Signal mode (click the field to launch a wave)',
      signalMode_hint: 'Clicking inside the horizon or outside the point field stops sending the signal.',
      signalType_label: 'Signal type',
      signalType_single: 'Single',
      signalType_continuous: 'Continuous',
      signalType_count: 'Fixed number',
      signalCount_label: 'Number of signals',
      noGravity_label: 'Disable gravity (for comparison)',
      noGravity_hint: 'The BH stops affecting point phase, color, stretch, compression and apparent size — handy for comparing against the curved-space case.',
      resetPhases_label: 'Reset point phase',
      pause_label: 'Pause',
      group_display: 'Display settings',
      overallBrightness_label: 'Overall point brightness',
      brightness_label: 'Point brightness near horizon',
      colorGradient_label: 'Color transition sharpness',
      colorGradient_hint: 'Higher — points keep their original color longer and shift to the horizon color only right near it.',
      sizeMode_label: 'Point size',
      sizeMode_random: 'Random',
      sizeMode_fixed: 'Fixed',
      fixedSize_label: 'Fixed size value',
      pointShape_label: 'Point shape',
      pointShape_square: 'Square',
      pointShape_circle: 'Circle',
      zoom_label: 'Zoom (or mouse wheel)',
      group_colors: 'Colors',
      baseColor_label: 'Default point color',
      horizonAuto_label: 'Automatic Doppler shift toward horizon',
      horizonColor_label: 'Point color near horizon',
      resetPalette_label: 'Reset palette',
      paletteSelect_label: 'Saved palettes',
      paletteSelect_placeholder: '— select —',
      paletteName_label: 'New palette name',
      paletteName_placeholder: 'E.g.: Sunset',
      savePalette_label: 'Save current palette',
      deletePalette_label: 'Delete selected palette',
      group_animation: 'Animation & more',
      speed_label: 'Animation speed',
      blinkCurve_label: 'Blink curve',
      blinkCurve_sine: 'Smooth (sine)',
      blinkCurve_linear: 'Linear',
      blinkCurve_easeIn: 'Ease-in',
      blinkCurve_easeOut: 'Ease-out',
      blinkCurve_easeInOut: 'Ease-in-out',
      showGrid_label: 'Show space-curvature grid',
      showTooltip_label: 'Time-dilation tooltip at cursor',
      copySettings_label: 'Copy settings',
      resetSettings_label: 'Reset settings',
      autosaveHint: 'Settings are saved automatically.',
      gpuVersionLink: 'GPU version →',
      infoPanel_title: 'Info',
      unit_m: 'm',
      unit_km: 'km',
      unit_millionKm: 'million km',
      unit_au: 'AU',
      unit_bpmFarFromBH: 'pulses/min far from BH',
      unit_hz: 'Hz',
      unit_points: 'points',
      stats_horizon: 'Horizon on screen',
      stats_photonSphere: 'Photon sphere',
      stats_isco: 'ISCO (stable orbit)',
      stats_pointsInField: 'Points in field',
      stats_scale: 'Scale',
      tooltip_eventHorizon: 'event horizon — dτ/dt = 0',
      tooltip_timeStops: '(time stops)',
      tooltip_slowdown: 'slowdown ×',
      resetPhases_disabledTitle: 'Only available in sync mode — restarts the time-dilation wave from the start',
      resetPhases_enabledTitle: 'Reset the pulse phase of all points and restart the wave',
      copyBtn_done: 'Copied!',
      savePaletteBtn_done: 'Saved!',
      preset_violet: 'Violet',
      preset_cyan: 'Cyan',
      preset_indigo: 'Indigo',
      preset_rose: 'Rose',
      preset_mint: 'Mint',
      preset_steel: 'Steel',
      preset_teal: 'Teal',
      preset_azure: 'Azure',
      preset_slate: 'Slate',
    },
    ru: {
      pageTitle: 'Чёрная дыра Шварцшильда — гравитационное замедление времени',
      h1: 'Чёрная дыра Шварцшильда',
      introToggle: 'Об этой симуляции',
      introText: 'Точки — неподвижные «маяки» вокруг чёрной дыры. Их пульсация замедляется и краснеет вблизи горизонта событий из-за гравитационного замедления времени и гравитационного красного смещения (метрика Шварцшильда, точные формулы). Опционально точки растягиваются к горизонту — точный множитель приливного растяжения 1/√(1-Rs/r). Колесо мыши — зум, зажатая кнопка мыши — перемещение вида, двойной клик — центрировать (без сброса масштаба). В режиме отправки сигнала клик по полю запускает волну, расходящуюся от точки клика: видно, как она задерживается и искажается вблизи горизонта.',
      group_simulation: 'Симуляция',
      mass_label: 'Масса чёрной дыры',
      freq_label: 'Базовая частота пульсации (вдали от ЧД)',
      density_label: 'Плотность точек',
      tidalStretch_label: 'Растяжение точек по ОТО (кривизна пространства)',
      stretchInfoToggle_label: 'Что это показывает?',
      stretchInfo_text: 'Это точный метрический множитель Шварцшильда 1/√(1−Rs/r) — во сколько раз собственное (реально измеренное) радиальное расстояние у горизонта больше, чем предполагает плоская координатная сетка. Величина точная и настоящая, но растягивание ФОРМЫ точки по ней — визуализационный приём: у самой точки нет собственного размера, который мог бы растянуться, поэтому так делают видимым иначе невидимый факт об искривлении пространства, а не то, что буквально случилось бы с маленьким объектом. Простыми словами: пространство рядом с чёрной дырой само по себе растянуто, поэтому рулетка, протянутая к горизонту, покажет бо́льшую длину, чем расстояние на карте — вытянутые точки как раз и рисуют это растяжение.',
      stretchCoefficient_label: 'Коэффициент растяжения',
      stretchDirection_label: 'Направление растяжения',
      stretchDirection_toward: 'Только к чёрной дыре',
      stretchDirection_both: 'Симметрично (в обе стороны)',
      tidalCompress_label: 'Приливное сжатие (поперёк радиуса)',
      compressInfoToggle_label: 'Что это показывает?',
      compressInfo_text: 'Это визуализация настоящей приливной силы из тензора геодезического отклонения в метрике Шварцшильда: гравитация тянет ближнюю к чёрной дыре сторону протяжённого тела сильнее, чем дальнюю, растягивая его вдоль радиуса и одновременно сжимая с боков. Поскольку тензор в вакууме бесследовый, боковое сжатие всегда ровно вдвое слабее радиального растяжения и, в отличие от чисто геометрического растяжения пространства, остаётся конечным прямо на горизонте — разрушительным оно становится только глубже. Это тот самый, реально существующий эффект, который в народе называют «спагеттификацией»: упади вы к чёрной дыре ногами вперёд, гравитация растянула бы вас от головы до пят, одновременно сжимая с боков — сужение каждой точки поперёк и есть маленькая картинка именно этого сжатия.',
      compressCoefficient_label: 'Коэффициент сжатия',
      apparentSize_label: 'Видимый размер (удалённый наблюдатель)',
      apparentInfoToggle_label: 'Что это показывает?',
      apparentInfo_text: 'Показывает, как объект ФИКСИРОВАННОГО реального (собственного) размера выглядел бы для удалённого наблюдателя — а не то, как ведёт себя координатная сетка, на которой стоят точки. Его радиальный размер уменьшается с множителем D(r) = √(1−Rs/r) по мере приближения к горизонту — тем же самым множителем, что задаёт гравитационное красное смещение и замедление времени, — а размер поперёк радиуса не меняется вовсе, поскольку угловая часть метрики Шварцшильда такого множителя не содержит. Здесь точная величина ОТО смешана с упрощённой моделью наблюдателя (без настоящей трассировки искривлённых лучей света), так что это скорее физически обоснованное приближение, чем буквальная отрисованная фотография. Простыми словами: корабль того же реального размера выглядел бы короче — но не уже — по мере приближения к чёрной дыре, если смотреть издалека, и именно это сжатие показано здесь напрямую.',
      apparentCoefficient_label: 'Коэффициент видимого размера',
      distribution_label: 'Распределение точек',
      distribution_random: 'Случайное',
      distribution_polar: 'Сетка — радиальные координаты',
      distribution_cartesian: 'Сетка — прямоугольные координаты',
      syncMode_label: 'Синхронный режим (общая фаза старта)',
      signalMode_label: 'Режим отправки сигнала (клик по полю запускает волну)',
      signalMode_hint: 'Клик внутри горизонта или вне поля точек останавливает отправку сигнала.',
      signalType_label: 'Тип сигнала',
      signalType_single: 'Одиночный',
      signalType_continuous: 'Непрерывный',
      signalType_count: 'Фиксированное число',
      signalCount_label: 'Число сигналов',
      noGravity_label: 'Отключить тяготение (для сравнения)',
      noGravity_hint: 'ЧД перестаёт влиять на фазу, цвет, растяжение, сжатие и видимый размер точек — удобно сравнить с искривлённым случаем.',
      resetPhases_label: 'Сбросить фазу точек',
      pause_label: 'Пауза',
      group_display: 'Настройки отображения',
      overallBrightness_label: 'Общая яркость точек',
      brightness_label: 'Яркость точек у горизонта',
      colorGradient_label: 'Резкость перехода цвета',
      colorGradient_hint: 'Чем выше, тем дольше точки сохраняют исходный цвет и тем резче переходят в цвет горизонта только у самой ЧД.',
      sizeMode_label: 'Размер точек',
      sizeMode_random: 'Случайный',
      sizeMode_fixed: 'Фиксированный',
      fixedSize_label: 'Значение фиксированного размера',
      pointShape_label: 'Форма точек',
      pointShape_square: 'Квадрат',
      pointShape_circle: 'Круг',
      zoom_label: 'Масштаб (или колесо мыши)',
      group_colors: 'Цвета',
      baseColor_label: 'Цвет точек по умолчанию',
      horizonAuto_label: 'Доплеровский сдвиг к горизонту автоматически',
      horizonColor_label: 'Цвет точек у горизонта',
      resetPalette_label: 'Сбросить палитру',
      paletteSelect_label: 'Сохранённые палитры',
      paletteSelect_placeholder: '— выбрать —',
      paletteName_label: 'Название новой палитры',
      paletteName_placeholder: 'Например: Закат',
      savePalette_label: 'Сохранить текущую палитру',
      deletePalette_label: 'Удалить выбранную палитру',
      group_animation: 'Анимация и прочее',
      speed_label: 'Скорость анимации',
      blinkCurve_label: 'Кривая мерцания',
      blinkCurve_sine: 'Плавная (синус)',
      blinkCurve_linear: 'Линейная',
      blinkCurve_easeIn: 'Плавный вход',
      blinkCurve_easeOut: 'Плавный выход',
      blinkCurve_easeInOut: 'Плавный вход-выход',
      showGrid_label: 'Показать сетку искривления пространства',
      showTooltip_label: 'Подсказка замедления времени у курсора',
      copySettings_label: 'Скопировать настройки',
      resetSettings_label: 'Сбросить настройки',
      autosaveHint: 'Настройки сохраняются автоматически.',
      gpuVersionLink: 'GPU-версия →',
      infoPanel_title: 'Информация',
      unit_m: 'м',
      unit_km: 'км',
      unit_millionKm: 'млн км',
      unit_au: 'а.е.',
      unit_bpmFarFromBH: 'пульс./мин вдали от ЧД',
      unit_hz: 'Гц',
      unit_points: 'точек',
      stats_horizon: 'Горизонт на экране',
      stats_photonSphere: 'Фотонная сфера',
      stats_isco: 'ISCO (устойч. орбита)',
      stats_pointsInField: 'Точек в поле',
      stats_scale: 'Масштаб',
      tooltip_eventHorizon: 'горизонт событий — dτ/dt = 0',
      tooltip_timeStops: '(время останавливается)',
      tooltip_slowdown: 'замедление ×',
      resetPhases_disabledTitle: 'Доступно только в синхронном режиме — перезапускает волну замедления времени с начала',
      resetPhases_enabledTitle: 'Обнулить фазу пульсации всех точек и запустить волну заново',
      copyBtn_done: 'Скопировано!',
      savePaletteBtn_done: 'Сохранено!',
      preset_violet: 'Фиолетовый',
      preset_cyan: 'Циан',
      preset_indigo: 'Индиго',
      preset_rose: 'Розовый',
      preset_mint: 'Мятный',
      preset_steel: 'Стальной',
      preset_teal: 'Бирюзовый',
      preset_azure: 'Лазурный',
      preset_slate: 'Сланцевый',
    },
  };

  function t(key) {
    const dict = I18N[currentLang()] || I18N.en;
    return (key in dict) ? dict[key] : (I18N.en[key] || key);
  }

  function applyStaticTranslations() {
    document.documentElement.lang = currentLang();
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    }
  }

  // Обновляет весь переведённый UI без побочных эффектов вроде пересоздания
  // точек (в отличие от applySettings(), которая пересоздаёт поле точек при
  // вызове onDensityChange) — используется при смене языка "на лету" и при
  // сбросе настроек (где смена els.langSelect.value не проходит через
  // обычное событие change).
  function refreshTranslatedUI() {
    applyStaticTranslations();
    buildSwatches();
    refreshPaletteSelect(els.paletteSelect.value);
    updateResetPhasesAvailability();
    updateStats();
    els.massReadout.textContent = `M = ${formatMass(massSolar)}, Rs ≈ ${formatDistance(rsMeters)}`;
    els.freqReadout.textContent = `${parseFloat(els.freq.value).toFixed(0)} ${t('unit_bpmFarFromBH')} (${baseFreqHz.toFixed(2)} ${t('unit_hz')})`;
    els.densityReadout.textContent = `${parseInt(els.density.value, 10).toLocaleString(localeTag())} ${t('unit_points')}`;
    if (hasMousePos) updateTooltip(lastMouseX, lastMouseY);
  }

  function onLangSelectChange() {
    refreshTranslatedUI();
  }

  // Приглушённые, не «чисто-RGB» цвета — годятся и для дальних точек, и для
  // ручного цвета у горизонта. Первый — цвет по умолчанию.
  const COLOR_PRESETS = [
    { key: 'violet', labelKey: 'preset_violet', rgb: { r: 168, g: 138, b: 255 } },
    { key: 'cyan', labelKey: 'preset_cyan', rgb: { r: 110, g: 210, b: 222 } },
    { key: 'indigo', labelKey: 'preset_indigo', rgb: { r: 120, g: 130, b: 220 } },
    { key: 'rose', labelKey: 'preset_rose', rgb: { r: 216, g: 138, b: 168 } },
    { key: 'mint', labelKey: 'preset_mint', rgb: { r: 126, g: 207, b: 160 } },
    { key: 'steel', labelKey: 'preset_steel', rgb: { r: 122, g: 156, b: 216 } },
    { key: 'teal', labelKey: 'preset_teal', rgb: { r: 90, g: 190, b: 180 } },
    { key: 'azure', labelKey: 'preset_azure', rgb: { r: 100, g: 170, b: 230 } },
    { key: 'slate', labelKey: 'preset_slate', rgb: { r: 140, g: 160, b: 190 } },
  ];
  const PRESET_BY_KEY = {};
  for (const p of COLOR_PRESETS) PRESET_BY_KEY[p.key] = p;

  const DEFAULT_BASE_KEY = 'violet';
  const DEFAULT_HORIZON_MODE = 'auto';
  const DEFAULT_HORIZON_KEY = 'indigo';
  const DEFAULT_INTRO_EXPANDED = true;
  const DEFAULT_PAN_X = -67;
  const DEFAULT_PAN_Y = 24;

  let introExpanded = DEFAULT_INTRO_EXPANDED;
  let infoPanelExpanded = true; // не персистится — только на время сессии

  let baseColorKey = DEFAULT_BASE_KEY;
  let horizonMode = DEFAULT_HORIZON_MODE; // 'auto' | 'manual'
  let horizonColorKey = DEFAULT_HORIZON_KEY;
  let baseColor = PRESET_BY_KEY[baseColorKey].rgb;
  let horizonColor = PRESET_BY_KEY[horizonColorKey].rgb;

  const MIX_LEVELS = 48;
  const ALPHA_LEVELS = 32;
  let palette = [];

  // Приливное (радиальное) растяжение формы точки — точный метрический
  // множитель sqrt(g_rr) = 1/sqrt(1-rs/r) = 1/D(r): именно во столько раз
  // собственная (проперная) радиальная длина превышает координатную вблизи
  // горизонта. У самого горизонта множитель расходится, поэтому визуально
  // ограничен разумным потолком (это потолок ДО применения пользовательского
  // коэффициента — см. stretchCoefficient).
  const MAX_STRETCH = 8;
  // Абсолютный потолок УЖЕ ПОСЛЕ пользовательского коэффициента — просто
  // чтобы при высоком коэффициенте точки не превращались в мусорные иглы
  // через весь экран.
  const ABS_STRETCH_CAP = 24;
  let stretchCoefficient = 1;
  let stretchDirection = 'toward'; // 'both' | 'toward'

  // Ниже этого множителя растяжение слабо заметно на точке размером в
  // пару пикселей, а из-за честной (гравитационно корректной) выборки точек
  // — той же, что убирает пустое кольцо у горизонта, — у ЗНАЧИТЕЛЬНОЙ доли
  // точек истинный радиус лежит совсем рядом с горизонтом, так что порог
  // не может обрезать больше половины без потери самого эффекта. Основная
  // экономия — не сам порог, а батчинг ниже: одна save()/restore() и явная
  // матрица (setTransform) на кадр вместо одной на КАЖДУЮ растянутую точку.
  const STRETCH_VISIBLE_MIN = 1.3;

  // Приливное СЖАТИЕ перпендикулярно радиусу — это ДРУГОЙ эффект, чем
  // растяжение выше. Растяжение (sqrt(g_rr) = 1/D(r)) — статическое
  // отношение проперного и координатного радиального расстояния для
  // неподвижной сетки; оно честно расходится прямо на горизонте. Сжатие —
  // из тензора приливных сил (уравнение геодезического отклонения) для
  // протяжённого тела: в вакуумном решении Шварцшильда собственные значения
  // этого тензора в системе покоя наблюдателя — E_rr = -2M/r^3 (растяжение
  // вдоль радиуса) и E_θθ = E_φφ = +M/r^3 (сжатие в ДВУХ перпендикулярных
  // направлениях). Тензор в вакууме бесследовый (Rμν=0), это даёт ТОЧНОЕ
  // отношение 2:-1:-1 — сжатие вдвое слабее растяжения по величине, и, в
  // отличие от растяжения выше, остаётся КОНЕЧНЫМ прямо на горизонте (у
  // массивной ЧД горизонт можно пересечь без разрыва приливными силами —
  // они станут разрушительными глубже, но не на самом горизонте).
  // Безразмерный параметр приливной силы Θ(r) = M·rs²/r³ = (rs/r)³/2 —
  // нормировка на rs² (единственный физический масштаб длины в задаче)
  // делает его функцией только отношения r/rs, как и D(r) выше.
  function tidalTheta(r, rs) {
    const rc = Math.max(r, rs);
    return 0.5 * Math.pow(rs / rc, 3);
  }
  // Минимум ширины точки поперёк радиуса — сжатие по формуле никогда не
  // уходит в ноль (Θ конечна везде вне горизонта), но пол всё равно ставим
  // для вменяемого рендера при большом пользовательском коэффициенте.
  const COMPRESS_FLOOR = 0.15;
  // Порог видимости для батчинга — см. STRETCH_VISIBLE_MIN выше, тот же
  // смысл, только для сжатия (точка считается "заметно сжатой", если её
  // ширина поперёк радиуса упала более чем на 3%).
  const COMPRESS_VISIBLE_MAX = 0.97;
  let compressCoefficient = 1;

  function tidalCompressFactor(r, rs) {
    if (els.noGravity.checked) return 1;
    const theta = tidalTheta(r, rs) * compressCoefficient;
    return Math.max(COMPRESS_FLOOR, 1 / (1 + theta));
  }

  // Видимый (кажущийся) размер объекта ФИКСИРОВАННОГО собственного размера,
  // как его увидел бы удалённый наблюдатель — третий, ещё один независимый
  // эффект. Растяжение выше отвечает на вопрос "точке приписан маленький
  // КООРДИНАТНЫЙ размер — насколько больше её СОБСТВЕННЫЙ (проперный)
  // размер?" (множитель 1/D). Здесь вопрос обратный: "у объекта фиксированный
  // СОБСТВЕННЫЙ размер — каким будет его КООРДИНАТНЫЙ (видимый) размер?" —
  // ответ прямо противоположный: proper × D(r), то есть множитель D(r)
  // (тот же самый D, что задаёт замедление времени и красное смещение — не
  // нужна никакая новая формула). Радиально объект сжимается (D→0 у
  // горизонта — координатный размер стремится к нулю), поперёк — не
  // меняется вовсе (g_φφ = r² точно, без множителя (1-rs/r)).
  const APPARENT_FLOOR = 0.05;
  // Порог видимости для батчинга — тот же смысл, что STRETCH_VISIBLE_MIN и
  // COMPRESS_VISIBLE_MAX выше.
  const APPARENT_VISIBLE_MAX = 0.97;
  let apparentCoefficient = 1;

  function apparentSizeFactor(De) {
    const raw = 1 - apparentCoefficient * (1 - De);
    return Math.max(APPARENT_FLOOR, Math.min(1, raw));
  }

  // У самого горизонта D→0 и пульсация физически замирает (бесконечное
  // замедление времени) — честно, но на крупных точках выглядит как
  // "сломанная" неподвижная точка. Задаём небольшой практический пол для
  // ЧАСТОТЫ мигания (не для цвета/яркости — там D остаётся точным), чтобы
  // точки продолжали заметно мигать даже вплотную к горизонту, просто очень
  // медленно.
  //
  // Жёсткий пол (Math.max(D, MIN_BLINK_D)) склеивал в ОДНУ частоту всё, что
  // ниже порога. Простая линейная рампа ПО D эту проблему тоже не решает:
  // точки расставлены равномерно по ЭКРАННОЙ площади (то самое "честное"
  // распределение без пустого кольца у горизонта), а пространство рядом с
  // горизонтом растянуто настолько резко, что D у СОСЕДНИХ по экрану колец
  // отличается на исчезающе малую величину — там, где 5-7 колец на экране
  // выглядят чётко разделёнными, их D практически совпадает. Рампа по D
  // просто честно воспроизводит это вырождение — дифференцировать там
  // нечем, вход у неё почти одинаковый для всех этих точек.
  //
  // Поэтому внутри порога частота берётся не от D, а от РЕНДЕР-РАССТОЯНИЯ
  // точки до горизонта (в долях rsPx) — оно у соседних точек/колец различно
  // ровно настолько, насколько они разнесены на экране (так их и
  // расставляли), и не страдает тем же вырождением. Снаружи порога (D
  // достаточно велико, различия уже сами по себе заметны) используется
  // честная формула D без изменений — рамп берёт верх только пока он
  // (растущий с расстоянием) не обгонит настоящую D, дальше max() сам
  // возвращает управление честной физике, без явного стыка/разрыва.
  const MIN_BLINK_D = 0.05;
  const MIN_BLINK_FLOOR = 0.01;
  const BLINK_DIST_RAMP_RATE = 0.15;

  function blinkFreqFactor(D, renderedR) {
    if (D >= MIN_BLINK_D) return D;
    const normDist = rsPx > 0 ? Math.max(0, renderedR - rsPx) / rsPx : 0;
    const distanceRamp = Math.min(MIN_BLINK_D, MIN_BLINK_FLOOR + normDist * BLINK_DIST_RAMP_RATE);
    return Math.max(D, distanceRamp);
  }

  // Коэффициент резкости перехода цвета к горизонту — настраивается
  // ползунком (см. els.colorGradient / onColorGradientChange). Чем он
  // больше, тем дольше цвет остаётся исходным вдали от ЧД и тем резче
  // (но всё ещё гладко, экспоненциально) он "включается" ближе к горизонту.
  // См. colorMixCurve() ниже.
  let colorGradientPower = 4;

  // Экспоненциальный ease-in: 0 при x=0 (вдали от ЧД — исходный цвет),
  // 1 при x=1 (горизонт — конечный цвет). При k→0 вырождается в линейную
  // функцию (защита от деления на ноль при exp(k)-1→0). Чем больше k, тем
  // дольше кривая остаётся у нуля и тем резче взлёт к 1 у самого горизонта —
  // именно то, что нужно, чтобы у краёв поля (где D всего на пару процентов
  // меньше 1) цвет не смещался заметно, а весь сдвиг был сосредоточен у
  // горизонта.
  function colorMixCurve(x, k) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (k < 0.05) return x;
    return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
  }

  // Скорость распространения "сигнала" (px координатного/рендер-пространства
  // в секунду симуляционного времени) вдали от ЧД, где локальное замедление
  // не мешает. Для радиального нулевого геодезика в метрике Шварцшильда
  // координатная скорость света dr/dt = 1-Rs/r = D(r)^2 — этим же множителем
  // (изотропно, без учёта отклонения луча) масштабируем локальную скорость
  // сигнала везде, поэтому у горизонта, где D→0, фронт волны честно
  // застревает (эффект Шапиро), а не просто "тускнеет".
  const SIGNAL_SPEED = 260;
  const SIGNAL_INTEGRATION_STEPS = 8;
  // Помимо перезапуска фазы, сам фронт волны на короткое время подсвечивает
  // точку дополнительной вспышкой — иначе эффект (лишь скачок фазы у
  // индивидуально мерцающих точек) почти незаметен на глаз. Так фронт виден
  // как расходящееся яркое кольцо — именно то, что нужно, чтобы разглядеть
  // его искажение вблизи горизонта.
  const SIGNAL_FLASH_DURATION = 0.45; // секунд симуляционного времени
  const SIGNAL_FLASH_STRENGTH = 0.9;
  // Интервал между последовательными импульсами в режимах "непрерывный" и
  // "фиксированное число" — достаточно больше SIGNAL_FLASH_DURATION, чтобы
  // каждый импульс успевал погаснуть до прихода следующего и кольца не
  // сливались в одно смазанное пятно.
  const SIGNAL_PULSE_INTERVAL = 1.1;

  const els = {
    langSelect: document.getElementById('langSelect'),
    hudHideBtn: document.getElementById('hudHideBtn'),
    hudShowBtn: document.getElementById('hudShowBtn'),
    mass: document.getElementById('mass'),
    freq: document.getElementById('freq'),
    speed: document.getElementById('speed'),
    density: document.getElementById('density'),
    zoom: document.getElementById('zoom'),
    overallBrightness: document.getElementById('overallBrightness'),
    brightness: document.getElementById('brightness'),
    colorGradient: document.getElementById('colorGradient'),
    colorGradientReadout: document.getElementById('colorGradientReadout'),
    blinkCurve: document.getElementById('blinkCurve'),
    distribution: document.getElementById('distribution'),
    sizeMode: document.getElementById('sizeMode'),
    fixedSize: document.getElementById('fixedSize'),
    fixedSizeRow: document.getElementById('fixedSizeRow'),
    pointShape: document.getElementById('pointShape'),
    tidalStretch: document.getElementById('tidalStretch'),
    stretchInfoToggle: document.getElementById('stretchInfoToggle'),
    stretchInfoText: document.getElementById('stretchInfoText'),
    stretchCoefficientRow: document.getElementById('stretchCoefficientRow'),
    stretchCoefficient: document.getElementById('stretchCoefficient'),
    stretchCoefficientReadout: document.getElementById('stretchCoefficientReadout'),
    stretchDirectionRow: document.getElementById('stretchDirectionRow'),
    stretchDirection: document.getElementById('stretchDirection'),
    tidalCompress: document.getElementById('tidalCompress'),
    compressInfoToggle: document.getElementById('compressInfoToggle'),
    compressInfoText: document.getElementById('compressInfoText'),
    compressCoefficientRow: document.getElementById('compressCoefficientRow'),
    compressCoefficient: document.getElementById('compressCoefficient'),
    compressCoefficientReadout: document.getElementById('compressCoefficientReadout'),
    apparentSize: document.getElementById('apparentSize'),
    apparentInfoToggle: document.getElementById('apparentInfoToggle'),
    apparentInfoText: document.getElementById('apparentInfoText'),
    apparentCoefficientRow: document.getElementById('apparentCoefficientRow'),
    apparentCoefficient: document.getElementById('apparentCoefficient'),
    apparentCoefficientReadout: document.getElementById('apparentCoefficientReadout'),
    showGrid: document.getElementById('showGrid'),
    syncMode: document.getElementById('syncMode'),
    signalMode: document.getElementById('signalMode'),
    signalTypeRow: document.getElementById('signalTypeRow'),
    signalType: document.getElementById('signalType'),
    signalCountRow: document.getElementById('signalCountRow'),
    signalCount: document.getElementById('signalCount'),
    signalCountReadout: document.getElementById('signalCountReadout'),
    noGravity: document.getElementById('noGravity'),
    showTooltip: document.getElementById('showTooltip'),
    pause: document.getElementById('pause'),
    resetBtn: document.getElementById('resetSettings'),
    resetPhasesBtn: document.getElementById('resetPhases'),
    copyBtn: document.getElementById('copySettings'),
    baseSwatches: document.getElementById('baseSwatches'),
    horizonAuto: document.getElementById('horizonAuto'),
    horizonSwatchRow: document.getElementById('horizonSwatchRow'),
    horizonSwatches: document.getElementById('horizonSwatches'),
    resetPaletteBtn: document.getElementById('resetPalette'),
    paletteSelect: document.getElementById('paletteSelect'),
    paletteName: document.getElementById('paletteName'),
    savePaletteBtn: document.getElementById('savePaletteBtn'),
    deletePaletteBtn: document.getElementById('deletePaletteBtn'),
    massReadout: document.getElementById('massReadout'),
    freqReadout: document.getElementById('freqReadout'),
    speedReadout: document.getElementById('speedReadout'),
    densityReadout: document.getElementById('densityReadout'),
    zoomReadout: document.getElementById('zoomReadout'),
    overallBrightnessReadout: document.getElementById('overallBrightnessReadout'),
    brightnessReadout: document.getElementById('brightnessReadout'),
    fixedSizeReadout: document.getElementById('fixedSizeReadout'),
    stats: document.getElementById('stats'),
    fpsReadout: document.getElementById('fpsReadout'),
    tooltip: document.getElementById('cursorTooltip'),
    introToggle: document.getElementById('introToggle'),
    introToggleIcon: document.getElementById('introToggleIcon'),
    introText: document.getElementById('introText'),
    infoPanelToggle: document.getElementById('infoPanelToggle'),
  };

  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 10;

  // Настройки, которые автосохраняются в localStorage.
  const persistedEls = {
    langSelect: els.langSelect,
    mass: els.mass,
    freq: els.freq,
    speed: els.speed,
    density: els.density,
    zoom: els.zoom,
    overallBrightness: els.overallBrightness,
    brightness: els.brightness,
    colorGradient: els.colorGradient,
    blinkCurve: els.blinkCurve,
    distribution: els.distribution,
    sizeMode: els.sizeMode,
    fixedSize: els.fixedSize,
    pointShape: els.pointShape,
    tidalStretch: els.tidalStretch,
    stretchCoefficient: els.stretchCoefficient,
    stretchDirection: els.stretchDirection,
    tidalCompress: els.tidalCompress,
    compressCoefficient: els.compressCoefficient,
    apparentSize: els.apparentSize,
    apparentCoefficient: els.apparentCoefficient,
    showGrid: els.showGrid,
    syncMode: els.syncMode,
    signalMode: els.signalMode,
    signalType: els.signalType,
    signalCount: els.signalCount,
    noGravity: els.noGravity,
    showTooltip: els.showTooltip,
    pause: els.pause,
  };

  // Значения по умолчанию — как заданы прямо в HTML (атрибуты value/checked),
  // снятые ДО того, как loadSettings() что-либо перезапишет.
  const defaultSettings = {};
  for (const key in persistedEls) {
    const el = persistedEls[key];
    defaultSettings[key] = el.type === 'checkbox' ? el.checked : el.value;
  }

  const STORAGE_KEY = 'blackhole-schwarzschild-settings-v1';
  const SAVE_DEBOUNCE_MS = 1000;
  let saveTimer = null;

  // Собирает те же данные, что уходят в localStorage — используется и для
  // автосохранения, и для кнопки "Скопировать настройки", чтобы не дублировать
  // логику. panX/panY — положение viewport, а не настройка из панели
  // управления, но храним их в том же объекте: проще одним ключом.
  function getSettingsData() {
    const data = {};
    for (const key in persistedEls) {
      const el = persistedEls[key];
      data[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    data._panX = panX;
    data._panY = panY;
    data._baseColorKey = baseColorKey;
    data._horizonMode = horizonMode;
    data._horizonColorKey = horizonColorKey;
    data._introExpanded = introExpanded;
    return data;
  }

  function saveSettingsNow() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getSettingsData())); } catch (err) { /* хранилище недоступно — молча пропускаем */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettingsNow, SAVE_DEBOUNCE_MS);
  }

  function loadSettings() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (err) { data = null; }
    if (!data) return;
    for (const key in persistedEls) {
      if (!(key in data)) continue;
      const el = persistedEls[key];
      if (el.type === 'checkbox') el.checked = !!data[key];
      else el.value = data[key];
    }
    if (typeof data._panX === 'number') panX = data._panX;
    if (typeof data._panY === 'number') panY = data._panY;
    if (data._baseColorKey in PRESET_BY_KEY) baseColorKey = data._baseColorKey;
    if (data._horizonMode === 'auto' || data._horizonMode === 'manual') horizonMode = data._horizonMode;
    if (data._horizonColorKey in PRESET_BY_KEY) horizonColorKey = data._horizonColorKey;
    if (typeof data._introExpanded === 'boolean') introExpanded = data._introExpanded;
  }

  function copySettings() {
    const text = JSON.stringify(getSettingsData(), null, 2);
    const done = () => {
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = t('copyBtn_done');
      setTimeout(() => { els.copyBtn.textContent = original; }, 1500);
    };
    const fallback = () => {
      // navigator.clipboard недоступен (нет HTTPS/localhost) — копируем
      // через скрытый textarea и document.execCommand как запасной путь.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { /* совсем не вышло — молча оставляем как есть */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function resetSettings() {
    clearTimeout(saveTimer);
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* игнорируем */ }
    for (const key in persistedEls) {
      const el = persistedEls[key];
      if (el.type === 'checkbox') el.checked = defaultSettings[key];
      else el.value = defaultSettings[key];
    }
    panX = DEFAULT_PAN_X;
    panY = DEFAULT_PAN_Y;
    introExpanded = DEFAULT_INTRO_EXPANDED;
    resetColorsToDefault();
    applySettings();
    // els.langSelect.value могло измениться выше (сброс к дефолту 'auto') без
    // события change — applySettings() не обновляет свотчи/плейсхолдер
    // палитры, это делает refreshTranslatedUI().
    refreshTranslatedUI();
  }

  let width = 0, height = 0, dpr = 1;
  let centerX = 0, centerY = 0;
  let fieldRadius = 0;
  let rsPx = 100;
  let baseFreqHz = 1.5;
  let timeScale = 1;
  let massSolar = 0;
  let rsMeters = 0;
  let zoom = 1;
  let panX = DEFAULT_PAN_X, panY = DEFAULT_PAN_Y;
  let brightnessFloor = 0.18;
  let overallBrightness = 1;

  let points = [];
  // points отсортирован так, что все точки с заметным растяжением и/или
  // сжатием идут ПОСЛЕ этого индекса — см. partitionByTransform(). Это
  // позволяет в drawPoints() открыть один save()/restore() на весь такой
  // "хвост" массива вместо одного на каждую точку.
  let transformStartIndex = 0;
  let bgGradient = null;
  let simTime = 0;
  let lastFrameMs = 0;

  // "Сигнал" — клик в режиме отправки сигнала задаёт волновой фронт,
  // расходящийся от точки клика. У каждой точки поля считается один раз (при
  // клике) персональная задержка p.sigDelay — время, за которое фронт до неё
  // добегает. От неё зависит момент "попадания" каждого последующего
  // импульса: k-й импульс (k=0,1,2,...) приходит в момент
  // signalStartTime + k*SIGNAL_PULSE_INTERVAL + p.sigDelay — см. fireSignal()
  // и drawPoints(). Тип сигнала (одиночный/непрерывный/N импульсов) и число
  // импульсов читаются В drawPoints() ЖИВЬЁМ (из els.signalType/signalCount)
  // на каждый кадр, а не фиксируются в момент клика — так переключение типа
  // сразу видно на уже идущем сигнале, а не только на следующем клике.
  // Положения точек сигнал не меняет — только влияет на видимую фазу.
  let signalActive = false;
  let signalOriginX = 0, signalOriginY = 0, signalStartTime = 0;

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function rgbCss(c) {
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  // Целевой оттенок горизонта — тот самый тёплый красно-оранжевый, что был
  // фиксированным цветом раньше (255,66,32). Все базовые цвета тянутся к
  // НЕМУ напрямую в RGB, а не поворотом оттенка по кругу: поворот по
  // кратчайшей дуге иногда шёл в обратную от красного сторону (например,
  // от фиолетового — к пурпурному, от салатового — к жёлтому), потому что
  // "кратчайший" путь по кругу оттенков не совпадает с направлением реального
  // редшифта (смещение спектра к длинным волнам — это всегда движение к
  // красному, а не к ближайшей точке на цветовом круге). Прямое смешение в
  // RGB с высоким весом цели даёт у всех цветов один и тот же красноватый
  // горизонт с лёгким, некритичным оттенком исходного цвета.
  const AUTO_HORIZON_TARGET = { r: 255, g: 66, b: 32 };
  const AUTO_HORIZON_BLEND = 0.85;

  function autoHorizonColor(base) {
    return {
      r: Math.round(base.r * (1 - AUTO_HORIZON_BLEND) + AUTO_HORIZON_TARGET.r * AUTO_HORIZON_BLEND),
      g: Math.round(base.g * (1 - AUTO_HORIZON_BLEND) + AUTO_HORIZON_TARGET.g * AUTO_HORIZON_BLEND),
      b: Math.round(base.b * (1 - AUTO_HORIZON_BLEND) + AUTO_HORIZON_TARGET.b * AUTO_HORIZON_BLEND),
    };
  }

  // Приглушённый тёмный оттенок базового цвета для фонового градиента —
  // основной цвет точек тем самым задаёт и цвет фона.
  function bgShade(rgb, lightness) {
    const [h, s] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return hslToRgb(h, Math.min(0.55, s * 0.8), lightness);
  }

  function updateColors() {
    baseColor = PRESET_BY_KEY[baseColorKey].rgb;
    horizonColor = horizonMode === 'auto' ? autoHorizonColor(baseColor) : PRESET_BY_KEY[horizonColorKey].rgb;
    buildPalette();
    if (fieldRadius > 0) updateBgGradient();
  }

  function buildPalette() {
    palette = [];
    for (let m = 0; m <= MIX_LEVELS; m++) {
      const mix = m / MIX_LEVELS;
      const r = Math.round(baseColor.r + (horizonColor.r - baseColor.r) * mix);
      const g = Math.round(baseColor.g + (horizonColor.g - baseColor.g) * mix);
      const b = Math.round(baseColor.b + (horizonColor.b - baseColor.b) * mix);
      const row = new Array(ALPHA_LEVELS + 1);
      for (let a = 0; a <= ALPHA_LEVELS; a++) {
        const alpha = a / ALPHA_LEVELS;
        row[a] = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      }
      palette.push(row);
    }
  }

  // ctx.arc()+fill() дороже fillRect() в основном из-за фиксированных
  // накладных расходов на построение/растеризацию пути на каждый вызов, а
  // не из-за площади заливки — поэтому просадка FPS у круглых точек заметнее
  // всего именно при МЕЛКОМ размере (накладные расходы становятся большей
  // долей стоимости кадра). При таком размере круг и квадрат всё равно
  // визуально неразличимы, поэтому ниже этого порога точки рисуются как
  // квадрат независимо от выбранной формы — без потери вида, но без
  // лишней стоимости. Пробовал заменить круг на штамповку спрайта
  // (drawImage) — в тестах это не ускорило, а местами замедлило отрисовку.
  const ROUND_MIN_SIZE = 3;

  function solarMassFromSlider(v) {
    const t = v / 1000;
    const exp = 4 + t * 5.3; // 10^4 .. ~10^9.3 solar masses
    return Math.pow(10, exp);
  }

  function schwarzschildRadiusMeters(mSolar) {
    return (2 * G * mSolar * M_SUN) / (C * C);
  }

  function computeRsPx(sliderValue) {
    const t = sliderValue / 1000;
    const minPx = 34;
    const maxPx = Math.max(70, Math.min(width, height) * 0.30);
    return minPx + t * (maxPx - minPx);
  }

  function formatMass(m) {
    const exp = Math.floor(Math.log10(m));
    const mant = m / Math.pow(10, exp);
    return `${mant.toFixed(2)}×10^${exp} M☉`;
  }

  function formatDistance(meters) {
    const km = meters / 1000;
    const AU_KM = 1.496e8;
    if (km < 1) return `${(meters).toFixed(1)} ${t('unit_m')}`;
    if (km < 1e6) return `${km.toLocaleString(localeTag(), { maximumFractionDigits: 0 })} ${t('unit_km')}`;
    if (km < AU_KM) return `${(km / 1e6).toFixed(2)} ${t('unit_millionKm')}`;
    return `${(km / AU_KM).toFixed(3)} ${t('unit_au')}`;
  }

  // Точный интеграл собственного радиального расстояния (Flamm paraboloid),
  // с точностью до аддитивной константы; L(rs) = 0.
  function properDistance(r, rs) {
    if (r <= rs) return 0;
    return Math.sqrt(r * (r - rs)) + rs * Math.log((Math.sqrt(r) + Math.sqrt(r - rs)) / Math.sqrt(rs));
  }

  function distortedRadius(r, rs, maxR, Lmax) {
    if (r <= rs) return rs;
    const s = properDistance(r, rs) / Lmax;
    return rs + s * (maxR - rs);
  }

  // Обратная задача: по видимому (растянутому) радиусу на экране найти
  // истинную шварцшильдовскую координату r. properDistance() монотонна,
  // поэтому это делается простой бисекцией — замкнутой формы для обратной
  // функции нет (в неё входит комбинация sqrt и log).
  function invertProperDistance(renderedR, rs, maxR, Lmax, iterations) {
    if (renderedR <= rs) return rs;
    if (renderedR >= maxR) return maxR;
    const targetL = Lmax * (renderedR - rs) / (maxR - rs);
    let lo = rs, hi = maxR;
    for (let i = 0; i < (iterations || 24); i++) {
      const mid = (lo + hi) / 2;
      if (properDistance(mid, rs) < targetL) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // sqrt(g_rr) = 1/sqrt(1-rs/r) = 1/D(r) — точный (не приближённый) множитель
  // метрики Шварцшильда, показывающий, во сколько раз собственная радиальная
  // длина превышает координатную на данном r. У горизонта D→0, поэтому
  // множитель ограничен сверху константой MAX_STRETCH ради вменяемой картинки.
  function tidalStretchFactor(D) {
    const raw = D <= 1 / MAX_STRETCH ? MAX_STRETCH : 1 / D;
    // Пользовательский коэффициент применяется к «избытку» растяжения
    // сверх 1 (а не ко всему множителю), иначе при коэффициенте < 1
    // нерастянутые точки (raw=1) визуально бы сжимались — а это не имеет
    // физического смысла и выглядело бы как баг.
    const scaled = 1 + (raw - 1) * stretchCoefficient;
    return Math.min(ABS_STRETCH_CAP, scaled);
  }

  // Точка задаётся своим ВИДИМЫМ (экранным) положением (x,y) — истинная
  // координата r восстанавливается через invertProperDistance(). Так плотность
  // точек на экране всегда равномерна и не зависит от массы, а физика
  // (замедление времени, красное смещение) при этом остаётся точной.
  // "Отключить тяготение" — сравнительный режим (см. hint у чекбокса
  // noGravity): ЧД перестаёт влиять на всё, что завязано на D(r) — фазу
  // (частоту пульсации), цветовой сдвиг к горизонту (это тот же D, что
  // задаёт "смещение частоты" — доплеровский/гравитационный редшифт) и
  // приливное растяжение (нечему растягивать в плоском пространстве). Яркость
  // (brightBase) при этом остаётся честной — её отключать не просили.
  function effectiveD(D) {
    return els.noGravity.checked ? 1 : D;
  }

  // D на самом дальнем краю видимого поля точек (renderedR = fieldRadius —
  // по построению генератора точек, это же и есть "истинный" r на границе,
  // см. invertProperDistance). При типичной массе rs — заметная доля
  // fieldRadius (иначе на слайдере массы горизонт был бы точкой), так что
  // даже у "дальнего" края D заметно меньше 1 — переход цвета, взятый прямо
  // от (1-D), был бы растянут по всему полю вместо горизонта. Вместо этого
  // цвет считается от ДОЛИ пройденного пути от edgeDe (край — 0) до 0
  // (горизонт — 1): край поля тогда даёт mix=0 ТОЧНО, при любой резкости, а
  // весь диапазон резкости честно работает на реальном диапазоне D, а не на
  // его исчезающе малом хвосте. Пересчитывается в recomputePhysics() и
  // generatePoints() — до применения per-point поправки на "без тяготения".
  let edgeDe = 1;
  function updateEdgeDe() {
    const rawEdgeD = Math.sqrt(Math.max(0, 1 - rsPx / fieldRadius));
    edgeDe = effectiveD(rawEdgeD);
  }

  function colorMixFromD(D) {
    const De = effectiveD(D);
    const xNorm = edgeDe > 0.0001 ? Math.min(1, Math.max(0, (edgeDe - De) / edgeDe)) : (De < 1 ? 1 : 0);
    return colorMixCurve(xNorm, colorGradientPower);
  }

  function makePoint(x, y, trueR) {
    const D = Math.sqrt(Math.max(0, 1 - rsPx / trueR));
    const De = effectiveD(D);
    const mix = colorMixFromD(D);
    // Угол точки относительно центра ЧД задаёт направление радиального
    // растяжения. Положение точки навсегда фиксировано, поэтому угол (и его
    // cos/sin) считается один раз здесь, а не в каждом кадре drawPoints().
    const ang = Math.atan2(y - centerY, x - centerX);
    const renderedR = Math.hypot(x - centerX, y - centerY);
    return {
      r: trueR,
      rx: x, ry: y,
      renderedR,
      D,
      mixIdx: Math.max(0, Math.min(MIX_LEVELS, Math.round(mix * MIX_LEVELS))),
      brightBase: brightnessFloor + (1 - brightnessFloor) * Math.pow(D, 1.3),
      angFreq: TWO_PI * baseFreqHz * blinkFreqFactor(De, renderedR),
      stretch: tidalStretchFactor(De),
      compress: tidalCompressFactor(trueR, rsPx),
      apparent: apparentSizeFactor(De),
      ang,
      cosAng: Math.cos(ang),
      sinAng: Math.sin(ang),
      randPhase: Math.random() * TWO_PI,
      size: pointSize(),
      jitterA: 0.55 + Math.random() * 0.45,
    };
  }

  function generateRandomPoints(count, rs, outer, Lmax) {
    const arr = new Array(count);
    const rs2 = rs * rs, outer2 = outer * outer;
    for (let i = 0; i < count; i++) {
      const renderedR = Math.sqrt(rs2 + Math.random() * (outer2 - rs2)); // равномерно по площади экрана
      const ang = Math.random() * TWO_PI;
      const x = centerX + Math.cos(ang) * renderedR;
      const y = centerY + Math.sin(ang) * renderedR;
      arr[i] = makePoint(x, y, invertProperDistance(renderedR, rs, outer, Lmax));
    }
    return arr;
  }

  function generatePolarGrid(count, rs, outer, Lmax) {
    const arr = [];
    const rings = Math.max(4, Math.round(Math.sqrt(count / 2)));
    const angles = Math.max(6, Math.round(count / rings));
    for (let i = 1; i <= rings; i++) {
      const renderedR = rs + (outer - rs) * (i / rings);
      const trueR = invertProperDistance(renderedR, rs, outer, Lmax);
      for (let j = 0; j < angles; j++) {
        const ang = (j / angles) * TWO_PI;
        const x = centerX + Math.cos(ang) * renderedR;
        const y = centerY + Math.sin(ang) * renderedR;
        arr.push(makePoint(x, y, trueR));
      }
    }
    return arr;
  }

  // Область генерации — КВАДРАТ со стороной 2*outer, центрированный ровно на
  // (centerX, centerY), а не на границах канваса. Раньше цикл шёл от ~0 до
  // width/height, а centerX смещён вправо (панель слева "съедает" часть
  // ширины) — из-за этого сетка была симметрична относительно канваса, но не
  // относительно самой ЧД: слева поле доставало до outer, а справа обрезалось
  // краем канваса раньше, чем до outer — получался не круг, а срезанный
  // несимметричный кусок (на вид прямоугольник со смещённым центром).
  function generateCartesianGrid(count, rs, outer, Lmax) {
    const arr = [];
    const step = Math.max(6, (2 * outer) / Math.sqrt(count));
    const half = Math.ceil(outer / step) * step;
    for (let x = centerX - half; x <= centerX + half; x += step) {
      for (let y = centerY - half; y <= centerY + half; y += step) {
        const dx = x - centerX, dy = y - centerY;
        const renderedR = Math.hypot(dx, dy);
        if (renderedR <= rs * 1.01 || renderedR >= outer) continue;
        arr.push(makePoint(x, y, invertProperDistance(renderedR, rs, outer, Lmax)));
      }
    }
    return arr;
  }

  function generatePoints(count) {
    // Точки размещаются от МИНИМАЛЬНО возможного радиуса горизонта (а не от
    // текущего rsPx), и остаются на этих местах при смене массы (см.
    // recomputePhysics). Если генерировать от текущего rsPx, а потом
    // уменьшить массу — горизонт станет меньше, а точки останутся там же
    // (по требованию "точки не должны переставляться"), и между новым
    // маленьким горизонтом и ближайшими точками возникнет пустое кольцо.
    // Точки, оказавшиеся "внутри" текущего (большего) горизонта, просто
    // не видны — их закрывает чёрный диск.
    // Новый набор точек не имеет посчитанных задержек сигнала — гасим
    // текущий сигнал, а не показываем его в рассинхроне со свежим полем.
    signalActive = false;
    updateEdgeDe();
    const rs = computeRsPx(0), outer = fieldRadius;
    const Lmax = properDistance(outer, rs);
    const mode = els.distribution.value;
    if (mode === 'polar') {
      points = generatePolarGrid(count, rs, outer, Lmax);
    } else if (mode === 'cartesian') {
      points = generateCartesianGrid(count, rs, outer, Lmax);
    } else {
      points = generateRandomPoints(count, rs, outer, Lmax);
    }
    partitionByTransform();
  }

  // Группирует points так, чтобы все точки с заметным растяжением И/ИЛИ
  // заметным сжатием оказались одним непрерывным «хвостом» в конце массива
  // — тогда в drawPoints() их можно отрисовать за один save()/restore() на
  // кадр, а не за один на точку (это и было причиной падения FPS).
  function needsTransform(p) {
    return p.stretch > STRETCH_VISIBLE_MIN || p.compress < COMPRESS_VISIBLE_MAX || p.apparent < APPARENT_VISIBLE_MAX;
  }

  function partitionByTransform() {
    points.sort((a, b) => (needsTransform(a) ? 1 : 0) - (needsTransform(b) ? 1 : 0));
    transformStartIndex = points.length;
    for (let i = 0; i < points.length; i++) {
      if (needsTransform(points[i])) { transformStartIndex = i; break; }
    }
  }

  // Масса (rsPx), базовая частота и настройка яркости влияют только на
  // ФИЗИКУ точки (D, цвет, частота, яркость), но не на её положение —
  // положение точки задаётся один раз при генерации (см. generatePoints) и
  // не меняется, пока пользователь не поменяет плотность или тип
  // распределения. p.r — истинная (неизменная) координата точки; из неё
  // при каждом вызове честно пересчитывается вся физика для ТЕКУЩЕЙ массы.
  function recomputePhysics() {
    updateEdgeDe();
    const twoPiF = TWO_PI * baseFreqHz;
    for (const p of points) {
      const D = Math.sqrt(Math.max(0, 1 - rsPx / p.r));
      p.D = D;
      const De = effectiveD(D);
      const mix = colorMixFromD(D);
      p.mixIdx = Math.max(0, Math.min(MIX_LEVELS, Math.round(mix * MIX_LEVELS)));
      p.brightBase = brightnessFloor + (1 - brightnessFloor) * Math.pow(D, 1.3);
      p.angFreq = twoPiF * blinkFreqFactor(De, p.renderedR);
      p.stretch = tidalStretchFactor(De);
      p.compress = tidalCompressFactor(p.r, rsPx);
      p.apparent = apparentSizeFactor(De);
    }
    partitionByTransform();
  }

  function pointSize() {
    if (els.sizeMode.value === 'fixed') return parseFloat(els.fixedSize.value) / 10;
    return 1.1 + Math.random() * 1.7;
  }

  // Смена режима/значения размера не должна переставлять точки — только
  // пересчитать size на месте, как и физику при смене массы.
  function recomputeSizes() {
    for (const p of points) p.size = pointSize();
  }

  // Перемешивает начальную фазу пульсации точек на месте, не трогая их
  // позицию/размер/физику. Полезно для случайного распределения: там фазы
  // не образуют видимого узора, и после долгой сессии может быть удобно
  // получить свежий "случайный" рисунок мерцания без пересоздания поля.
  // В синхронном режиме phase0 у всех точек принудительно равен 0 (см.
  // drawPoints), а видимая фаза каждой точки — это angFreq*simTime. Обнулив
  // simTime, мы обнуляем эту фазу у ВСЕХ точек разом (ровно то же самое
  // состояние, что и сразу после загрузки страницы) и "волна" замедления
  // времени начинает расходиться от горизонта заново. Вне синхронного
  // режима у каждой точки своя случайная randPhase, и обнуление simTime не
  // даёт такого же наглядного "перезапуска" — поэтому кнопка имеет смысл
  // только в синхронном режиме.
  function resetPhases() {
    simTime = 0;
  }

  function updateResetPhasesAvailability() {
    const disabled = !els.syncMode.checked;
    els.resetPhasesBtn.disabled = disabled;
    els.resetPhasesBtn.title = disabled
      ? t('resetPhases_disabledTitle')
      : t('resetPhases_enabledTitle');
  }

  // Запускает "сигнал" из точки клика (в системе координат points, той же,
  // что centerX/centerY/rsPx — без учёта текущего pan/zoom). Каждой точке
  // назначается персональная задержка p.sigDelay: время, за которое волновой
  // фронт добегает от места клика до неё, если считать, что вдоль всего пути
  // локальная скорость сигнала масштабируется тем же множителем D(r)^2, что
  // и координатная скорость света в метрике Шварцшильда (см. SIGNAL_SPEED
  // выше) — если только не включено "Отключить тяготение" (тогда скорость
  // всюду одинакова, для сравнения с плоским случаем). Путь берётся прямой
  // линией в рендер-пространстве — упрощение (реальный луч около ЧД
  // отклоняется), но задержка у горизонта передаётся честно и это даёт
  // желаемый эффект "искажения" волны при прохождении рядом с ЧД.
  // Тип сигнала (одиночный/непрерывный/N импульсов) и число импульсов
  // читаются живьём в drawPoints() — здесь только считаются задержки p.sigDelay,
  // общие для любого числа импульсов с интервалом SIGNAL_PULSE_INTERVAL.
  function fireSignal(originX, originY) {
    signalOriginX = originX;
    signalOriginY = originY;
    signalStartTime = simTime;
    signalActive = true;

    const noGravity = els.noGravity.checked;
    const Lmax = noGravity ? 0 : properDistance(fieldRadius, rsPx);
    const steps = SIGNAL_INTEGRATION_STEPS;
    for (const p of points) {
      const stepX = (p.rx - originX) / steps;
      const stepY = (p.ry - originY) / steps;
      const segLen = Math.hypot(stepX, stepY);
      let delay = 0;
      if (noGravity) {
        delay = Math.hypot(p.rx - originX, p.ry - originY) / SIGNAL_SPEED;
      } else {
        for (let i = 0; i < steps; i++) {
          const mx = originX + stepX * (i + 0.5);
          const my = originY + stepY * (i + 0.5);
          const renderedR = Math.hypot(mx - centerX, my - centerY);
          let D;
          if (renderedR <= rsPx) {
            D = MIN_BLINK_D;
          } else {
            // Меньше итераций бисекции, чем при размещении точек (invertProperDistance
            // по умолчанию): здесь это лишь вклад в интеграл задержки по многим точкам
            // сразу (вызывается разом для всего поля при каждом клике), точность
            // важна куда меньше, а высокая плотность точек делает лишние итерации
            // заметными по времени отклика на клик.
            const trueR = invertProperDistance(renderedR, rsPx, fieldRadius, Lmax, 10);
            D = Math.max(Math.sqrt(Math.max(0, 1 - rsPx / trueR)), MIN_BLINK_D);
          }
          delay += segLen / (SIGNAL_SPEED * D * D);
        }
      }
      p.sigDelay = delay;
    }
  }

  function stopSignal() {
    signalActive = false;
  }

  function updateBgGradient() {
    bgGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, fieldRadius);
    bgGradient.addColorStop(0, rgbCss(bgShade(baseColor, 0.075)));
    bgGradient.addColorStop(0.45, rgbCss(bgShade(baseColor, 0.035)));
    bgGradient.addColorStop(1, rgbCss(bgShade(baseColor, 0.012)));
  }

  // ---- Цвета и палитры ------------------------------------------------

  function buildSwatchRow(container, activeKeyGetter, onPick) {
    container.innerHTML = '';
    for (const preset of COLOR_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.style.backgroundColor = rgbCss(preset.rgb);
      btn.title = t(preset.labelKey);
      btn.dataset.key = preset.key;
      if (preset.key === activeKeyGetter()) btn.classList.add('active');
      btn.addEventListener('click', () => onPick(preset.key));
      container.appendChild(btn);
    }
  }

  function refreshSwatchActive() {
    for (const btn of els.baseSwatches.children) {
      btn.classList.toggle('active', btn.dataset.key === baseColorKey);
    }
    for (const btn of els.horizonSwatches.children) {
      btn.classList.toggle('active', btn.dataset.key === horizonColorKey);
    }
  }

  function buildSwatches() {
    buildSwatchRow(els.baseSwatches, () => baseColorKey, (key) => {
      baseColorKey = key;
      updateColors();
      refreshSwatchActive();
      scheduleSave();
    });
    buildSwatchRow(els.horizonSwatches, () => horizonColorKey, (key) => {
      horizonColorKey = key;
      updateColors();
      refreshSwatchActive();
      scheduleSave();
    });
  }

  function updateHorizonRowVisibility() {
    els.horizonSwatchRow.style.display = horizonMode === 'manual' ? '' : 'none';
  }

  function onHorizonAutoChange() {
    horizonMode = els.horizonAuto.checked ? 'auto' : 'manual';
    updateHorizonRowVisibility();
    updateColors();
  }

  function resetColorsToDefault() {
    baseColorKey = DEFAULT_BASE_KEY;
    horizonMode = DEFAULT_HORIZON_MODE;
    horizonColorKey = DEFAULT_HORIZON_KEY;
    els.horizonAuto.checked = true;
    updateHorizonRowVisibility();
    updateColors();
    refreshSwatchActive();
    els.paletteSelect.value = '';
  }

  function applyColorState() {
    els.horizonAuto.checked = horizonMode === 'auto';
    updateHorizonRowVisibility();
    updateColors();
    refreshSwatchActive();
  }

  const PALETTE_STORAGE_KEY = 'blackhole-schwarzschild-palettes-v1';

  function loadSavedPalettes() {
    try { return JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY)) || []; } catch (err) { return []; }
  }

  function saveSavedPalettes(list) {
    try { localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(list)); } catch (err) { /* хранилище недоступно */ }
  }

  function refreshPaletteSelect(selectName) {
    const list = loadSavedPalettes();
    els.paletteSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('paletteSelect_placeholder');
    els.paletteSelect.appendChild(placeholder);
    for (const p of list) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      els.paletteSelect.appendChild(opt);
    }
    els.paletteSelect.value = selectName && list.some((p) => p.name === selectName) ? selectName : '';
  }

  function savePaletteAs() {
    const name = els.paletteName.value.trim();
    if (!name) {
      // Пустое имя — самая вероятная причина, по которой сохранение
      // "не работает": кнопка тихо ничего не делает. Даём явную подсказку.
      els.paletteName.classList.add('inputError');
      els.paletteName.focus();
      setTimeout(() => els.paletteName.classList.remove('inputError'), 1000);
      return;
    }
    const list = loadSavedPalettes();
    const entry = { name, base: baseColorKey, horizonMode, horizon: horizonColorKey };
    const idx = list.findIndex((p) => p.name === name);
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    saveSavedPalettes(list);
    refreshPaletteSelect(name);
    els.paletteName.value = '';

    const original = els.savePaletteBtn.textContent;
    els.savePaletteBtn.textContent = t('savePaletteBtn_done');
    setTimeout(() => { els.savePaletteBtn.textContent = original; }, 1200);
  }

  function deleteSelectedPalette() {
    const name = els.paletteSelect.value;
    if (!name) return;
    saveSavedPalettes(loadSavedPalettes().filter((p) => p.name !== name));
    refreshPaletteSelect();
  }

  function applySelectedPalette() {
    const name = els.paletteSelect.value;
    if (!name) return;
    const entry = loadSavedPalettes().find((p) => p.name === name);
    if (!entry) return;
    // Палитра могла быть сохранена до того, как часть цветов убрали из
    // пресетов (например, тёплые) — подстраховываемся дефолтами, а не падаем.
    baseColorKey = entry.base in PRESET_BY_KEY ? entry.base : DEFAULT_BASE_KEY;
    horizonMode = entry.horizonMode === 'manual' ? 'manual' : 'auto';
    horizonColorKey = entry.horizon in PRESET_BY_KEY ? entry.horizon : DEFAULT_HORIZON_KEY;
    applyColorState();
    scheduleSave();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Центр — не центр всего окна, а центр видимой области ПРАВЕЕ боковой
    // панели: иначе ЧД визуально смещена под панель и выглядит не по центру
    // того, что реально видно. НО только на широких экранах, где панель и
    // "свободная" область реально расположены бок о бок. На узких/мобильных
    // (тот же порог, что и CSS-медиазапрос, растягивающий панель на всю
    // ширину) панель — плавающий оверлей ПОВЕРХ вьюпоинта, а не часть
    // раскладки: она почти всегда будет закрыта, и учитывать её ширину в
    // центрировании при открытой панели только сдвигало бы ЧД к самому краю
    // экрана (иногда почти за его пределы).
    const MOBILE_LAYOUT_BREAKPOINT = 560;
    if (width <= MOBILE_LAYOUT_BREAKPOINT) {
      centerX = width / 2;
    } else {
      const hudRight = document.querySelector('.hud').getBoundingClientRect().right;
      const availableLeft = Math.min(hudRight, width);
      centerX = availableLeft + Math.max(0, width - availableLeft) / 2;
    }
    centerY = height / 2;

    // Радиус поля точек — до самого дальнего угла экрана от этого (уже не
    // обязательно центрального) центра, чтобы точки покрывали весь видимый
    // viewport, а не только окрестность геометрического центра окна.
    fieldRadius = Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(width - centerX, centerY),
      Math.hypot(centerX, height - centerY),
      Math.hypot(width - centerX, height - centerY)
    ) * 1.02;
    rsPx = computeRsPx(parseFloat(els.mass.value));

    updateBgGradient();
    generatePoints(parseInt(els.density.value, 10));
    updateStats();
  }

  function onMassChange() {
    massSolar = solarMassFromSlider(parseFloat(els.mass.value));
    rsMeters = schwarzschildRadiusMeters(massSolar);
    rsPx = computeRsPx(parseFloat(els.mass.value));
    els.massReadout.textContent = `M = ${formatMass(massSolar)}, Rs ≈ ${formatDistance(rsMeters)}`;
    recomputePhysics();
    // Задержки сигнала посчитаны для старого rsPx — при смене массы гасим
    // сигнал, а не показываем его с устаревшей физикой.
    signalActive = false;
    updateStats();
  }

  function onFreqChange() {
    const bpm = parseFloat(els.freq.value);
    baseFreqHz = bpm / 60;
    els.freqReadout.textContent = `${bpm.toFixed(0)} ${t('unit_bpmFarFromBH')} (${baseFreqHz.toFixed(2)} ${t('unit_hz')})`;
    recomputePhysics();
  }

  function onSpeedChange() {
    const v = parseFloat(els.speed.value);
    timeScale = v / 100;
    els.speedReadout.textContent = `${v.toFixed(0)}%`;
  }

  function onDensityChange() {
    const n = parseInt(els.density.value, 10);
    els.densityReadout.textContent = `${n.toLocaleString(localeTag())} ${t('unit_points')}`;
    generatePoints(n);
    updateStats();
  }

  function onDistributionChange() {
    generatePoints(parseInt(els.density.value, 10));
    updateStats();
  }

  function onBrightnessChange() {
    const v = parseFloat(els.brightness.value);
    brightnessFloor = v / 100;
    els.brightnessReadout.textContent = `${v.toFixed(0)}%`;
    recomputePhysics();
  }

  function onColorGradientChange() {
    const v = parseFloat(els.colorGradient.value);
    colorGradientPower = v / 100;
    els.colorGradientReadout.textContent = colorGradientPower.toFixed(1);
    recomputePhysics();
  }

  // Общий множитель яркости — применяется поверх всего остального (не
  // требует пересчёта физики точек, читается прямо в drawPoints).
  function onOverallBrightnessChange() {
    const v = parseFloat(els.overallBrightness.value);
    overallBrightness = v / 100;
    els.overallBrightnessReadout.textContent = `${v.toFixed(0)}%`;
  }

  function onSizeModeChange() {
    els.fixedSizeRow.style.display = els.sizeMode.value === 'fixed' ? '' : 'none';
    recomputeSizes();
  }

  function onFixedSizeChange() {
    const v = parseFloat(els.fixedSize.value);
    els.fixedSizeReadout.textContent = `${(v / 10).toFixed(1)} px`;
    recomputeSizes();
  }

  // Коэффициент и направление растяжения имеют смысл только при включённом
  // растяжении — их строки скрыты/показаны вместе с чекбоксом.
  function onTidalStretchChange() {
    const on = els.tidalStretch.checked;
    els.stretchCoefficientRow.style.display = on ? '' : 'none';
    els.stretchDirectionRow.style.display = on ? '' : 'none';
  }

  function onStretchCoefficientChange() {
    const v = parseFloat(els.stretchCoefficient.value);
    stretchCoefficient = v / 100;
    els.stretchCoefficientReadout.textContent = `${stretchCoefficient.toFixed(2)}×`;
    recomputePhysics();
  }

  function onStretchDirectionChange() {
    stretchDirection = els.stretchDirection.value;
  }

  function onTidalCompressChange() {
    const on = els.tidalCompress.checked;
    els.compressCoefficientRow.style.display = on ? '' : 'none';
  }

  function onCompressCoefficientChange() {
    const v = parseFloat(els.compressCoefficient.value);
    compressCoefficient = v / 100;
    els.compressCoefficientReadout.textContent = `${compressCoefficient.toFixed(2)}×`;
    recomputePhysics();
  }

  function onApparentSizeChange() {
    const on = els.apparentSize.checked;
    els.apparentCoefficientRow.style.display = on ? '' : 'none';
  }

  function onApparentCoefficientChange() {
    const v = parseFloat(els.apparentCoefficient.value);
    apparentCoefficient = v / 100;
    els.apparentCoefficientReadout.textContent = `${apparentCoefficient.toFixed(2)}×`;
    recomputePhysics();
  }

  // Тип сигнала и число импульсов имеют смысл только при включённом режиме
  // сигнала — их строки скрыты/показаны вместе с чекбоксом signalMode, как и
  // коэффициент/направление растяжения выше. "Отключить тяготение" — общая
  // настройка, видна всегда (не только для сравнения с сигналом).
  function onSignalModeChange() {
    const on = els.signalMode.checked;
    els.signalTypeRow.style.display = on ? '' : 'none';
    onSignalTypeChange();
  }

  function onSignalTypeChange() {
    const showCount = els.signalMode.checked && els.signalType.value === 'count';
    els.signalCountRow.style.display = showCount ? '' : 'none';
  }

  function onSignalCountChange() {
    els.signalCountReadout.textContent = els.signalCount.value;
  }

  function onNoGravityChange() {
    // Задержки уже запущенного сигнала посчитаны для старого режима
    // тяготения — гасим его, а не показываем в рассинхроне с новым.
    signalActive = false;
    recomputePhysics();
  }

  function applyIntroState() {
    els.introText.classList.toggle('collapsed', !introExpanded);
    els.introToggle.setAttribute('aria-expanded', String(introExpanded));
  }

  function onIntroToggleClick() {
    introExpanded = !introExpanded;
    applyIntroState();
    scheduleSave();
  }

  // Маленькие раскрывающиеся "что это показывает?" под чекбоксами
  // растяжения/сжатия/видимого размера — тот же accordion-паттерн, что и у
  // "об этой симуляции" выше, но локальный к каждому эффекту и без
  // персистентности (всегда стартуют свёрнутыми, это просто пояснение, а не
  // настройка).
  function setupInfoToggle(toggleEl, textEl) {
    toggleEl.addEventListener('click', () => {
      const expanded = toggleEl.getAttribute('aria-expanded') === 'true';
      toggleEl.setAttribute('aria-expanded', String(!expanded));
      textEl.classList.toggle('collapsed', expanded);
    });
  }

  function applyInfoPanelState() {
    els.stats.classList.toggle('collapsed', !infoPanelExpanded);
    els.infoPanelToggle.setAttribute('aria-expanded', String(infoPanelExpanded));
  }

  function onInfoPanelToggleClick() {
    infoPanelExpanded = !infoPanelExpanded;
    applyInfoPanelState();
  }

  function updateStats() {
    els.stats.textContent =
      `${t('stats_horizon')}: ${rsPx.toFixed(0)} px\n` +
      `${t('stats_photonSphere')}: 1.5·Rs\n` +
      `${t('stats_isco')}: 3·Rs\n` +
      `${t('stats_pointsInField')}: ${points.length.toLocaleString(localeTag())}\n` +
      `${t('stats_scale')}: ${zoom.toFixed(2)}×`;
  }

  function setZoom(z) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    els.zoom.value = Math.round(zoom * 100);
    els.zoomReadout.textContent = `${zoom.toFixed(2)}×`;
    updateStats();
  }

  function onZoomChange() {
    setZoom(parseFloat(els.zoom.value) / 100);
  }

  function drawHorizon() {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(centerX, centerY, rsPx, 0, TWO_PI);
    ctx.fill();
  }

  function drawGrid() {
    const Lmax = properDistance(fieldRadius, rsPx);
    ctx.save();
    ctx.strokeStyle = 'rgba(94,234,212,0.4)';
    ctx.lineWidth = 1 / zoom;

    const rings = 11;
    for (let i = 1; i <= rings; i++) {
      const r = rsPx + (fieldRadius - rsPx) * (i / rings);
      const dr = distortedRadius(r, rsPx, fieldRadius, Lmax);
      ctx.beginPath();
      ctx.arc(centerX, centerY, dr, 0, TWO_PI);
      ctx.stroke();
    }

    const spokes = 20;
    for (let i = 0; i < spokes; i++) {
      const ang = (i / spokes) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(ang) * rsPx, centerY + Math.sin(ang) * rsPx);
      ctx.lineTo(centerX + Math.cos(ang) * fieldRadius, centerY + Math.sin(ang) * fieldRadius);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Форма кривой мерцания точки за один период (см. els.blinkCurve). "sine" —
  // исходная гладкая синусоида. Остальные три строятся из треугольной волны
  // v (0→1→0 за период, пик в середине) — "linear" отдаёт её как есть,
  // "easeIn"/"easeOut" переформовывают подъём/спад степенной функцией v^2 /
  // 1-(1-v)^2: easeIn дольше задерживается у низких значений и резко
  // взлетает к пику (компенсирует то, что глаз воспринимает даже среднюю
  // альфу как "довольно яркую" — без этого точки визуально мигают
  // непропорционально долго на пике и коротко в тени), easeOut — наоборот.
  // Раньше это была одна функция с ветвлением по curveType (строковое
  // сравнение) НА КАЖДУЮ точку НА КАЖДЫЙ кадр — при десятках тысяч точек
  // это давало заметный оверхед сверх самого вычисления. Теперь тип кривой
  // читается и разрешается в конкретную функцию ОДИН РАЗ за кадр (см.
  // drawPoints()), а в цикле по точкам — просто прямой вызов без сравнений.
  function blinkWaveSine(phase) {
    return 0.5 + 0.5 * Math.sin(phase);
  }
  function triangleV(phase) {
    let u = (phase / TWO_PI) % 1;
    if (u < 0) u += 1;
    return u < 0.5 ? u * 2 : (1 - u) * 2;
  }
  function blinkWaveLinear(phase) {
    return triangleV(phase);
  }
  function blinkWaveEaseIn(phase) {
    const v = triangleV(phase);
    return v * v;
  }
  function blinkWaveEaseOut(phase) {
    const v = triangleV(phase);
    return 1 - (1 - v) * (1 - v);
  }
  // Классический smoothstep (кубический ease-in-out): нулевая производная на
  // обоих концах (v=0 и v=1) — точка дольше задерживается и у пика яркости,
  // и у минимума, а переход между ними, наоборот, быстрее.
  function blinkWaveEaseInOut(phase) {
    const v = triangleV(phase);
    return v * v * (3 - 2 * v);
  }
  const BLINK_WAVE_FNS = {
    sine: blinkWaveSine,
    linear: blinkWaveLinear,
    easeIn: blinkWaveEaseIn,
    easeOut: blinkWaveEaseOut,
    easeInOut: blinkWaveEaseInOut,
  };

  function drawPoints() {
    // В синхронном режиме все точки стартуют в одной фазе (phase0 = 0). Так
    // как локальная угловая частота p.angFreq зависит только от радиуса r
    // (сферическая симметрия Шварцшильда), точки на одном и том же радиусе
    // всегда остаются в фазе друг с другом; расхождение фаз со временем
    // возникает только между разными радиусами — именно так, как и должно
    // расходиться собственное время наблюдателей на разной высоте над ЧД.
    const sync = els.syncMode.checked;
    const shapeIsRound = els.pointShape.value === 'circle';
    const stretchOn = els.tidalStretch.checked;
    const compressOn = els.tidalCompress.checked;
    const apparentOn = els.apparentSize.checked;
    const blinkFn = BLINK_WAVE_FNS[els.blinkCurve.value] || blinkWaveSine;

    // Точки с заметным растяжением и/или сжатием сгруппированы в конец points
    // (см. partitionByTransform) — их можно отрисовать через ЯВНУЮ матрицу
    // трансформации (setTransform), заранее посчитав общий множитель k/E/F
    // один раз на кадр, а не один save/rotate/restore на каждую точку. Именно
    // такие вызовы на точку и роняли FPS: раньше их было по одному на каждую
    // из тысяч точек в кадре, теперь — максимум одна пара save()/restore() на
    // ВЕСЬ кадр.
    const k = dpr * zoom;
    const E = dpr * (centerX + panX - zoom * centerX);
    const F = dpr * (centerY + panY - zoom * centerY);
    const transformFrom = (stretchOn || compressOn || apparentOn) ? transformStartIndex : points.length;
    let batchOpen = false;

    // Волна сигнала (см. fireSignal) не двигает точки — она лишь на короткое
    // время, пока проходит через точку (SIGNAL_FLASH_DURATION), "перезапускает"
    // её фазу с нуля и добавляет вспышку; до и после прохождения фронта точка
    // ведёт себя как обычно (sync/randPhase от simTime) — так каждый импульс
    // виден как отдельная кратковременная рябь, а не как необратимая
    // перестройка фазы навсегда. Импульс k (k=0,1,2,...) приходит в момент
    // signalStartTime + k*ИНТЕРВАЛ + p.sigDelay. Тип сигнала и число импульсов
    // читаются здесь же, вживую, а не фиксируются в момент клика — так смена
    // селектора сразу видна на уже идущем сигнале.
    const signalOn = els.signalMode.checked && signalActive;
    let liveMaxPulses = 1;
    if (signalOn) {
      const type = els.signalType.value;
      liveMaxPulses = type === 'continuous' ? Infinity
        : type === 'count' ? parseInt(els.signalCount.value, 10)
        : 1;
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let phase0, effT, flash = 0;
      let inPulse = false;
      if (signalOn && p.sigDelay !== undefined) {
        const pulseIndex = Math.floor((simTime - signalStartTime - p.sigDelay) / SIGNAL_PULSE_INTERVAL);
        if (pulseIndex >= 0 && pulseIndex < liveMaxPulses) {
          const hitTime = signalStartTime + pulseIndex * SIGNAL_PULSE_INTERVAL + p.sigDelay;
          const localT = simTime - hitTime;
          if (localT < SIGNAL_FLASH_DURATION) {
            inPulse = true;
            phase0 = 0;
            effT = localT;
            flash = SIGNAL_FLASH_STRENGTH * (1 - localT / SIGNAL_FLASH_DURATION);
          }
        }
      }
      if (!inPulse) {
        phase0 = sync ? 0 : p.randPhase;
        effT = simTime;
      }
      const wave = blinkFn(p.angFreq * effT + phase0);
      const pulse = 0.3 + 0.7 * wave;
      // jitterA — случайная амплитудная "дрожь" на точку, чтобы поле не
      // выглядело механически-одинаковым в обычном (несинхронном) режиме.
      // В синхронном режиме она, наоборот, ломает саму демонстрацию: точки
      // на одном радиусе честно мигают в одной фазе (одинаковый wave/pulse),
      // но с разной АМПЛИТУДОЙ jitterA выглядят как будто НЕ синхронны.
      // Поэтому в sync-режиме амплитудный джиттер отключается.
      const jitter = sync ? 1 : p.jitterA;
      let alpha = p.brightBase * pulse * jitter * overallBrightness + flash;
      if (alpha < 0) alpha = 0; else if (alpha > 1) alpha = 1;
      const half = p.size / 2;
      // Ниже ROUND_MIN_SIZE круг и квадрат неразличимы — не тратим на
      // arc()+fill() лишнее, рисуем как квадрат вне зависимости от формы.
      const round = shapeIsRound && p.size >= ROUND_MIN_SIZE;

      if (i >= transformFrom) {
        if (!batchOpen) { ctx.save(); batchOpen = true; }
        // Растяжение (stretch) и видимый размер для внешнего наблюдателя
        // (apparent) — оба действуют вдоль РАДИАЛЬНОЙ оси (просто с разным
        // знаком: 1/D растягивает, D сжимает), поэтому перемножаются в один
        // общий радиальный множитель. Приливное сжатие (compress) — вдоль
        // ТАНГЕНЦИАЛЬНОЙ оси, независимо от них.
        const sRadial = (stretchOn ? p.stretch : 1) * (apparentOn ? p.apparent : 1);
        const cTangential = compressOn ? p.compress : 1;
        // Точка, растянутая/сжатая вдоль радиуса в sRadial раз и сжатая
        // поперёк в cTangential раз, покрывает на экране примерно в
        // sRadial*cTangential раз бОльшую (или меньшую) площадь при той же
        // яркости на пиксель — без компенсации это выглядит как
        // непропорциональный скачок общей яркости у горизонта. При area>1
        // альфа приглушается, при area<1 (сжатие уменьшило площадь) —
        // наоборот усиливается.
        let combinedAlpha = alpha / Math.sqrt(sRadial * cTangential);
        if (combinedAlpha > 1) combinedAlpha = 1;
        ctx.fillStyle = palette[p.mixIdx][Math.round(combinedAlpha * ALPHA_LEVELS)];
        ctx.setTransform(k * p.cosAng * sRadial, k * p.sinAng * sRadial, -k * p.sinAng * cTangential, k * p.cosAng * cTangential, k * p.rx + E, k * p.ry + F);
        // В режиме "только к ЧД" сдвигаем центр фигуры в локальных
        // координатах так, чтобы внешний (дальний от ЧД) край остался на
        // своей исходной позиции (+half), а весь "избыток" радиального
        // изменения добавлялся только с внутренней (ближней к ЧД) стороны —
        // формула работает и при sRadial>1 (растяжение), и при sRadial<1
        // (сжатие): half/s - half при s=1 даёт 0 (симметричный случай не
        // меняется). Тангенциальное сжатие всегда симметрично (нет понятия
        // "направления" поперёк радиуса), поэтому сдвиг по X им не
        // затрагивается.
        const cx = stretchOn && stretchDirection === 'toward' ? half / sRadial - half : 0;
        if (round) {
          ctx.beginPath();
          ctx.arc(cx, 0, half, 0, TWO_PI);
          ctx.fill();
        } else {
          ctx.fillRect(cx - half, -half, p.size, p.size);
        }
      } else {
        if (batchOpen) { ctx.restore(); batchOpen = false; }
        ctx.fillStyle = palette[p.mixIdx][Math.round(alpha * ALPHA_LEVELS)];
        if (round) {
          ctx.beginPath();
          ctx.arc(p.rx, p.ry, half, 0, TWO_PI);
          ctx.fill();
        } else {
          ctx.fillRect(p.rx - half, p.ry - half, p.size, p.size);
        }
      }
    }
    if (batchOpen) ctx.restore();
  }

  // Маркер точки клика, откуда расходится сигнал — контрастный цвет, чтобы
  // можно было честно увидеть, где на самом деле находится центр волны, и
  // сравнить с видимым положением фронта (у горизонта фронт распространяется
  // неравномерно по направлениям — сильно медленнее в сторону/вблизи ЧД,
  // — поэтому "яркое кольцо" волны может визуально казаться сместившимся от
  // исходной точки; это ожидаемое искажение, а не смещение самого маркера).
  function drawSignalOrigin() {
    const r = 2.5 / zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(0,215,235,0.7)';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(signalOriginX, signalOriginY, r, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);
    ctx.translate(-centerX, -centerY);

    if (els.showGrid.checked) drawGrid();
    drawPoints();
    drawHorizon();
    if (els.signalMode.checked && signalActive) drawSignalOrigin();

    ctx.restore();
  }

  // Счётчик FPS: считаем кадры в скользящем окне ~500мс и раз в окно
  // обновляем текст — обновление DOM на каждый кадр было бы само по себе
  // лишней нагрузкой и дёргало бы цифру слишком быстро для чтения.
  let fpsFrameCount = 0;
  let fpsWindowStartMs = 0;

  function frame(nowMs) {
    requestAnimationFrame(frame);
    if (!lastFrameMs) lastFrameMs = nowMs;
    const dt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;
    if (!els.pause.checked) {
      simTime += dt * timeScale;
    }
    draw();

    fpsFrameCount++;
    if (!fpsWindowStartMs) fpsWindowStartMs = nowMs;
    const windowElapsed = nowMs - fpsWindowStartMs;
    if (windowElapsed >= 500) {
      const fps = Math.round((fpsFrameCount * 1000) / windowElapsed);
      els.fpsReadout.textContent = `FPS: ${fps}`;
      fpsFrameCount = 0;
      fpsWindowStartMs = nowMs;
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  els.langSelect.addEventListener('change', onLangSelectChange);
  els.hudHideBtn.addEventListener('click', () => document.body.classList.add('hudCollapsed'));
  els.hudShowBtn.addEventListener('click', () => document.body.classList.remove('hudCollapsed'));
  els.mass.addEventListener('input', onMassChange);
  els.freq.addEventListener('input', onFreqChange);
  els.speed.addEventListener('input', onSpeedChange);
  els.density.addEventListener('input', onDensityChange);
  els.zoom.addEventListener('input', onZoomChange);
  els.distribution.addEventListener('change', onDistributionChange);
  els.brightness.addEventListener('input', onBrightnessChange);
  els.colorGradient.addEventListener('input', onColorGradientChange);
  els.overallBrightness.addEventListener('input', onOverallBrightnessChange);
  els.sizeMode.addEventListener('change', onSizeModeChange);
  els.fixedSize.addEventListener('input', onFixedSizeChange);
  els.tidalStretch.addEventListener('change', onTidalStretchChange);
  els.stretchCoefficient.addEventListener('input', onStretchCoefficientChange);
  els.stretchDirection.addEventListener('change', onStretchDirectionChange);
  els.tidalCompress.addEventListener('change', onTidalCompressChange);
  els.compressCoefficient.addEventListener('input', onCompressCoefficientChange);
  els.apparentSize.addEventListener('change', onApparentSizeChange);
  els.apparentCoefficient.addEventListener('input', onApparentCoefficientChange);
  els.signalMode.addEventListener('change', onSignalModeChange);
  els.signalType.addEventListener('change', onSignalTypeChange);
  els.signalCount.addEventListener('input', onSignalCountChange);
  els.noGravity.addEventListener('change', onNoGravityChange);
  els.introToggle.addEventListener('click', onIntroToggleClick);
  setupInfoToggle(els.stretchInfoToggle, els.stretchInfoText);
  setupInfoToggle(els.compressInfoToggle, els.compressInfoText);
  setupInfoToggle(els.apparentInfoToggle, els.apparentInfoText);
  els.infoPanelToggle.addEventListener('click', onInfoPanelToggleClick);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0012);
    setZoom(zoom * factor);
    scheduleSave(); // setZoom меняет els.zoom.value программно, без события input
  }, { passive: false });

  // Двойной клик центрирует ЧД (сбрасывает только позицию), масштаб не
  // трогает — это просто "вернуть вид в центр", а не полный сброс камеры.
  canvas.addEventListener('dblclick', () => {
    panX = 0;
    panY = 0;
    scheduleSave();
  });

  let dragging = false;
  let dragMoved = false;
  let dragStartX = 0, dragStartY = 0, dragPanStartX = 0, dragPanStartY = 0;
  const CLICK_MOVE_THRESHOLD = 4; // px — отличает "клик на месте" от начала перетаскивания

  // Клик/тап без перетаскивания в режиме сигнала — общая логика для мыши
  // (mouseup) и тача (touchend). Координаты клика (в системе клиента)
  // переводятся в то же рендер-пространство, где заданы позиции точек
  // (p.rx/p.ry) — точно обратное преобразование тому, что делает
  // draw()/updateTooltip(). Клик внутри горизонта не запускает сигнал
  // (оттуда "испускать" нечего) — вместо этого останавливает уже идущую
  // отправку. Отправить сигнал можно откуда угодно ещё, в том числе из-за
  // пределов текущего поля точек (виден он всё равно только на самих
  // точках).
  function handleFieldTap(clientX, clientY) {
    if (!els.signalMode.checked) return;
    const wx = centerX + (clientX - panX - centerX) / zoom;
    const wy = centerY + (clientY - panY - centerY) / zoom;
    const clickR = Math.hypot(wx - centerX, wy - centerY);
    if (clickR <= rsPx) {
      stopSignal();
    } else {
      fireSignal(wx, wy);
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanStartX = panX;
    dragPanStartY = panY;
    canvas.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    if (!dragMoved && Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > CLICK_MOVE_THRESHOLD) {
      dragMoved = true;
    }
    panX = dragPanStartX + (e.clientX - dragStartX);
    panY = dragPanStartY + (e.clientY - dragStartY);
  });

  window.addEventListener('mouseup', (e) => {
    if (dragging) {
      scheduleSave(); // положение viewport сохраняем по завершении перетаскивания
      if (!dragMoved) handleFieldTap(e.clientX, e.clientY);
    }
    dragging = false;
    canvas.classList.remove('dragging');
  });

  // --- Touch: панорамирование одним пальцем, зум щипком (pinch-to-zoom),
  // тап — как клик (сигнал), двойной тап — как двойной клик
  // (центрирование). Мобильные жесты, зеркалящие мышиные выше. touchstart
  // висит на canvas (жест должен НАЧАТЬСЯ на поле, а не, скажем, на панели
  // настроек — тогда естественный скролл панели не трогаем), а
  // touchmove/touchend — на window, как и для мыши, чтобы жест не срывался,
  // если палец уйдёт за пределы canvas.
  let touchMode = null; // null | 'pan' | 'pinch'
  let touchMoved = false;
  let touchStartX = 0, touchStartY = 0, touchPanStartX = 0, touchPanStartY = 0;
  let pinchStartDist = 0, pinchStartZoom = 1;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_DIST = 40;

  function touchDist(t0, t1) {
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  }

  function beginTouchPan(clientX, clientY) {
    touchMode = 'pan';
    touchMoved = false;
    touchStartX = clientX;
    touchStartY = clientY;
    touchPanStartX = panX;
    touchPanStartY = panY;
  }

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      beginTouchPan(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      touchMode = 'pinch';
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartZoom = zoom;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (touchMode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      if (!touchMoved && Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) > CLICK_MOVE_THRESHOLD) {
        touchMoved = true;
      }
      panX = touchPanStartX + (t.clientX - touchStartX);
      panY = touchPanStartY + (t.clientY - touchStartY);
    } else if (touchMode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      if (pinchStartDist > 0) {
        const dist = touchDist(e.touches[0], e.touches[1]);
        setZoom(pinchStartZoom * (dist / pinchStartDist));
      }
    }
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (touchMode === 'pan') {
      scheduleSave();
      if (!touchMoved) {
        const t = e.changedTouches[0];
        const now = performance.now();
        const isDoubleTap = (now - lastTapTime) < DOUBLE_TAP_MS
          && Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY) < DOUBLE_TAP_DIST;
        if (isDoubleTap) {
          panX = 0;
          panY = 0;
          scheduleSave();
          lastTapTime = 0; // не даём следующему (тройному) тапу снова сработать как двойной
        } else {
          handleFieldTap(t.clientX, t.clientY);
          lastTapTime = now;
          lastTapX = t.clientX;
          lastTapY = t.clientY;
        }
      }
    } else if (touchMode === 'pinch') {
      scheduleSave(); // масштаб мог измениться щипком
    }
    // Если из щипка (2 пальца) остался один — продолжаем панорамирование с
    // этой точки, а не бросаем жест на середине.
    if (e.touches.length === 1) {
      beginTouchPan(e.touches[0].clientX, e.touches[0].clientY);
      touchMoved = true; // уже было движение (щипок) — не считать это тапом
    } else {
      touchMode = null;
    }
  }, { passive: false });

  window.addEventListener('touchcancel', () => {
    touchMode = null;
  }, { passive: true });

  function formatDilation(D, trueR) {
    const ratio = (trueR / rsPx).toFixed(2);
    if (D <= 0.0005) {
      return `r ≈ ${ratio}·R<sub>s</sub><br>${t('tooltip_eventHorizon')}<br>${t('tooltip_timeStops')}`;
    }
    return `r ≈ ${ratio}·R<sub>s</sub><br>dτ/dt ≈ ${D.toFixed(4)}<br>${t('tooltip_slowdown')}${(1 / D).toFixed(2)}`;
  }

  let lastMouseX = null, lastMouseY = null;
  let hasMousePos = false;

  function updateTooltip(clientX, clientY) {
    if (!els.showTooltip.checked || !hasMousePos) {
      els.tooltip.style.display = 'none';
      return;
    }
    const wx = centerX + (clientX - panX - centerX) / zoom;
    const wy = centerY + (clientY - panY - centerY) / zoom;
    const renderedR = Math.min(Math.hypot(wx - centerX, wy - centerY), fieldRadius);
    const Lmax = properDistance(fieldRadius, rsPx);
    const trueR = invertProperDistance(renderedR, rsPx, fieldRadius, Lmax);
    const D = renderedR <= rsPx ? 0 : Math.sqrt(Math.max(0, 1 - rsPx / trueR));

    els.tooltip.innerHTML = formatDilation(D, trueR);
    els.tooltip.style.left = Math.min(clientX + 16, window.innerWidth - 190) + 'px';
    els.tooltip.style.top = Math.min(clientY + 16, window.innerHeight - 80) + 'px';
    els.tooltip.style.display = 'block';
  }

  // На window, а не на canvas: событие должно доходить, даже если курсор
  // сейчас над HUD-панелью (та перекрывает canvas и глотает наведение).
  window.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    hasMousePos = true;
    updateTooltip(lastMouseX, lastMouseY);
  });

  window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
      hasMousePos = false;
      els.tooltip.style.display = 'none';
    }
  });

  // Если галочку включили, пока мышь уже неподвижна — подсказка должна
  // появиться сразу же, не дожидаясь следующего движения курсора.
  els.showTooltip.addEventListener('change', () => updateTooltip(lastMouseX, lastMouseY));

  function applySettings() {
    onMassChange();
    onFreqChange();
    onSpeedChange();
    onDensityChange();
    onZoomChange();
    onBrightnessChange();
    onColorGradientChange();
    onOverallBrightnessChange();
    onSizeModeChange();
    onFixedSizeChange();
    onTidalStretchChange();
    onStretchCoefficientChange();
    onStretchDirectionChange();
    onTidalCompressChange();
    onCompressCoefficientChange();
    onApparentSizeChange();
    onApparentCoefficientChange();
    onSignalModeChange();
    onSignalCountChange();
    updateResetPhasesAvailability();
    applyIntroState();
    applyInfoPanelState();
    updateStats();
  }

  els.syncMode.addEventListener('change', updateResetPhasesAvailability);

  // Автосохранение: любое изменение сохраняемого параметра планирует запись
  // в localStorage с задержкой в 1 секунду (debounce), чтобы не писать на
  // каждый пиксель перетаскивания ползунка.
  for (const key in persistedEls) {
    const el = persistedEls[key];
    const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
    el.addEventListener(evt, scheduleSave);
  }

  els.resetBtn.addEventListener('click', resetSettings);
  els.resetPhasesBtn.addEventListener('click', resetPhases);
  els.copyBtn.addEventListener('click', copySettings);

  els.horizonAuto.addEventListener('change', () => { onHorizonAutoChange(); scheduleSave(); });
  els.resetPaletteBtn.addEventListener('click', () => { resetColorsToDefault(); scheduleSave(); });
  els.paletteSelect.addEventListener('change', applySelectedPalette);
  els.savePaletteBtn.addEventListener('click', savePaletteAs);
  els.deletePaletteBtn.addEventListener('click', deleteSelectedPalette);

  // loadSettings() должен отработать ДО applyStaticTranslations()/buildSwatches():
  // он восстанавливает els.langSelect.value из localStorage, а currentLang()
  // (и всё, что зовёт t()) читает именно его.
  loadSettings();
  applyStaticTranslations();
  buildSwatches();
  applyColorState();
  refreshPaletteSelect();
  resize();
  applySettings();

  requestAnimationFrame(frame);
})();
