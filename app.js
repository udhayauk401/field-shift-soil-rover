const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const speedSlider = document.querySelector('#speedSlider');
const speedValue = document.querySelector('#speedValue');
const servoAngleSlider = document.querySelector('#servoAngleSlider');
const servoAngleValue = document.querySelector('#servoAngleValue');
const setServoAngleButton = document.querySelector('#setServoAngleButton');
const currentServoPosition = document.querySelector('#currentServoPosition');
const roverStatus = document.querySelector('#roverStatus');
const statusLight = document.querySelector('#statusLight');
const connectionStatus = document.querySelector('#connectionStatus');
const connectionLabel = document.querySelector('#connectionLabel');
const driveText = document.querySelector('#driveText');
const velocityReadout = document.querySelector('#velocityReadout');
const readoutPercent = document.querySelector('#readoutPercent');
const motorReadout = document.querySelector('#motorReadout');
const motorStatus = document.querySelector('#motorStatus');

const collectionButton = document.querySelector('#collectionButton');
const backButton = document.querySelector('#backButton');
const sequenceState = document.querySelector('#sequenceState');
const servoStatus = document.querySelector('#servoStatus');

function setSequenceState(message, color = 'var(--green)') {
  sequenceState.textContent = message;
  sequenceState.style.color = color;
}

function updateCollectionSequence(stepIndex) {
  const items = document.querySelectorAll('.sequence-list li');
  items.forEach((item, index) => {
    const isComplete = index <= stepIndex;
    item.classList.toggle('complete', isComplete);
    item.querySelector('i').textContent = isComplete ? '✓' : '○';
  });
}

const historyBody = document.querySelector('#historyBody');
const emptyState = document.querySelector('#emptyState');
const visibleCount = document.querySelector('#visibleCount');

const databaseUrl = 'http://localhost:3001/readings';
const esp32Url = 'http://10.82.97.252';
document.querySelector('#esp32Ip').textContent = esp32Url;

const cropProfiles = [
  {
    name: 'Maize',
    season: ['Monsoon', 'Summer'],
    temperatureRange: [20, 35],
    moistureRange: [45, 75],
    rainRange: [20, 90],
    priorities: ['Higher yield potential', 'Improve soil health', 'Maintain soil moisture'],
    note: 'Responsive to warm conditions and moderate-to-high moisture availability.'
  },
  {
    name: 'Sorghum',
    season: ['Monsoon', 'Summer', 'Winter'],
    temperatureRange: [22, 38],
    moistureRange: [35, 70],
    rainRange: [10, 75],
    priorities: ['Lower water requirement', 'Crop rotation', 'Maintain soil moisture'],
    note: 'Tolerates drier conditions and can fit rotation planning well.'
  },
  {
    name: 'Soybean',
    season: ['Monsoon', 'Summer'],
    temperatureRange: [18, 32],
    moistureRange: [50, 80],
    rainRange: [25, 85],
    priorities: ['Improve soil health', 'Crop rotation', 'Higher yield potential'],
    note: 'Performs well with moderate rainfall and balanced soil moisture.'
  },
  {
    name: 'Groundnut',
    season: ['Monsoon', 'Summer'],
    temperatureRange: [20, 35],
    moistureRange: [40, 70],
    rainRange: [15, 70],
    priorities: ['Improve soil health', 'Maintain soil moisture', 'Crop rotation'],
    note: 'Suited to moderate moisture and relatively stable seasonal windows.'
  },
  {
    name: 'Finger Millet',
    season: ['Monsoon', 'Winter'],
    temperatureRange: [18, 30],
    moistureRange: [35, 65],
    rainRange: [10, 60],
    priorities: ['Lower water requirement', 'Crop rotation', 'Improve soil health'],
    note: 'A resilient choice for rotation and moderate moisture fields.'
  }
];

let isRunning = false;
let roverDirection = 'stopped';
let allReadings = [];

function getCurrentSeason(date = new Date()) {
  const month = date.getMonth() + 1;

  if (month >= 6 && month <= 8) {
    return 'Monsoon';
  }

  if (month >= 3 && month <= 5) {
    return 'Summer';
  }

  if (month >= 9 && month <= 11) {
    return 'Winter';
  }

  return 'Winter';
}

