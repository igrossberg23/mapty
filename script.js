'use strict';

///////////////////////////////////////////////////////
/* FEATURES TO ADD:

Easy:
1) Ability to edit a workout (DONE)
2) Ability to delete a workout (DONE)
3) Ability to delete all workouts (DONE)
4) Ability to sort workouts by a certain field (e.g. distance)
5) Re-build running and cycling objects coming from localStorage
6) More realistic error and confirmation messages
Hard:
7) Ability to position map to show all workouts
- Would require in deep dive on Leaflet
8) Ability to draw lines and shapes (instead of just points)
- Very well may be too hard, but worth looking into
9) Geocode location from coordinates ("Run in Faro, Portugal")
- Use another API to determine location from raw coordinates
10) Display weather data for workout time and place
- Again requires use of API

*/

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');

const alertBox = document.querySelector('.alert-box');
const resetBtn = document.querySelector('.reset-btn');

class Workout {
  date = new Date();
  // Poor method of generating unique IDs, use API instead
  id = Date.now().toString().slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    this.description = `${this.type[0].toUpperCase() + this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min / km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';
  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

// const run1 = new Running([39, -12], 5.2, 24, 178);
// const cycling1 = new Cycling([39, -12], 27, 95, 523);
// console.log(run1, cycling1);

////////////////////////////////////////////////////////
// APPLICATION ARCHITECTURE
class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];

  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from local storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));
    containerWorkouts.addEventListener('click', this._deleteWorkout.bind(this));
    containerWorkouts.addEventListener('click', this._showEditForm.bind(this));
    containerWorkouts.addEventListener('click', this._hideEditForm.bind(this));
    resetBtn.addEventListener('click', this.reset);
  }

  _getPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not get your position');
        }
      );
    }
  }

  _loadMap(position) {
    const { latitude, longitude } = position.coords;

    this.#map = L.map('map').setView([latitude, longitude], this.#mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    // Render markers
    this.#workouts.forEach(work => this._renderWorkoutMarker(work));
  }

  _alert(alert) {
    alertBox.textContent = alert;
    alertBox.classList.remove('hidden');

    setTimeout(function () {
      alertBox.classList.add('hidden');
    }, 5000);
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hideForm() {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    // Add hidden;
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _showEditForm(e) {
    // Guard clause
    if (!e.target.classList.contains('workout__edit')) return;
    console.log('showEditForm fired');

    // Hide all other edit forms
    document
      .querySelectorAll('.form--edit')
      .forEach(el => el.classList.add('hidden'));

    // Show new form
    const formEdit = [...e.target.parentElement.children].find(el =>
      el.classList.contains('form--edit')
    );
    formEdit.classList.remove('hidden');
    containerWorkouts.style.overflowY = 'visible';
  }

  _editWorkout(e) {
    // HELPER FUNCTIONS:
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    // Avoid automatic page reload
    e.preventDefault();

    // Get form input elements
    const distanceInput = e.target.querySelector(
      '.form--edit__input--distance'
    );
    const durationInput = e.target.querySelector(
      '.form--edit__input--duration'
    );
    const cadenceInput = e.target.querySelector('.form--edit__input--cadence');
    const elevationInput = e.target.querySelector(
      '.form--edit__input--elevation'
    );

    // Get form input values
    const distance = Number(distanceInput.value);
    const duration = Number(durationInput.value);
    let cadence, elevation;
    if (cadenceInput?.value) cadence = Number(cadenceInput.value);
    if (elevationInput?.value) elevation = Number(elevationInput.value);
    console.log(cadence, elevation);

    // Select workout
    const workoutEl = e.target.closest('.workout');
    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    // Input validation
    if (workout.type === 'running') {
      console.log(
        'Valid, Allpositive: ',
        validInputs(distance, duration, cadence),
        allPositive(distance, duration, cadence)
      );
      if (
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      ) {
        return this._alert('All inputs must be positive numbers!');
      }
    }
    if (workout.type === 'cycling') {
      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      ) {
        console.log(
          distanceInput.value,
          durationInput.value,
          elevationInput.value
        );
        return this._alert(
          'Distance and duration must be positive numbers! Elevation gain may be negative.'
        );
      }
    }

    // Update workout properties
    workout.distance = distance;
    workout.duration = duration;
    if (workout.type === 'running') {
      workout.cadence = cadence;
      cadenceInput.value = '';
    }
    if (workout.type === 'cycling') {
      workout.elevationGain = elevation;
      elevationInput.value = '';
    }

    // Clear values
    distanceInput.value = durationInput.value = '';

    // Select HTML elements and update them:
    // NOTE: All of this can change once objects are properly restored from
    // local storage with correct prototype chain
    const valEls = e.target
      .closest('.workout')
      .querySelectorAll('.workout__value');

    valEls[0].textContent = workout.distance;
    valEls[1].textContent = workout.duration;
    if (workout.type === 'running') {
      valEls[2].textContent = (workout.duration / workout.distance).toFixed(1);
      valEls[3].textContent = workout.cadence;
    }
    if (workout.type === 'cycling') {
      valEls[2].textContent = (
        (workout.distance / workout.duration) *
        60
      ).toFixed(1);
      valEls[3].textContent = workout.elevationGain;
    }

    // Close window:
    e.target.classList.add('hidden');
    containerWorkouts.style.overflowY = 'scroll';

    this._setLocalStorage();

    return;
  }

  _hideEditForm(e) {
    // Guard clause
    if (!e.target?.classList.contains('form--edit__close')) return;
    console.log('hideEditForm fired');

    // Hide form
    e.target
      .closest('.workout')
      .querySelector('.form--edit')
      .classList.add('hidden');

    // Change overflow
    containerWorkouts.style.overflowY = 'scroll';
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    // Return if new workout form not shown
    if (form.classList.contains('hidden')) return;
    console.log('newWorkout fired');

    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));

    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    // If workout is running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;
      // Check if data is valid
      if (
        // !Number.isFinite(distance) ||
        // !Number.isFinite(duration) ||
        // !Number.isFinite(cadence)
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return this._alert('All inputs must be positive numbers!');

      workout = new Running([lat, lng], distance, duration, cadence);
    }
    // If workout is cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      // Check if data is valid
      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return this._alert('All inputs must be positive numbers!');

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    // Add new object to workout array
    this.#workouts.push(workout);
    // Render workout on map as marker
    this._renderWorkoutMarker(workout);
    // Render workout on list
    this._renderWorkout(workout);

    // Hide form + clear input fields
    this._hideForm();

    // Indicate success
    this._alert('New workout created successfully');

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  _deleteWorkout(e) {
    // Guard clause
    if (!e.target.classList.contains('workout__delete')) return;
    console.log('deleteWorkout fired');

    // Select workout element and idx in workouts array
    const workoutEl = e.target.closest('.workout');
    const idx = this.#workouts.findIndex(
      work => work.id === workoutEl.dataset.id
    );

    workoutEl.classList.add('deleted');

    // Remove selected workout from array and reset local storage
    this.#workouts.splice(idx, 1);
    this._setLocalStorage();
    setTimeout(function () {
      location.reload();
    }, 200);
  }

  _renderWorkoutMarker(workout) {
    L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup();
  }

  _renderWorkout(workout) {
    let html = `
    <li class="workout workout--${workout.type}" data-id="${workout.id}">
      <h2 class="workout__title">${workout.description}</h2>
      <div class="workout__delete">🗑</div>
      <div class="workout__edit">📝</div>
      <div class="workout__details">
        <span class="workout__icon">${
          workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
        }</span>
        <span class="workout__value">${workout.distance}</span>
        <span class="workout__unit">km</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">⏱</span>
        <span class="workout__value">${workout.duration}</span>
        <span class="workout__unit">min</span>
      </div>`;

    if (workout.type === 'running') {
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.pace.toFixed(1)}</span>
          <span class="workout__unit">min/km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">🦶🏼</span>
          <span class="workout__value">${workout.cadence}</span>
          <span class="workout__unit">spm</span>
        </div>
        <form class="form--edit hidden">
            <div class="form__row">
              <label class="form--edit__label">Edit Workout:</label>
            </div>
            <div class="form__row">
              <label class="form__label">Distance</label>
              <input
                class="form__input form--edit__input--distance"
                placeholder="km"
              />
            </div>
            <div class="form__row">
              <label class="form__label">Duration</label>
              <input
                class="form__input form--edit__input--duration"
                placeholder="min"
              />
            </div>
            <div class="form__row">
              <label class="form__label">Cadence</label>
              <input
                class="form__input form--edit__input--cadence"
                placeholder="step/min"
              />
            </div>
            <button class="form__btn">OK</button>
            <div class="form--edit__close">✖</div>
          </form>
      </li>`;
    }

    if (workout.type === 'cycling') {
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.speed.toFixed(1)}</span>
          <span class="workout__unit">km/h</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⛰</span>
          <span class="workout__value">${workout.elevationGain}</span>
          <span class="workout__unit">m</span>
        </div>
        <form class="form--edit hidden">
            <div class="form__row">
              <label class="form--edit__label">Edit Workout:</label>
            </div>
            <div class="form__row">
              <label class="form__label">Distance</label>
              <input
                class="form__input form--edit__input--distance"
                placeholder="km"
              />
            </div>
            <div class="form__row">
              <label class="form__label">Duration</label>
              <input
                class="form__input form--edit__input--duration"
                placeholder="min"
              />
            </div>
            <div class="form__row">
              <label class="form__label">Elev Gain</label>
              <input
                class="form__input form--edit__input--elevation"
                placeholder="meters"
              />
            </div>
            <button class="form__btn">OK</button>
            <div class="form--edit__close">✖</div>
          </form>
      </li>`;
    }

    form.insertAdjacentHTML('afterend', html);

    // Select edit form:
    const formEdit = form.parentElement.querySelector('.form--edit');
    formEdit.addEventListener('submit', this._editWorkout.bind(this));
  }

  _moveToPopup(e) {
    // Guard clauses
    if (e.target.closest('.form--edit')) return;
    if (!e.target.closest('.workout')) return;

    const workoutEl = e.target.closest('.workout');
    // console.log(workoutEl);

    if (!workoutEl) return;

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );
    // console.log(workout);

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: { duration: 1 },
    });

    // Using the public interface
    // workout.click();
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.#workouts = data;

    this.#workouts.forEach(work => this._renderWorkout(work));
  }

  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
