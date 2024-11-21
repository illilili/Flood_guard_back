const express = require("express");
const cors = require("cors"); // CORS 추가
const { Pool } = require("pg");
const webPush = require("web-push");
const app = express();
app.use(cors({ origin: "*" })); // 모든 도메인에 대해 허용
app.use(express.json());

const vapidKeys = {
  publicKey:
    "BOr1ZRzOF7UEGY4ylBTfjC6sCUBJuH71QVI_NB_OK3L4DfrHxI5pvbRVmRrcTm8W2s_V-nWxDyidcxEVlk_igwA",
  privateKey: "sm1fHToM94BoQ24wrsHUFpRdM9Zb9yhS-ApsZ6W_i9w",
};

webPush.setVapidDetails(
  "mailto:example@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Render에서 SSL을 사용하는 경우 필요
  },
});

pool.on("error", (err, client) => {
  console.error("Unexpected database error:", err);
});

let subscriptions = [];

// 구독 정보 저장
app.post("/api/save-subscription", (req, res) => {
  const subscription = req.body;

  // 중복 방지
  if (!subscriptions.find((sub) => sub.endpoint === subscription.endpoint)) {
    subscriptions.push(subscription);
    console.log("Subscription saved:", subscription);
  }

  res.status(201).json({ message: "Subscription saved successfully." });
});

// 테스트용 푸시 알림 전송 API
app.post("/api/send-notification", (req, res) => {
  const { title, body } = req.body;

  subscriptions.forEach((subscription) => {
    const payload = JSON.stringify({ title, body });

    webPush
      .sendNotification(subscription, payload)
      .then(() => {
        console.log("Notification sent to:", subscription.endpoint);
      })
      .catch((error) => {
        console.error("Error sending notification:", error);
      });
  });

  res.status(200).json({ message: "Notifications sent successfully." });
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
       WHERE ST_Contains(
       location,
       ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 3857)
       )`, // EPSG:3857로 설정
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

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3000");
});