function getLatestFieldSnapshot() {
  const liveSoil = Number(document.querySelector('#moistureValue')?.textContent || 0);
  const liveRain = Number(document.querySelector('#rainValue')?.textContent || 0);
  const liveTemp = Number(document.querySelector('#tempValue')?.textContent || 0);
  const liveHumidity = Number(document.querySelector('#humidityValue')?.textContent || 0);
  const liveMq135 = Number(document.querySelector('#airValue')?.textContent || 0);
  const latestReading = allReadings.length ? allReadings[allReadings.length - 1] : null;
  const soilReading = Number(latestReading?.soil ?? latestReading?.soilMoisture ?? liveSoil);
  const rainReading = Number(latestReading?.rain ?? liveRain);

  return {
    soilMoisture: soilReading > 100 ? rawAnalogToPercent(soilReading) : soilReading,
    rain: rainReading > 100 ? rawAnalogToPercent(rainReading) : rainReading,
    temperature: Number((latestReading?.temperature ?? liveTemp) || 0),
    humidity: Number((latestReading?.humidity ?? liveHumidity) || 0),
    mq135: Number((latestReading?.mq135 ?? liveMq135) || 0),
    season: getCurrentSeason(),
    time: latestReading?.time || new Date().toISOString(),
    previousCrop: latestReading?.previousCrop || null
  };
}

function evaluateCropProfile(profile, snapshot, priority) {
  const tempMatch = snapshot.temperature >= profile.temperatureRange[0] && snapshot.temperature <= profile.temperatureRange[1];
  const moistureMatch = snapshot.soilMoisture >= profile.moistureRange[0] && snapshot.soilMoisture <= profile.moistureRange[1];
  const rainMatch = snapshot.rain >= profile.rainRange[0] && snapshot.rain <= profile.rainRange[1];
  const seasonMatch = profile.season.includes(snapshot.season);
  const priorityMatch = profile.priorities.includes(priority);

  let score = 0;
  const reasons = [];

  if (tempMatch) {
    score += 1;
    reasons.push({ label: 'TEMPERATURE', value: 'Suitable' });
  } else {
    reasons.push({ label: 'TEMPERATURE', value: 'Moderate' });
  }

  if (moistureMatch) {
    score += 1;
    reasons.push({ label: 'SOIL MOISTURE', value: 'Suitable' });
  } else {
    reasons.push({ label: 'SOIL MOISTURE', value: 'Borderline' });
  }

  if (rainMatch) {
    score += 1;
    reasons.push({ label: 'RAIN CONDITION', value: 'Moderate' });
  } else {
    reasons.push({ label: 'RAIN CONDITION', value: 'Variable' });
  }

  if (seasonMatch) {
    score += 1;
    reasons.push({ label: 'SEASON', value: 'Suitable' });
  } else {
    reasons.push({ label: 'SEASON', value: 'Less aligned' });
  }

  if (priorityMatch) {
    score += 1;
  }

  return {
    ...profile,
    score,
    reasons,
    seasonMatch,
    priorityMatch,
    tempMatch,
    moistureMatch,
    rainMatch,
    status: score >= 4 ? 'Potentially suitable' : 'Candidate crop'
  };
}

function formatConditionText(value, unit) {
  return `${value}${unit}`;
}

