// данные
let places = [];

const areas = [
  {
    id: "miigaik",
    title: "Карта рядом с МИИГАиК",
    text: "Интерактивная карта района около главного корпуса и метро Курская"
  },
  {
    id: "studak",
    title: "Карта рядом с общежитием №2",
    text: "Интерактивная карта района около общежития на Студенческой улице"
  }
];

const areaCenters = {
  miigaik: {
    center: [55.763893, 37.66197],
    zoom: 15
  },
  studak: {
    center: [55.738056, 37.542222],
    zoom: 15
  }
};

const categories = [
  { type: "all", name: "все" },
  { type: "university", name: "корпуса" },
  { type: "dormitory", name: "общежития" },
  { type: "metro", name: "метро" },
  { type: "food", name: "еда" },
  { type: "shop", name: "магазины" },
  { type: "pharmacy", name: "аптеки" },
  { type: "copycenter", name: "копицентры" },
  { type: "other", name: "другое" }
];

function apiTypeToFrontType(type) {
  for (let category of categories) {
    if (category.type === type) {
      return type;
    }
  }

  return "other";
}

function makePlace(apiPlace) {
  return {
    id: apiPlace.id,
    area: apiPlace.area || "miigaik",
    name: apiPlace.name,
    type: apiTypeToFrontType(apiPlace.category),
    address: apiPlace.address,
    text: apiPlace.description,
    lat: apiPlace.lat,
    lng: apiPlace.lng
  };
}

let activeType = "all";
let activeArea = "miigaik";
let searchText = "";
let activePlaceId = 1;

// элементы страницы
const searchInput = document.getElementById("search_input");
const filterButtonList = document.querySelectorAll(".filter-button");
const resetButton = document.getElementById("reset_button");
const infoCard = document.getElementById("info_card");
const objectEmpty = document.getElementById("object_empty");
const objectContent = document.getElementById("object_content");
const objectCategory = document.getElementById("object_category");
const objectName = document.getElementById("object_name");
const objectDescription = document.getElementById("object_description");
const objectAddress = document.getElementById("object_address");
const objectDistance = document.getElementById("object_distance");
const objectTime = document.getElementById("object_time");
const mapNote = document.getElementById("map_note");
const mapBox = document.getElementById("map_box");
const placeCount = document.getElementById("place_count");
const placesList = document.getElementById("places_list");
const areaButtons = document.getElementById("area_buttons");
const mapTitle = document.getElementById("map_title");
const mapText = document.getElementById("map_text");

// карта
let yandexMap = null;
let firstMapShow = true;

function hasCoords(place) {
  if (place === null) {
    return false;
  }

  let lat = Number(place.lat);
  let lng = Number(place.lng);

  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= 55.6
    && lat <= 55.9
    && lng >= 37.4
    && lng <= 37.9;
}

// объект по id
function getPlaceById(id) {
  for (let place of places) {
    if (place.id === id) {
      return place;
    }
  }

  return null;
}

// запуск карты
function startMap() {
  if (yandexMap !== null) {
    return;
  }

  if (typeof ymaps === "undefined") {
    mapNote.textContent = "Карта не загрузилась проверьте подключение Яндекс Карт";
    return;
  }

  yandexMap = new ymaps.Map("map", {
    center: [55.763893, 37.66197],
    zoom: 16,
    controls: ["zoomControl"]
  });

}

// очистить маркеры
function clearMarkers() {
  if (yandexMap !== null) {
    yandexMap.geoObjects.removeAll();
  }
}

// центр карты на объект
function centerMapOnPlace(place) {
  if (yandexMap === null || place === null || !hasCoords(place)) {
    return;
  }

  let lat = Number(place.lat);
  let lng = Number(place.lng);

  yandexMap.setCenter([lat, lng], 17, {
    duration: 300
  });
}

// обычный вид карты
function resetMapView() {
  if (yandexMap === null) {
    return;
  }

  let areaCenter = areaCenters[activeArea];

  if (areaCenter === undefined) {
    areaCenter = areaCenters.miigaik;
  }

  yandexMap.setCenter(areaCenter.center, areaCenter.zoom, {
    duration: 300
  });
}

