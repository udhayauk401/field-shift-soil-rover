# FIELD SHIFT ROVER

## MongoDB readings database

The dashboard stores sensor history in MongoDB through the local Node API. MongoDB must be running before starting the API.

Install the Node dependencies:

```powershell
npm install
```

Copy `.env.example` to `.env` if you need to change the MongoDB URI, database name, or API port. The defaults use the local MongoDB service, database `field_shift_rover`, and API port `3001`.

Start the MongoDB-backed readings API:

```powershell
npm start
```

In another terminal, start the static dashboard from the project folder:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. The API is available at `http://localhost:3001/readings`; `GET` returns readings and `POST` saves one. If the MongoDB `readings` collection is empty, the API imports existing records from `db.json` once. The JSON file is retained as the migration source.
