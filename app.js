const express = require("express");
const cors = require("cors"); // CORS 추가
const { Pool } = require("pg");

const app = express();
app.use(cors({ origin: "*" })); // 모든 도메인에 대해 허용
app.use(express.json());

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "flood_prevention",
  password: "1114",
  port: 5432,
});

// 침수 이력 구역 좌표 저장 API
app.post("/api/saveFloodArea", async (req, res) => {
  const { coordinates } = req.body;

  try {
    // coordinates를 다각형 형태로 변환
    const polygon = `POLYGON((${coordinates
      .map((coord) => `${coord[0]} ${coord[1]}`)
      .join(", ")}))`;

    await pool.query(
      "INSERT INTO flood_history (location) VALUES (ST_GeomFromText($1, 4326))",
      [polygon]
    );
    res.status(200).send("Flood area saved successfully.");
  } catch (error) {
    console.error("Error saving flood area:", error);
    res.status(500).send("Failed to save flood area.");
  }
});

app.post("/api/checkFloodHistory", async (req, res) => {
  const { lat, lon } = req.body;
  console.log("Received coordinates:", lat, lon);

  try {
    const result = await pool.query(
      `SELECT id FROM flood_history
           WHERE ST_Contains(location, ST_SetSRID(ST_MakePoint($1, $2), 3857))`, // EPSG:3857로 설정
      [lon, lat]
    );

    console.log("Query result:", result.rows);

    if (result.rows.length > 0) {
      res.status(200).json({ floodHistory: true });
    } else {
      res.status(200).json({ floodHistory: false });
    }
  } catch (error) {
    console.error("Error checking flood history:", error);
    res.status(500).send("Error checking flood history.");
  }
});

app.post("/api/getFloodThresholds", async (req, res) => {
  const { lat, lon } = req.body;

  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    isNaN(lat) ||
    isNaN(lon)
  ) {
    console.error("Invalid coordinates received:", lat, lon);
    return res.status(400).json({
      error:
        "Invalid coordinates provided. Please provide valid latitude and longitude.",
    });
  }

  console.log("Received coordinates for threshold query:", lat, lon);

  try {
    // 1단계: 좌표 범위 내에 포함되는지 확인
    const rangeQuery = `
      SELECT depth_10, depth_20, depth_50
      FROM flood_rainfall_thresholds
      WHERE lat_min <= $1 AND lat_max >= $1
        AND lon_min <= $2 AND lon_max >= $2
      LIMIT 1;
    `;
    let result = await pool.query(rangeQuery, [lat, lon]);

    if (result.rows.length > 0) {
      console.log("Found threshold data within range:", result.rows[0]);
      return res.status(200).json(result.rows[0]);
    }

    // 2단계: 범위 내에 해당하지 않는 경우 가장 가까운 위치 선택
    const nearestQuery = `
      SELECT depth_10, depth_20, depth_50,
             SQRT(POW((lat_min + lat_max) / 2 - $1, 2) + POW((lon_min + lon_max) / 2 - $2, 2)) AS distance
      FROM flood_rainfall_thresholds
      ORDER BY distance
      LIMIT 1;
    `;
    result = await pool.query(nearestQuery, [lat, lon]);

    if (result.rows.length > 0) {
      console.log("Found nearest threshold data:", result.rows[0]);
      return res.status(200).json(result.rows[0]);
    } else {
      console.log(
        "No matching or nearby threshold found for the given location."
      );
      return res.status(404).json({
        depth_10: null,
        depth_20: null,
        depth_50: null,
      });
    }
  } catch (error) {
    console.error("Error executing the query:", error);
    res.status(500).send("Error fetching flood thresholds.");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