// метки на яндекс карте
function showMapMarkers(list) {
  startMap();

  if (yandexMap === null) {
    return;
  }

  clearMarkers();

  for (let place of list) {
    if (!hasCoords(place)) {
      continue;
    }

    let lat = Number(place.lat);
    let lng = Number(place.lng);
    let category = getCategory(place.type);
    let marker = new ymaps.Placemark(
      [lat, lng],
      {
        balloonContentHeader: place.name,
        balloonContentBody: category.name + " · " + place.address,
        hintContent: place.name
      }
    );

    marker.events.add("click", function () {
      choosePlace(place.id);
      centerMapOnPlace(place);
      marker.balloon.open();
    });

    yandexMap.geoObjects.add(marker);
  }

  if (firstMapShow) {
    resetMapView();
    firstMapShow = false;
  }
}

// карточка объекта
function showInfoText(text) {
  objectEmpty.textContent = text;
  objectEmpty.hidden = false;
  objectContent.hidden = true;
}

// текст загрузки
function showLoading() {
  showInfoText("Загружаю объекты...");
  placesList.innerHTML = `<div class="empty_text">Загружаю объекты...</div>`;
  mapNote.textContent = "Загрузка читаю файл data/objects.json";
  placeCount.textContent = "0 объектов";
}

// ошибка загрузки
function showLoadError() {
  showInfoText("Не получилось загрузить объекты");
  placesList.innerHTML = `<div class="empty_text">Ошибка загрузки data/objects.json</div>`;
  mapNote.textContent = "Ошибка проверьте файл data/objects.json";
  clearMarkers();
  placeCount.textContent = "0 объектов";
}

// загрузка объектов
function loadPlaces() {
  showLoading();

  fetch("data/objects.json")
    .then(function (response) {
      return response.json();
    })
    .then(function (apiObjects) {
      if (!Array.isArray(apiObjects)) {
        apiObjects = [];
      }

      let newPlaces = [];

      for (let apiPlace of apiObjects) {
        newPlaces.push(makePlace(apiPlace));
      }

      places = newPlaces;

      if (places.length > 0) {
        activePlaceId = places[0].id;
      }

      showPage();
    })
    .catch(function () {
      showLoadError();
    });
}

// категории
function getCategory(type) {
  for (let category of categories) {
    if (category.type === type) {
      return category;
    }
  }

  return categories[0];
}

function getTypeClass(type) {
  return "type-" + apiTypeToFrontType(type);
}

// район по id
function getArea(id) {
  for (let area of areas) {
    if (area.id === id) {
      return area;
    }
  }

  return areas[0];
}

// фильтрация
function getVisiblePlaces() {
  let result = [];

  for (let place of places) {
    let sameArea = place.area === activeArea;

    let sameType = activeType === "all" || place.type === activeType;

    let fullText = place.name + " " + place.address + " " + place.text;

    let sameSearch = fullText.toLowerCase().includes(searchText);

    if (sameArea && sameType && sameSearch) {
      result.push(place);
    }
  }

  return result;
}

// выбранная точка
function getActivePlace(list) {
  for (let place of list) {
    if (place.id === activePlaceId) {
      return place;
    }
  }

  if (list.length > 0) {
    activePlaceId = list[0].id;
    return list[0];
  }

  activePlaceId = null;
  return null;
}

// фильтры
function showFilterButtons() {
  for (let button of filterButtonList) {
    button.classList.toggle("active", button.dataset.type === activeType);
  }
}

// кнопки районов
function showAreas() {
  let area = getArea(activeArea);
  let buttons = areaButtons.querySelectorAll("button");

  mapTitle.textContent = area.title;
  mapText.textContent = area.text;

  for (let button of buttons) {
    button.classList.toggle("active", button.dataset.area === activeArea);
  }
}

