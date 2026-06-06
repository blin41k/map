import json
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path

from flask import Flask, jsonify, request


app = Flask(__name__)

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "objects.json"


def load_objects():
    """
    Загружает объекты из JSON-файла.
    """
    if not DATA_FILE.exists():
        return []

    with open(DATA_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def success_response(data, count=None):
    """
    Единый формат успешного ответа API.
    """
    response = {
        "status": "success",
        "data": data
    }

    if count is not None:
        response["count"] = count

    return jsonify(response)


def error_response(message, status_code=400):
    """
    Единый формат ответа с ошибкой.
    """
    return jsonify({
        "status": "error",
        "message": message
    }), status_code


def calculate_distance(lat1, lng1, lat2, lng2):
    """
    Считает расстояние между двумя точками по координатам.
    Возвращает расстояние в километрах.
    """
    earth_radius = 6371

    lat1 = radians(lat1)
    lng1 = radians(lng1)
    lat2 = radians(lat2)
    lng2 = radians(lng2)

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = (
        sin(dlat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius * c


def get_float_arg(name):
    """
    Получает числовой параметр из URL.
    Если параметра нет или он неправильный — возвращает None.
    """
    value = request.args.get(name)

    if value is None:
        return None

    try:
        return float(value)
    except ValueError:
        return None


@app.route("/")
def index():
    """
    Стартовая страница backend.
    """
    return success_response({
        "message": "Backend работает",
        "objects": "/api/objects",
        "categories": "/api/categories",
        "distance": "/api/distance",
        "nearby": "/api/nearby"
    })


@app.route("/api/objects", methods=["GET"])
def get_objects():
    """
    Возвращает список объектов.

    Параметры:
    category — фильтр по категории
    search — поиск по названию, адресу и описанию
    sort — сортировка: name, category, id
    """
    objects = load_objects()

    category = request.args.get("category")
    search = request.args.get("search", "").lower().strip()
    sort_by = request.args.get("sort", "id")

    if category:
        categories = [
            item.strip()
            for item in category.split(",")
            if item.strip()
        ]

        objects = [
            obj for obj in objects
            if obj.get("category") in categories
        ]

    if search:
        objects = [
            obj for obj in objects
            if search in obj.get("name", "").lower()
            or search in obj.get("address", "").lower()
            or search in obj.get("description", "").lower()
            or search in obj.get("category_ru", "").lower()
        ]

    if sort_by == "name":
        objects.sort(key=lambda obj: obj.get("name", ""))
    elif sort_by == "category":
        objects.sort(key=lambda obj: obj.get("category", ""))
    else:
        objects.sort(key=lambda obj: obj.get("id", 0))

    return success_response(objects, count=len(objects))


@app.route("/api/objects/<int:object_id>", methods=["GET"])
def get_object_by_id(object_id):
    """
    Возвращает один объект по ID.
    """
    objects = load_objects()

    for obj in objects:
        if obj.get("id") == object_id:
            return success_response(obj)

    return error_response("Объект не найден", 404)


@app.route("/api/categories", methods=["GET"])
def get_categories():
    """
    Возвращает список категорий с количеством объектов.
    """
    objects = load_objects()
    categories = {}

    for obj in objects:
        category = obj.get("category")
        category_ru = obj.get("category_ru", category)

        if category not in categories:
            categories[category] = {
                "category": category,
                "category_ru": category_ru,
                "count": 0
            }

        categories[category]["count"] += 1

    result = sorted(
        categories.values(),
        key=lambda item: item["category_ru"]
    )

    return success_response(result, count=len(result))


@app.route("/api/distance", methods=["GET"])
def get_distance():
    """
    Считает расстояние между двумя точками.

    Пример:
    /api/distance?from_lat=55.763493&from_lng=37.662039&to_lat=55.760023&to_lng=37.661795
    """
    from_lat = get_float_arg("from_lat")
    from_lng = get_float_arg("from_lng")
    to_lat = get_float_arg("to_lat")
    to_lng = get_float_arg("to_lng")

    if None in [from_lat, from_lng, to_lat, to_lng]:
        return error_response(
            "Нужно передать корректные параметры: from_lat, from_lng, to_lat, to_lng",
            400
        )

    distance = calculate_distance(from_lat, from_lng, to_lat, to_lng)

    return success_response({
        "from": {
            "lat": from_lat,
            "lng": from_lng
        },
        "to": {
            "lat": to_lat,
            "lng": to_lng
        },
        "distance_km": round(distance, 2),
        "distance_m": round(distance * 1000)
    })


@app.route("/api/nearby", methods=["GET"])
def get_nearby_objects():
    """
    Возвращает объекты рядом с выбранной точкой.

    Пример:
    /api/nearby?lat=55.763493&lng=37.662039&radius=1
    """
    user_lat = get_float_arg("lat")
    user_lng = get_float_arg("lng")
    radius = get_float_arg("radius")

    if radius is None:
        radius = 1

    if None in [user_lat, user_lng]:
        return error_response(
            "Нужно передать корректные параметры: lat и lng",
            400
        )

    objects = load_objects()
    result = []

    for obj in objects:
        obj_lat = obj.get("lat")
        obj_lng = obj.get("lng")

        if obj_lat is None or obj_lng is None:
            continue

        distance = calculate_distance(
            user_lat,
            user_lng,
            obj_lat,
            obj_lng
        )

        if distance <= radius:
            obj_copy = obj.copy()
            obj_copy["distance_km"] = round(distance, 2)
            obj_copy["distance_m"] = round(distance * 1000)
            result.append(obj_copy)

    result.sort(key=lambda obj: obj["distance_km"])

    return success_response(result, count=len(result))


@app.route("/api/route", methods=["GET"])
def get_route_data():
    """
    Подготавливает данные для маршрута.
    Сам маршрут можно строить на фронтенде.
    """
    from_lat = get_float_arg("from_lat")
    from_lng = get_float_arg("from_lng")
    to_lat = get_float_arg("to_lat")
    to_lng = get_float_arg("to_lng")

    if None in [from_lat, from_lng, to_lat, to_lng]:
        return error_response(
            "Нужно передать корректные параметры: from_lat, from_lng, to_lat, to_lng",
            400
        )

    distance = calculate_distance(from_lat, from_lng, to_lat, to_lng)

    return success_response({
        "from": {
            "lat": from_lat,
            "lng": from_lng
        },
        "to": {
            "lat": to_lat,
            "lng": to_lng
        },
        "distance_km": round(distance, 2),
        "distance_m": round(distance * 1000)
    })


@app.route("/api/stats", methods=["GET"])
def get_stats():
    """
    Возвращает статистику по объектам.
    Можно использовать для отладки или для блока на сайте.
    """
    objects = load_objects()

    categories = {}

    for obj in objects:
        category = obj.get("category", "other")
        categories[category] = categories.get(category, 0) + 1

    return success_response({
        "total_objects": len(objects),
        "categories": categories
    })


@app.errorhandler(404)
def not_found(error):
    return error_response("Страница или API-метод не найден", 404)


@app.errorhandler(500)
def server_error(error):
    return error_response("Внутренняя ошибка сервера", 500)


if __name__ == "__main__":
    app.run(debug=True)