function buildCropSuggestions() {
  const priority = document.querySelector('#farmerPriority')?.value || 'Improve soil health';
  const snapshot = getLatestFieldSnapshot();
  const ratedCrops = cropProfiles
    .map((profile) => evaluateCropProfile(profile, snapshot, priority))
    .filter((crop) => crop.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const cards = document.querySelector('#cropSuggestionCards');

  if (!cards) {
    return;
  }

  if (!ratedCrops.length) {
    cards.innerHTML = '<div class="empty-crop-card"><p>Candidate crops based on current field conditions are not yet clear. Please refresh after a new soil collection.</p></div>';
    return;
  }

  cards.innerHTML = ratedCrops.map((crop) => {
    const reasonList = crop.reasons.map((reason) => `<li><span>${reason.label}</span><strong>${reason.value}</strong></li>`).join('');

    const explanation = `Current soil moisture and temperature conditions are within a workable range for ${crop.name}, and the ${snapshot.season} season aligns with the configured suitability profile for this crop.`;

    return `
      <article class="crop-card">
        <div class="crop-card-head">
          <span class="crop-icon">🌱</span>
          <div>
            <h3>${crop.name}</h3>
            <small>${crop.status}</small>
          </div>
        </div>
        <p class="crop-card-note">${crop.note}</p>
        <ul class="crop-meta-list">${reasonList}</ul>
        <div class="crop-explainer">
          <strong>Why this crop?</strong>
          <p>${explanation}</p>
        </div>
      </article>
    `;
  }).join('');

  const seasonText = document.querySelector('#currentSeason');
  if (seasonText) {
    seasonText.textContent = `Current Season: ${snapshot.season}`;
  }

  const rotationContext = document.querySelector('#rotationContext');
  if (rotationContext) {
    const previousCrop = snapshot.previousCrop || null;
    if (previousCrop) {
      rotationContext.innerHTML = `
        <p><strong>Previous Crop:</strong> ${previousCrop}</p>
        <p><strong>Current Field Conditions:</strong> ${snapshot.soilMoisture}% soil moisture, ${snapshot.temperature}°C, ${snapshot.rain}% rain index.</p>
        <p><strong>Potential Next Crops:</strong> ${ratedCrops.slice(0, 3).map((crop) => crop.name).join(', ')}</p>
      `;
    } else {
      rotationContext.innerHTML = '<p>Previous crop data not available</p>';
    }
  }

  const dataUsed = document.querySelector('#dataUsedSummary');
  if (dataUsed) {
    dataUsed.innerHTML = `
      <p>Soil Moisture: ${snapshot.soilMoisture}%</p>
      <p>Rain: ${snapshot.rain}%</p>
      <p>Temperature: ${snapshot.temperature.toFixed(1)}°C</p>
      <p>Humidity: ${snapshot.humidity.toFixed(1)}%</p>
      <p>MQ135: ${Math.round(snapshot.mq135)}</p>
      <p>Season: ${snapshot.season}</p>
      <p>Farmer Priority: ${priority}</p>
    `;
  }
}

function updateCropSuggestions() {
  buildCropSuggestions();
}

const farmerPriority = document.querySelector('#farmerPriority');
if (farmerPriority) {
  farmerPriority.addEventListener('change', updateCropSuggestions);
}

const updateCropButton = document.querySelector('#updateCropButton');
if (updateCropButton) {
  updateCropButton.addEventListener('click', async () => {
    await Promise.all([loadHistory(), updateESP32Sensors()]);
    updateCropSuggestions();
  });
}


async function requestEsp32(path, options = {}) {
  const response = await fetch(`${esp32Url}${path}`, {
    ...options
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `ESP32 responded with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json')
    ? response.json()
    : null;
}

function rawAnalogToPercent(value) {
  return Math.max(0, Math.min(100, Math.round(100 - (Number(value) / 4095) * 100)));
}

function updateLiveSensors(data) {
  const soil = data.soilMoisture ?? rawAnalogToPercent(data.soil ?? 0);
  const rain = data.rainPercent ?? rawAnalogToPercent(data.rain ?? 0);
  const distance = Number(data.distance ?? 0) > 100
    ? Number(data.distance) / 10
    : Number(data.distance);

  document.querySelector('#moistureValue').textContent = Math.round(soil);
  document.querySelector('#rainValue').textContent = Math.round(rain);
  document.querySelector('#tempValue').textContent = data.temperature == null
    ? '--'
    : Number(data.temperature).toFixed(1);
  document.querySelector('#humidityValue').textContent = data.humidity == null
    ? '--'
    : Number(data.humidity).toFixed(1);
  document.querySelector('#airValue').textContent = Math.round(Number(data.mq135 ?? 0));
  document.querySelector('#distanceValue').textContent = distance.toFixed(1);
  document.querySelector('#obstacleDistance').textContent = distance.toFixed(1);

  if (data.servo !== undefined && !collectionInProgress) {
    const angle = Math.max(0, Math.min(90, Number(data.servo)));
    servoStatus.textContent = angle === 0 ? 'READY (0°)' : `${angle}°`;
    currentServoPosition.textContent = `Current Servo Position: ${angle}°`;
  }

  if (data.collectionInProgress) {
    servoStatus.textContent = 'COLLECTING (90°)';
    currentServoPosition.textContent = 'Current Servo Position: 90°';
  }

  if (data.roverRunning) {
    setRoverState(true, 'front');
  } else if (data.reverseRunning) {
    setRoverState(true, 'back');
  } else if (data.roverRunning === false && data.reverseRunning === false) {
    setRoverState(false);
  }

  const isObstacle = distance < 20;
  document.querySelector('#obstacleText').textContent = isObstacle ? 'OBSTACLE DETECTED' : 'PATH CLEAR';
  document.querySelector('#obstacleDescription').textContent = isObstacle
    ? 'Rover stopped: obstacle is inside the safety threshold.'
    : 'Ultrasonic range is safe for forward movement.';
  document.querySelector('#buzzerStatus').textContent = isObstacle ? 'ON' : 'OFF';

  if (isObstacle && isRunning && roverDirection === 'front') {
    setRoverState(false);
    requestEsp32('/stop', { method: 'POST' }).catch(() => {
      setSequenceState('ESP32 CONNECTION LOST', 'var(--red)');
    });
  }
}

function setConnectionState(online) {
  if (connectionLabel) {
    connectionLabel.textContent = online
      ? 'Wi-Fi Connected'
      : 'ESP32 CONNECTION LOST';
  }

  connectionStatus?.classList.toggle('offline', !online);
}

async function loadLiveSensors() {
  try {
    const sensorData = await requestEsp32('/api/sensors');
    updateLiveSensors(sensorData);
  } catch (error) {
    console.info('ESP32 is not reachable yet:', error.message);
  }
}


/* =========================
   SENSOR DATA
========================= */

function getSensorReading(data = {}) {
  const soil = data.soil ?? data.soilMoisture;
  const rain = data.rain ?? data.rainPercent;

  return {
    time: new Date().toISOString(),
    soil: soil === null || soil === undefined ? null : Number(soil),
    rain: rain === null || rain === undefined ? null : Number(rain),
    temperature: data.temperature === null || data.temperature === undefined ? null : Number(data.temperature),
    humidity: data.humidity === null || data.humidity === undefined ? null : Number(data.humidity),
    mq135: data.mq135 === null || data.mq135 === undefined ? null : Number(data.mq135),
    distance: data.distance === null || data.distance === undefined ? null : Number(data.distance),
    servo: data.servo === null || data.servo === undefined ? 0 : Number(data.servo)
  };
}


/* =========================
   TABLE ROW
========================= */

function readingToRow(reading) {

  const date = new Date(reading.time || reading.timestamp || Date.now());

  const dateLabel =
    date
      .toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
      .toUpperCase();

  const timeLabel =
    date.toLocaleTimeString('en-GB');

  const soil = Number(reading.soil ?? reading.soilMoisture ?? 0);
  const rain = Number(reading.rain ?? 0);
  const distance = Number(reading.distance || 0).toFixed(1);

  return `
    <tr>

      <td>
        <strong>${dateLabel}</strong>
        <small>${timeLabel}</small>
      </td>

      <td>
        <b class="table-number green-number">
          ${soil > 100 ? rawAnalogToPercent(soil) : soil}%
        </b>
      </td>

      <td>
        ${rain > 100 ? rawAnalogToPercent(rain) : rain}%
      </td>

      <td>
        ${Number(reading.temperature).toFixed(1)}°C
      </td>

      <td>
        ${reading.humidity}%
      </td>

      <td>
        ${reading.mq135} ppm
      </td>

      <td>
        <b class="distance-good">
          ${distance} cm
        </b>
      </td>

      <td>
        <span class="servo-chip">
          ${reading.servo !== undefined ? `READY (${reading.servo}°)` : reading.servoStatus}
        </span>
      </td>

    </tr>
  `;
}


/* =========================
   LOAD DATABASE
========================= */

async function loadHistory() {

  try {

    const response = await fetch(databaseUrl);

    if (!response.ok) {
      throw new Error(
        `Database responded with ${response.status}`
      );
    }

    allReadings = await response.json();

    renderHistory();

    console.log(
      `Database loaded: ${allReadings.length} readings`
    );

  } catch (error) {

    console.error(
      'Database connection failed:',
      error.message
    );

    allReadings = [];

    renderHistory();
  }
}


/* =========================
   RENDER HISTORY
========================= */

function renderHistory() {

  const query =
    document
      .querySelector('#searchInput')
      .value
      .toLowerCase()
      .trim();

  const selectedDate =
    document.querySelector('#dateFilter').value;


  const filtered = allReadings.filter(reading => {

    const date = new Date(reading.time || reading.timestamp);

    const searchText =
      `
      ${reading.soil ?? reading.soilMoisture}
      ${reading.rain}
      ${reading.temperature}
      ${reading.humidity}
      ${reading.mq135}
      ${reading.distance}
      ${reading.servoStatus}
      ${date.toLocaleString()}
      `.toLowerCase();


    const searchMatch =
      !query ||
      searchText.includes(query);


    let dateMatch = true;

    if (selectedDate !== 'all') {
      const targetDate = new Date();

      if (selectedDate === 'yesterday') {
        targetDate.setDate(targetDate.getDate() - 1);
      }

      const readingDate = date.toISOString().split('T')[0];
      const filterDate = targetDate.toISOString().split('T')[0];
      dateMatch = readingDate === filterDate;
    }


    return searchMatch && dateMatch;
  });


  if (filtered.length === 0) {

    historyBody.innerHTML = '';

    emptyState.style.display = 'block';

  } else {

    emptyState.style.display = 'none';

    historyBody.innerHTML =
      filtered
        .slice()
        .reverse()
        .map(readingToRow)
        .join('');
  }


  visibleCount.textContent =
    filtered.length;

  const sampleCount =
    document.querySelector('#sampleCount');

  if (sampleCount) {

    sampleCount.textContent =
      allReadings.length.toLocaleString();
  }


  const lastCollection =
    document.querySelector('#lastCollection');

  if (lastCollection && allReadings.length) {

    const latest =
      allReadings[allReadings.length - 1];
    const latestSampleValue = document.querySelector('#latestSampleValue');
    const latestSampleTime = document.querySelector('#latestSampleTime');
    const soil = Number(latest.soil ?? latest.soilMoisture ?? 0);
    const capturedAt = new Date(latest.time || latest.timestamp);

    lastCollection.textContent =
      capturedAt.toLocaleTimeString('en-GB');

    if (latestSampleValue) {
      const displaySoil = soil > 100 ? rawAnalogToPercent(soil) : soil;
      latestSampleValue.innerHTML = `${displaySoil}% <small>MOISTURE</small>`;
    }

    if (latestSampleTime) {
      latestSampleTime.textContent = `Captured ${capturedAt.toLocaleString('en-GB')}`;
    }
  }
}


/* =========================
   SAVE TO DATABASE
========================= */

async function saveReading(reading = getSensorReading()) {


  try {

    const response =
      await fetch(databaseUrl, {

        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(reading)
      });


    if (!response.ok) {

      throw new Error(
        `Database responded with ${response.status}`
      );
    }


    const savedReading =
      await response.json();


    allReadings.push(savedReading);

    renderHistory();


    console.log(
      'Reading saved:',
      savedReading
    );


    return true;

  } catch (error) {

    console.error(
      'Reading was not saved:',
      error.message
    );

    return false;
  }
}


/* =========================
   ROVER CONTROL
========================= */

function setRoverState(running, direction = 'front') {
  isRunning = running;
  roverDirection = running ? direction : 'stopped';

  if (running) {
    roverStatus.textContent = direction === 'back' ? 'MOVING BACK' : 'MOVING FRONT';
    driveText.textContent = direction === 'back' ? 'Moving backward' : 'Moving forward';
    motorReadout.textContent = 'ACTIVE';
    motorStatus.textContent = 'ACTIVE';
  } else {
    roverStatus.textContent = 'STOPPED';
    driveText.textContent = 'Standing by';
    motorReadout.textContent = 'IDLE';
    motorStatus.textContent = 'IDLE';
  }

  statusLight.className = `status-light ${running ? 'running' : 'stopped'}`;

  const speed = running ? Number(speedSlider.value) : 0;
  velocityReadout.innerHTML = `${(speed / 100 * 1.8).toFixed(1)} <small>m/s</small>`;
  readoutPercent.textContent = speed;
  startButton.disabled = collectionInProgress || (running && direction === 'front');
  backButton.disabled = collectionInProgress;
  stopButton.disabled = collectionInProgress;
  collectionButton.disabled = running || collectionInProgress;
  setServoAngleButton.disabled = collectionInProgress;
}


/* =========================
   SPEED
========================= */

function updateSpeed() {

  const speed =
    Number(speedSlider.value);


  speedValue.textContent =
    `${speed}%`;


  speedSlider.style.background =
    `linear-gradient(
      to right,
      var(--blue) ${speed}%,
      #e3e8ec ${speed}%
    )`;


  if (isRunning) {

    velocityReadout.innerHTML =
      `${(speed / 100 * 1.8).toFixed(1)}
       <small>m/s</small>`;

    readoutPercent.textContent =
      speed;
  }

  requestEsp32(`/speed?value=${Math.round(speed * 255 / 100)}`, {
    method: 'POST'
  }).catch((error) => {
    console.info('ESP32 speed command unavailable:', error.message);
  });
}


/* =========================
   BUTTONS
========================= */

startButton.addEventListener(
  'click',
  async () => {
    if (collectionInProgress) {
      return;
    }

    setRoverState(true, 'front');
    try {
      await requestEsp32('/start', { method: 'POST' });
    } catch (error) {
      setRoverState(false);
      if (error instanceof TypeError) {
        setConnectionState(false);
      }
      setSequenceState(error.message || 'ESP32 connection failed', 'var(--red)');
    }
  }
);

backButton.addEventListener(
  'click',
  async () => {
    if (collectionInProgress) {
      return;
    }

    setRoverState(true, 'back');
    try {
      await requestEsp32('/reverse', { method: 'POST' });
    } catch (error) {
      setRoverState(false);
      if (error instanceof TypeError) {
        setConnectionState(false);
      }
      setSequenceState(error.message || 'ESP32 connection failed', 'var(--red)');
    }
  }
);

stopButton.addEventListener(
  'click',
  async () => {
    try {
      await requestEsp32('/stop', { method: 'POST' });
      setRoverState(false);
    } catch (error) {
      if (error instanceof TypeError) {
        setConnectionState(false);
      }
      setSequenceState(error.message || 'ESP32 connection failed', 'var(--red)');
    }
  }
);


speedSlider.addEventListener(
  'input',
  updateSpeed
);

servoAngleSlider.addEventListener('input', () => {
  servoAngleValue.textContent = `${servoAngleSlider.value}°`;
});


/* =========================
   SOIL COLLECTION
========================= */

let collectionInProgress = false;
let pendingCollection = null;

collectionButton.addEventListener(
  'click',
  async () => {
    if (collectionInProgress) {
      return;
    }

    if (isRunning) {
      setSequenceState('Please stop the rover first', 'var(--amber)');
      return;
    }

    collectionInProgress = true;
    setRoverState(false);
    collectionButton.querySelector('span').textContent = 'COLLECTING SOIL...';
    setSequenceState('SOIL COLLECTION IN PROGRESS', 'var(--purple)');
    servoStatus.textContent = 'COLLECTING (90°)';
    updateCollectionSequence(0);

    let collectedData = null;

    try {
      if (!pendingCollection) {
        updateCollectionSequence(1);
        const sensorData = await requestEsp32('/api/collect', { method: 'POST' });
        updateLiveSensors(sensorData);
        pendingCollection = {
          sensorData,
          reading: { ...getSensorReading(sensorData), servo: 0 },
          saved: false
        };
        updateCollectionSequence(2);
      } else {
        updateCollectionSequence(pendingCollection.saved ? 3 : 2);
      }

      collectedData = pendingCollection.sensorData;
      updateLiveSensors(collectedData);

      if (!pendingCollection.saved) {
        if (!await saveReading(pendingCollection.reading)) {
          setSequenceState('Database save failed. Press CRU to retry.', 'var(--red)');
          return;
        }

        pendingCollection.saved = true;
      }

      updateCollectionSequence(3);
      const finishData = await requestEsp32('/api/collect?finish=1', { method: 'POST' });
      updateLiveSensors({ ...collectedData, ...finishData });
      pendingCollection = null;
      servoStatus.textContent = 'READY (0°)';
      updateCollectionSequence(4);
      setSequenceState('Collection Complete', 'var(--green)');
      await loadHistory();
      updateCropSuggestions();
    } catch (error) {
      if (error instanceof TypeError) {
        setConnectionState(false);
      }
      const message = error.message.includes('Please stop')
        ? 'Please stop the rover first'
        : error.message || 'Soil collection failed';
      if (!pendingCollection) {
        updateCollectionSequence(0);
      }
      setSequenceState(message, 'var(--red)');
    } finally {
      collectionInProgress = false;
      setRoverState(false);
      collectionButton.querySelector('span').textContent = 'CRU SOIL COLLECTOR';
    }
  }
);

setServoAngleButton.addEventListener(
  'click',
  async () => {
    if (collectionInProgress) {
      return;
    }

    if (isRunning) {
      setSequenceState('Please stop the rover first', 'var(--amber)');
      return;
    }

    const sliderAngle = Number(servoAngleSlider.value);
    const angle = Number.isFinite(sliderAngle)
      ? Math.max(0, Math.min(90, Math.round(sliderAngle)))
      : 0;
    setServoAngleButton.disabled = true;

    try {
      const result = await requestEsp32(`/servo?angle=${angle}`);
      const reportedAngle = Number(result?.servo);
      if (result?.success !== true || !Number.isFinite(reportedAngle)) {
        throw new Error(result?.error || 'ESP32 did not confirm the servo position');
      }

      const actualAngle = Math.max(0, Math.min(90, reportedAngle));
      setConnectionState(true);
      servoAngleSlider.value = String(actualAngle);
      servoAngleValue.textContent = `${actualAngle}°`;
      servoStatus.textContent = actualAngle === 0 ? 'READY (0°)' : `${actualAngle}°`;
      currentServoPosition.textContent = `Current Servo Position: ${actualAngle}°`;
      setSequenceState('Servo position updated', 'var(--green)');
    } catch (error) {
      if (error instanceof TypeError) {
        setConnectionState(false);
        setSequenceState('ESP32 connection lost', 'var(--red)');
      } else {
        setSequenceState(error.message || 'Servo command failed', 'var(--red)');
      }
    } finally {
      setServoAngleButton.disabled = collectionInProgress;
    }
  }
);


/* =========================
   SEARCH
========================= */

document
  .querySelector('#searchInput')
  .addEventListener(
    'input',
    renderHistory
  );


/* =========================
   DATE FILTER
========================= */

document
  .querySelector('#dateFilter')
  .addEventListener(
    'change',
    renderHistory
  );


/* =========================
   CLEAR DISPLAY
========================= */

document
  .querySelector('#clearButton')
  .addEventListener(
    'click',
    () => {

      historyBody.innerHTML = '';

      visibleCount.textContent =
        '0';

      emptyState.style.display =
        'block';
    }
  );


/* =========================
   EXPORT CSV
========================= */

document
  .querySelector('#downloadButton')
  .addEventListener(
    'click',
    () => {

      if (!allReadings.length) {

        alert(
          'No database records available.'
        );

        return;
      }


      const header =
        [
          'Date & Time',
          'Soil Moisture',
          'Rain',
          'Temperature',
          'Humidity',
          'MQ135',
          'Distance',
          'Servo Status'
        ];


      const rows =
        allReadings.map(
          reading => {

            const date =
              new Date(
                reading.time || reading.timestamp
              );


            return [
              date.toLocaleString('en-GB'),
              `${Number(reading.soil ?? reading.soilMoisture ?? 0) > 100
                ? rawAnalogToPercent(reading.soil ?? reading.soilMoisture)
                : reading.soil ?? reading.soilMoisture ?? 0}%`,
              `${Number(reading.rain ?? 0) > 100
                ? rawAnalogToPercent(reading.rain)
                : reading.rain ?? 0}%`,
              `${reading.temperature}°C`,
              `${reading.humidity}%`,
              `${reading.mq135} ppm`,
              `${reading.distance} cm`,
              reading.servo !== undefined
                ? `READY (${reading.servo}°)`
                : reading.servoStatus
            ];
          }
        );


      const csv =
        [
          header,
          ...rows
        ]
        .map(
          row =>
            row
              .map(
                value =>
                  `"${String(value)
                    .replace(/"/g, '""')}"`
              )
              .join(',')
        )
        .join('\n');


      const blob =
        new Blob(
          [csv],
          {
            type: 'text/csv'
          }
        );


      const link =
        document.createElement('a');


      link.href =
        URL.createObjectURL(blob);


      link.download =
        'field-shift-rover-history.csv';


      link.click();


      URL.revokeObjectURL(
        link.href
      );
    }
  );


/* =========================
   INITIALIZE
========================= */

setRoverState(false);

updateSpeed();

loadHistory();
updateCropSuggestions();

async function updateESP32Sensors() {
  try {
    const data = await requestEsp32('/api/sensors');

    setConnectionState(true);
    updateLiveSensors(data);
    updateCropSuggestions();
  } catch (error) {
    setConnectionState(false);
  }
}

setInterval(updateESP32Sensors, 2000);
updateESP32Sensors();