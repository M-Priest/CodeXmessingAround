'use strict';

const planetRadius = 24_000; // Kilometers
const earthGravity = 0.00980665; // Kilometers per second squared
const timeScale = 3_600;
const presets = [
  { gravity: 1, distance: 4, inclination: 28 },
  { gravity: 1.7, distance: 2.4, inclination: 12 },
  { gravity: 0.7, distance: 7, inclination: 62 },
];

const state = {
  ...presets[0],
  phase: 0.65,
  trails: true,
  playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  activePreset: 0,
};
const controls = {
  gravity: document.getElementById('gravity'),
  distance: document.getElementById('distance'),
  inclination: document.getElementById('inclination'),
};
const formatControl = {
  gravity: value => `${value.toFixed(1)} g`,
  distance: value => `${value.toFixed(1)} Rₚ`,
  inclination: value => `${value}°`,
};
const telemetry = Object.fromEntries(
  ['velocity', 'period', 'altitude'].map(id => [id, document.getElementById(id)]),
);
const outputs = Object.fromEntries(
  Object.keys(controls).map(id => [id, document.getElementById(`${id}-value`)]),
);
const presetButtons = Array.from(document.querySelectorAll('.preset'));
const trails = document.getElementById('trails');
const playback = document.getElementById('playback');
const viewport = document.getElementById('orbit-viewport');
const fullscreen = document.getElementById('fullscreen');
const guide = document.getElementById('field-guide');
const renderer = new OrbitRenderer(document.getElementById('orbit-canvas'));
const altitudeFormat = new Intl.NumberFormat('en-US');
let angularSpeed = 0;
let lastFrame;
let frameRequest;

function requestRender() {
  if (frameRequest === undefined) frameRequest = requestAnimationFrame(draw);
}

function draw(now) {
  frameRequest = undefined;
  if (state.playing && lastFrame !== undefined) {
    const elapsed = Math.min(0.05, (now - lastFrame) / 1_000);
    state.phase = (state.phase + elapsed * angularSpeed * timeScale) % (2 * Math.PI);
  }
  lastFrame = state.playing ? now : undefined;
  renderer.render(state);
  if (state.playing) requestRender();
}

function updateSimulation() {
  for (const [key, input] of Object.entries(controls)) {
    const value = state[key];
    const percentage = (value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.value = value;
    input.style.setProperty('--fill', `${percentage}%`);
    input.setAttribute('aria-valuetext', formatControl[key](value));
    outputs[key].value = formatControl[key](value);
  }

  const radius = planetRadius * state.distance;
  // Surface gravity = GM / R². A circular orbit obeys v² = GM / r.
  const gravitationalParameter = state.gravity * earthGravity * planetRadius ** 2;
  const speed = Math.sqrt(gravitationalParameter / radius);
  angularSpeed = speed / radius;
  telemetry.velocity.textContent = speed.toFixed(2);
  telemetry.period.textContent = (2 * Math.PI / angularSpeed / 3_600).toFixed(1);
  telemetry.altitude.textContent = altitudeFormat.format(Math.round(radius - planetRadius));

  state.activePreset = presets.findIndex(preset =>
    Object.keys(controls).every(key => preset[key] === state[key]),
  );
  presetButtons.forEach((button, index) =>
    button.setAttribute('aria-pressed', String(index === state.activePreset)),
  );
  trails.checked = state.trails;
  requestRender();
}

function updatePlayback() {
  playback.querySelector('span').textContent = state.playing ? 'Pause simulation' : 'Resume simulation';
  playback.querySelector('use').setAttribute('href', state.playing ? '#pause-icon' : '#play-icon');
  document.getElementById('live-label').textContent = state.playing ? 'LIVE SIMULATION' : 'SIMULATION PAUSED';
  document.getElementById('live-dot').classList.toggle('paused', !state.playing);
  lastFrame = undefined;
  requestRender();
}

for (const [key, input] of Object.entries(controls)) {
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    updateSimulation();
  });
}
for (const [index, button] of presetButtons.entries()) {
  button.addEventListener('click', () => {
    Object.assign(state, presets[index], { phase: 0.65 });
    updateSimulation();
  });
}

trails.addEventListener('change', () => {
  state.trails = trails.checked;
  requestRender();
});
playback.addEventListener('click', () => {
  state.playing = !state.playing;
  updatePlayback();
});
document.getElementById('reset').addEventListener('click', () => {
  Object.assign(state, presets[0], { phase: 0.65, trails: true });
  updateSimulation();
});
document.getElementById('open-guide').addEventListener('click', () => guide.showModal());

if (!document.fullscreenEnabled) fullscreen.hidden = true;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement === viewport) await document.exitFullscreen();
    else await viewport.requestFullscreen();
  } catch (error) {
    console.warn('Fullscreen is unavailable.', error);
  }
});
document.addEventListener('fullscreenchange', () => {
  const expanded = document.fullscreenElement === viewport;
  const label = expanded ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreen.title = label;
  fullscreen.setAttribute('aria-label', label);
  fullscreen.querySelector('use').setAttribute('href', expanded ? '#shrink-icon' : '#expand-icon');
  requestRender();
});
new ResizeObserver(requestRender).observe(viewport);

updateSimulation();
updatePlayback();