// список объектов
function showPlacesList(list) {
  placeCount.textContent = list.length + " объектов";

  if (list.length === 0) {
    placesList.innerHTML = `<div class="empty_text">Ничего не найдено попробуйте другой поиск</div>`;
    return;
  }

  let html = "";

  for (let place of list) {
    let category = getCategory(place.type);
    let typeClass = getTypeClass(place.type);
    let activeClass = "";

    // active для выбранной карточки
    if (place.id === activePlaceId) {
      activeClass = "active";
    }

    html += `
      <button
        class="place_card ${typeClass} ${activeClass}"
        type="button"
        data-id="${place.id}"
      >
        <h3>${place.name}</h3>
        <p>${place.address}</p>
        <span class="place_distance">${category.name}</span>
      </button>
    `;
  }

  placesList.innerHTML = html;
}

// карточка объекта
function showInfoCard(place) {
  if (place === null) {
    showInfoText("Ничего не выбрано");
    return;
  }

  let category = getCategory(place.type);

  objectEmpty.hidden = true;
  objectContent.hidden = false;

  objectCategory.textContent = category.name;
  objectCategory.className = "info_type " + getTypeClass(place.type);
  objectName.textContent = place.name;
  objectDescription.textContent = place.text;
  objectAddress.textContent = category.name + " · " + place.address;
  objectDistance.textContent = "не считается";
  objectTime.textContent = "не считается";
}

// подпись карты
function showMapNote(place) {
  if (place === null) {
    mapNote.textContent = "Ничего не выбрано измените поиск или фильтр";
    return;
  }

  let category = getCategory(place.type);

  mapNote.textContent = place.name + " · " + category.name + " · " + place.address;
}

// обновить страницу
function showPage() {
  // видимые точки
  let visiblePlaces = getVisiblePlaces();

  // активная точка
  let activePlace = getActivePlace(visiblePlaces);

  // перерисовка блоков
  showFilterButtons();
  showAreas();
  showPlacesList(visiblePlaces);
  showInfoCard(activePlace);
  showMapMarkers(visiblePlaces);
  showMapNote(activePlace);
}

// выбрать объект
function choosePlace(id) {
  activePlaceId = id;

  let visiblePlaces = getVisiblePlaces();
  let activePlace = getActivePlace(visiblePlaces);

  showPlacesList(visiblePlaces);
  showInfoCard(activePlace);
  showMapNote(activePlace);
}

// выбрать категорию
function chooseType(type) {
  activeType = type;

  // очистить поиск
  searchText = "";
  searchInput.value = "";
  showPage();
  resetMapView();
}

// выбрать район
function chooseArea(area) {
  activeArea = area;

  // сбросить категорию
  activeType = "all";

  // сбросить выбранный объект
  activePlaceId = null;

  // очистить поиск
  searchText = "";
  searchInput.value = "";
  showPage();
  resetMapView();
}

// поиск
searchInput.addEventListener("input", function () {
  searchText = searchInput.value.trim().toLowerCase();
  showPage();
  resetMapView();
});

// фильтры
for (let button of filterButtonList) {
  button.addEventListener("click", function () {
    chooseType(button.dataset.type);
  });
}

// клик по району
areaButtons.addEventListener("click", function (event) {
  let button = event.target.closest("button");

  if (button === null) {
    return;
  }

  chooseArea(button.dataset.area);

  // листать к карте
  mapBox.scrollIntoView({ behavior: "smooth", block: "center" });
});

// клик по нижней карточке
placesList.addEventListener("click", function (event) {
  let button = event.target.closest("button");

  if (button === null) {
    return;
  }

  // сохранить id
  choosePlace(Number(button.dataset.id));
  centerMapOnPlace(getPlaceById(activePlaceId));
});

// кнопка показать на карте
infoCard.addEventListener("click", function (event) {
  let button = event.target.closest("[data-action]");

  if (button === null) {
    return;
  }

  mapBox.scrollIntoView({ behavior: "smooth", block: "center" });
  centerMapOnPlace(getPlaceById(activePlaceId));
  mapBox.classList.add("light");

  // убрать подсветку
  setTimeout(function () {
    mapBox.classList.remove("light");
  }, 900);
});

// кнопка сбросить
resetButton.addEventListener("click", function () {
  chooseType("all");
});

// запуск проекта
function startProject() {
  if (typeof ymaps === "undefined") {
    loadPlaces();
    return;
  }

  ymaps.ready(function () {
    startMap();
    loadPlaces();
  });
}

// запуск
startProject();
