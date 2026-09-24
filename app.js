const startButton = document.querySelector('#startButton');
const stopButton = document.querySelector('#stopButton');
const speedSlider = document.querySelector('#speedSlider');
const speedValue = document.querySelector('#speedValue');
const roverStatus = document.querySelector('#roverStatus');
const statusLight = document.querySelector('#statusLight');
const driveText = document.querySelector('#driveText');
const velocityReadout = document.querySelector('#velocityReadout');
const readoutPercent = document.querySelector('#readoutPercent');
const motorReadout = document.querySelector('#motorReadout');
const motorStatus = document.querySelector('#motorStatus');

const collectionButton = document.querySelector('#collectionButton');
const sequenceState = document.querySelector('#sequenceState');
const servoStatus = document.querySelector('#servoStatus');

const historyBody = document.querySelector('#historyBody');
const emptyState = document.querySelector('#emptyState');
const visibleCount = document.querySelector('#visibleCount');

const databaseUrl = 'http://localhost:3000/readings';
const esp32Url = 'http://10.82.97.252';
document.querySelector('#esp32Ip').textContent = esp32Url;

let isRunning = false;
let allReadings = [];

async function requestEsp32(path, options = {}) {
  const response = await fetch(`${esp32Url}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`ESP32 responded with ${response.status}`);
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
  document.querySelector('#tempValue').textContent = Number(data.temperature ?? 0).toFixed(1);
  document.querySelector('#humidityValue').textContent = Number(data.humidity ?? 0).toFixed(1);
  document.querySelector('#airValue').textContent = Math.round(Number(data.mq135 ?? 0));
  document.querySelector('#distanceValue').textContent = distance.toFixed(1);
  document.querySelector('#obstacleDistance').textContent = distance.toFixed(1);

  if (data.servo !== undefined) {
    servoStatus.textContent = Number(data.servo) === 90
      ? 'DEPLOYED (90°)'
      : 'READY (0°)';
  }

  const isObstacle = distance < 20;
  document.querySelector('#obstacleText').textContent = isObstacle ? 'OBSTACLE DETECTED' : 'PATH CLEAR';
  document.querySelector('#obstacleDescription').textContent = isObstacle
    ? 'Rover stopped: obstacle is inside the safety threshold.'
    : 'Ultrasonic range is safe for forward movement.';
  document.querySelector('#buzzerStatus').textContent = isObstacle ? 'ON' : 'OFF';

  if (isObstacle && isRunning) {
    setRoverState(false);
    requestEsp32('/stop', { method: 'POST' }).catch(console.error);
  }
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
  const soil = data.soilMoisture ?? rawAnalogToPercent(data.soil ?? 0);
  const rain = data.rainPercent ?? rawAnalogToPercent(data.rain ?? 0);
  const distanceValue = Number(
    data.distance ?? document.querySelector('#distanceValue').textContent ?? 0
  );

  return {
    time: new Date().toISOString(),
    soil: Math.round(Number(soil) || 0),
    rain: Math.round(Number(rain) || 0),
    temperature: Number(data.temperature ?? document.querySelector('#tempValue').textContent) || 0,
    humidity: Number(data.humidity ?? document.querySelector('#humidityValue').textContent) || 0,
    mq135: Number(data.mq135 ?? document.querySelector('#airValue').textContent) || 0,
    distance: distanceValue > 100 ? distanceValue / 10 : distanceValue,
    servo: Number(data.servo ?? 0)
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

  const distance =
    Number(reading.distance || 0).toFixed(1);

  return `
    <tr>

      <td>
        <strong>${dateLabel}</strong>
        <small>${timeLabel}</small>
      </td>

      <td>
        <b class="table-number green-number">
          ${reading.soil ?? reading.soilMoisture ?? 0}%
        </b>
      </td>

      <td>
        ${reading.rain}%
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

    lastCollection.textContent =
      new Date(latest.time || latest.timestamp)
        .toLocaleTimeString('en-GB');
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

function setRoverState(running) {

  isRunning = running;

  roverStatus.textContent =
    running ? 'RUNNING' : 'STOPPED';


  statusLight.className =
    `status-light ${running ? 'running' : 'stopped'}`;


  driveText.textContent =
    running
      ? 'Moving forward'
      : 'Standing by';


  motorReadout.textContent =
    running ? 'ACTIVE' : 'IDLE';


  motorStatus.textContent =
    running ? 'ACTIVE' : 'IDLE';


  const speed =
    running
      ? Number(speedSlider.value)
      : 0;


  velocityReadout.innerHTML =
    `${(speed / 100 * 1.8).toFixed(1)}
     <small>m/s</small>`;


  readoutPercent.textContent =
    speed;

  collectionButton.disabled = running || collectionInProgress;
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

    setRoverState(true);
    try {
      await requestEsp32('/start', { method: 'POST' });
    } catch (error) {
      setRoverState(false);
      alert('ESP32 connection failed');
      console.info('ESP32 start command unavailable:', error.message);
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
      alert('ESP32 connection failed');
      console.info('ESP32 stop command unavailable:', error.message);
    }
  }
);


speedSlider.addEventListener(
  'input',
  updateSpeed
);


/* =========================
   SOIL COLLECTION
========================= */

let collectionInProgress = false;

collectionButton.addEventListener(
  'click',
  async () => {
    if (collectionInProgress) {
      return;
    }

    if (isRunning) {
      alert('Please stop the rover first.');
      return;
    }

    collectionInProgress = true;
    startButton.disabled = true;
    stopButton.disabled = true;
    collectionButton.disabled = true;
    collectionButton.querySelector('span').textContent = 'COLLECTING SOIL...';
    sequenceState.textContent = 'SOIL COLLECTION IN PROGRESS';
    sequenceState.style.color = 'var(--purple)';
    servoStatus.textContent = 'DEPLOYING (90°)';

    const items = document.querySelectorAll('.sequence-list li');
    items.forEach((item, index) => {
      item.classList.toggle('complete', index === 0);
      item.querySelector('i').textContent = index === 0 ? '✓' : '○';
    });

    try {
      setRoverState(false);
      await requestEsp32('/stop', { method: 'POST' });

      const sensorData = await requestEsp32('/api/collect', { method: 'POST' });
      updateLiveSensors(sensorData);
      servoStatus.textContent = 'READY (0°)';

      items.forEach((item) => {
        item.classList.add('complete');
        item.querySelector('i').textContent = '✓';
      });

      if (!await saveReading(getSensorReading(sensorData))) {
        sequenceState.textContent = 'Sensor data collected, but database save failed.';
        sequenceState.style.color = 'var(--amber)';
        alert('Sensor data collected, but database save failed.');
        return;
      }

      sequenceState.textContent = 'COLLECTION COMPLETE';
      sequenceState.style.color = 'var(--green)';
    } catch (error) {
      const message = error.name === 'TypeError'
        ? 'ESP32 connection failed'
        : 'Soil collection failed';
      sequenceState.textContent = message;
      sequenceState.style.color = 'var(--red)';
      alert(message);
    } finally {
      collectionInProgress = false;
      startButton.disabled = false;
      stopButton.disabled = false;
      collectionButton.disabled = isRunning;
      collectionButton.querySelector('span').textContent = 'CRU SOIL COLLECTOR';
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
              `${reading.soil ?? reading.soilMoisture ?? 0}%`,
              `${reading.rain}%`,
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

async function updateESP32Sensors() {
  try {
    const response = await fetch(`${esp32Url}/api/sensors`);
    const data = await response.json();

    console.log('ESP32 Data:', data);
    updateLiveSensors(data);
  } catch (error) {
    console.error('ESP32 connection error:', error);
  }
}

setInterval(updateESP32Sensors, 2000);
updateESP32Sensors();