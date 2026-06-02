/**
 * CalendarUI — a Stardew-style date HUD and calendar panel.
 *
 * A small always-on widget (top-right, under the parcel-coordinate overlay)
 * shows the avatar's local season, day and clock. Clicking it opens the
 * calendar panel in the 3-D world: one season at a time as a 4×7 grid (four
 * weeks), each day carrying its weather forecast, the current day highlighted.
 * Season tabs switch which season the grid shows.
 *
 * Both the season and the per-day weather track the avatar's latitude and
 * position, so the calendar is a real local forecast. Driven by the WorldClock
 * and the WeatherSystem. See docs/WEATHER_SYSTEM_PLAN.md.
 *
 * @module ui/CalendarUI
 */

const SEASON_LABELS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'];

// One icon per day of the 7-day lunar cycle; used by the HUD widget only.
const MOON_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌘'];
const MOON_LABELS = ['New', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full', 'Waning Gibbous', 'Waning Crescent'];

// Weather forecast category → icon (matches WeatherSystem.forecast()).
// Three precipitation tiers + snow, each with a distinct glyph:
//   ☀️  clear     ⛅  partly cloudy   ☁️  cloudy
//   🌦️  drizzle   🌧️  heavy rain      ⛈️  storm (rain + lightning)
//   🌨️  snow
const WEATHER_ICONS = {
  clear: '☀️', partly: '⛅', cloudy: '☁️',
  drizzle: '🌦️', heavy: '🌧️',
  storm: '⛈️', snow: '🌨️',
};

/** Moon icon index for a 0..1 lunar-cycle fraction. */
const moonIndex = (frac) => Math.round(frac * MOON_ICONS.length) % MOON_ICONS.length;

/** Format a 0..24 hour-of-day float as HH:MM. */
const formatClock = (timeOfDay) => {
  const h = Math.floor(timeOfDay) % 24;
  const m = Math.floor((timeOfDay % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const HUD_HTML = `
  <div class="cal-hud-row">
    <span class="cal-hud-season" id="cal-hud-season">Spring</span>
    <span class="cal-hud-day" id="cal-hud-day">Day 1</span>
  </div>
  <div class="cal-hud-row cal-hud-row--sub">
    <span class="cal-hud-clock" id="cal-hud-clock">06:00</span>
    <span class="cal-hud-moon" id="cal-hud-moon">🌑</span>
  </div>
`;

const PANEL_HTML = `
  <div class="cal-panel-header">
    <span class="cal-panel-title">Calendar</span>
    <span class="cal-panel-year" id="cal-panel-year">Year 1</span>
    <button class="cal-panel-close" id="cal-panel-close" aria-label="Close">✕</button>
  </div>
  <div class="cal-tabs" id="cal-tabs"></div>
  <div class="cal-grid" id="cal-grid"></div>
  <div class="cal-timewarp slider-row">
    <span class="cal-timewarp-label">Time warp</span>
    <div class="slider-container"><input type="range" class="slider-input" id="cal-timewarp" min="1" max="120" step="1" value="1"></div>
    <span class="slider-value" id="cal-timewarp-val">×1</span>
  </div>
  <div class="cal-panel-footer">
    <span class="cal-foot-clock" id="cal-foot-clock">06:00</span>
    <span class="cal-foot-moon" id="cal-foot-moon">🌑 New Moon</span>
  </div>
`;

/**
 * Create the calendar HUD widget and panel, injecting both into the document.
 * The HUD is a 2-D overlay; the panel is opened in the 3-D world by the host's
 * toggle callback (the same HtmlPanelSystem the other panels use).
 * @param {object} worldClock - WorldClock (localCalendar, moonPhaseAt, latitudeOf).
 * @param {object} weatherSystem - WeatherSystem (forecast()).
 * @param {() => void} onTogglePanel - Shows/hides the in-world calendar panel.
 * @returns {{update: (avatarNormal:number[]) => void}}
 */
export const createCalendarUI = (worldClock, weatherSystem, onTogglePanel) => {
  const daysPerSeason = worldClock.localCalendar(0).daysPerSeason;

  // --- HUD widget (clickable) ---
  const hud = document.createElement('div');
  hud.id = 'calendar-hud';
  hud.title = 'Open calendar';
  hud.innerHTML = HUD_HTML;
  document.body.appendChild(hud);

  // --- Calendar panel (popup, opened in-world) ---
  const panel = document.createElement('div');
  panel.id = 'calendar-panel';
  panel.innerHTML = PANEL_HTML;
  document.body.appendChild(panel);

  // Which season the grid shows; -1 until the first update defaults it to the
  // avatar's current season.
  let viewedSeason = -1;
  const setViewed = (s) => { viewedSeason = s; };

  // Season tabs — buttons so the in-world HtmlPanelSystem replays clicks.
  const tabEls = SEASON_LABELS.map((label, i) => {
    const tab = document.createElement('button');
    tab.className = `cal-tab cal-season--${SEASON_KEYS[i]}`;
    tab.textContent = label;
    tab.addEventListener('click', () => setViewed(i));
    panel.querySelector('#cal-tabs').appendChild(tab);
    return tab;
  });

  // Day grid — one cell per day of a season (number + weather forecast icon).
  const gridEl = panel.querySelector('#cal-grid');
  const dayCells = [];
  const weatherEls = [];
  for (let d = 0; d < daysPerSeason; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = String(d + 1);
    const weather = document.createElement('span');
    weather.className = 'cal-day-weather';
    weather.textContent = WEATHER_ICONS.clear;
    cell.append(num, weather);
    gridEl.appendChild(cell);
    dayCells.push(cell);
    weatherEls.push(weather);
  }

  const el = {
    hudSeason: hud.querySelector('#cal-hud-season'),
    hudDay: hud.querySelector('#cal-hud-day'),
    hudClock: hud.querySelector('#cal-hud-clock'),
    hudMoon: hud.querySelector('#cal-hud-moon'),
    year: panel.querySelector('#cal-panel-year'),
    footClock: panel.querySelector('#cal-foot-clock'),
    footMoon: panel.querySelector('#cal-foot-moon'),
  };

  let shownSeason = -1, shownDay = -1, shownClock = '', shownYear = -1;
  let shownViewed = -1, shownCurrent = -1;
  let curMoonIndex = 0, shownHudIcon = '';
  const shownWeather = new Array(daysPerSeason).fill('');

  // Time-warp slider — accelerates the world clock to inspect the day/weather
  // cycle. It lives in the calendar now that the Environment panel is gone; the
  // in-world HtmlPanelSystem drives the range input by drag.
  const timewarp = panel.querySelector('#cal-timewarp');
  const timewarpVal = panel.querySelector('#cal-timewarp-val');
  timewarp.value = String(worldClock.timeScale);
  timewarpVal.textContent = `×${Math.round(worldClock.timeScale)}`;
  timewarp.addEventListener('input', () => {
    const v = Math.max(1, parseInt(timewarp.value, 10) || 1);
    worldClock.setTimeScale(v);
    timewarpVal.textContent = `×${v}`;
  });

  // The widget is the 2-D access point; the panel opens in the 3-D world.
  hud.addEventListener('click', (e) => { e.stopPropagation(); onTogglePanel(); });

  return {
    /**
     * Refresh the HUD and the calendar panel from the world clock and weather.
     * The panel is rasterized in-world every frame, so its DOM is kept current
     * here whether it is open or not.
     * @param {number[]} avatarNormal - Vector from the planet centre to the avatar.
     */
    update(avatarNormal) {
      const lat = worldClock.latitudeOf(avatarNormal);
      const cal = worldClock.localCalendar(lat);
      if (viewedSeason < 0) viewedSeason = cal.seasonIndex;

      // HUD — touch the DOM only when a displayed value actually changes.
      if (cal.seasonIndex !== shownSeason) {
        el.hudSeason.textContent = SEASON_LABELS[cal.seasonIndex];
        el.hudSeason.className = `cal-hud-season cal-season--${SEASON_KEYS[cal.seasonIndex]}`;
        tabEls.forEach((t, i) => t.classList.toggle('current', i === cal.seasonIndex));
        shownSeason = cal.seasonIndex;
      }
      if (cal.year !== shownYear) {
        el.year.textContent = `Year ${cal.year}`;
        shownYear = cal.year;
      }
      if (cal.dayInSeason !== shownDay) {
        el.hudDay.textContent = `Day ${cal.dayInSeason + 1}`;
        curMoonIndex = moonIndex(worldClock.moonPhaseAt(cal.dayInSeason));
        el.footMoon.textContent = `${MOON_ICONS[curMoonIndex]} ${MOON_LABELS[curMoonIndex]} Moon`;
        shownDay = cal.dayInSeason;
      }
      const clock = formatClock(cal.timeOfDay);
      if (clock !== shownClock) {
        el.hudClock.textContent = clock;
        el.footClock.textContent = clock;
        shownClock = clock;
      }

      // HUD glyph tracks the local sky: the sun while it is up, the live moon
      // phase once it sets. (The panel footer always names the moon phase.)
      const hudIcon = worldClock.isNight ? MOON_ICONS[curMoonIndex] : '☀️';
      if (hudIcon !== shownHudIcon) {
        el.hudMoon.textContent = hudIcon;
        shownHudIcon = hudIcon;
      }

      // Active season tab.
      if (viewedSeason !== shownViewed) {
        tabEls.forEach((t, i) => t.classList.toggle('active', i === viewedSeason));
        shownViewed = viewedSeason;
      }

      // Current-day highlight — only when the grid shows the live season.
      const wantCurrent = viewedSeason === cal.seasonIndex ? cal.dayInSeason : -1;
      if (wantCurrent !== shownCurrent) {
        if (shownCurrent >= 0) dayCells[shownCurrent].classList.remove('current');
        if (wantCurrent >= 0) dayCells[wantCurrent].classList.add('current');
        shownCurrent = wantCurrent;
      }

      // Per-day weather forecast for the viewed season — the year's days are
      // consecutive world days; the year start sits at
      // `floor(worldDays) − localDayOfYear`. The current day is sampled at the
      // live fractional time so its icon tracks the weather seen right now;
      // other days are forecast from their day start.
      const yearStart = Math.floor(worldClock.worldDays)
        - (cal.seasonIndex * daysPerSeason + cal.dayInSeason);
      for (let d = 0; d < daysPerSeason; d++) {
        const isToday = viewedSeason === cal.seasonIndex && d === cal.dayInSeason;
        const worldDay = isToday
          ? worldClock.worldDays
          : yearStart + viewedSeason * daysPerSeason + d;
        const kind = weatherSystem.forecast(avatarNormal, worldDay, SEASON_KEYS[viewedSeason]);
        if (kind !== shownWeather[d]) {
          weatherEls[d].textContent = WEATHER_ICONS[kind] ?? WEATHER_ICONS.clear;
          shownWeather[d] = kind;
        }
      }
    },
  };
};
