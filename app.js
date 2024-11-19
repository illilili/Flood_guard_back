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

pool.on("error", (err, client) => {
  console.error("Unexpected database error:", err);
});

// 주차 위치 등록 API
app.post("/api/registerParking", async (req, res) => {
  console.log("Request body:", req.body); // 로그 추가
  const { userUUID, lat, lon } = req.body;

  if (!userUUID || typeof lat !== "number" || typeof lon !== "number") {
    console.error("Invalid input data:", req.body); // 로그 추가
    return res.status(400).json({ error: "Invalid input data" });
  }

  res.status(200).json({
    success: true,
    message: "Parking location registered.",
    parkingData: { lat, lon },
  });
});

// 침수 이력 확인 API
app.post("/api/checkFloodHistory", async (req, res) => {
  const { lat, lon } = req.body;

  if (typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "Invalid coordinates." });
  }

  try {
    // 침수 이력 확인
    const floodResult = await pool.query(
      `SELECT id FROM flood_history
       WHERE ST_Contains(location, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
      [lon, lat]
    );

    res.status(200).json({ floodHistory: floodResult.rows.length > 0 });
  } catch (error) {
    console.error("Error checking flood history:", error);
    res.status(500).send("Error checking flood history.");
  }
});

// 침수 유발 강우량 정보 가져오기 API
app.post("/api/getFloodThresholds", async (req, res) => {
  const { lat, lon } = req.body;

  if (typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "Invalid coordinates." });
  }

  try {
    // 1단계: 범위 내 임계값 확인
    const rangeQuery = `
      SELECT depth_10, depth_20, depth_50
      FROM flood_rainfall_thresholds
      WHERE lat_min <= $1 AND lat_max >= $1
        AND lon_min <= $2 AND lon_max >= $2
      LIMIT 1;
    `;
    let result = await pool.query(rangeQuery, [lat, lon]);

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    }

    // 2단계: 가장 가까운 데이터 조회
    const nearestQuery = `
      SELECT depth_10, depth_20, depth_50,
      SQRT(POW((lat_min + lat_max) / 2 - $1, 2) + POW((lon_min + lon_max) / 2 - $2, 2)) AS distance
      FROM flood_rainfall_thresholds
      ORDER BY distance
      LIMIT 1;
    `;
    result = await pool.query(nearestQuery, [lat, lon]);

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    } else {
      return res.status(404).json({
        depth_10: null,
        depth_20: null,
        depth_50: null,
      });
    }
  } catch (error) {
    console.error("Error fetching flood thresholds:", error);
    res.status(500).send("Error fetching flood thresholds.");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
